/**
 * Search 命令 - 按标签/文件名搜索图片
 * 支持 --json / --stream 协议；优先复用 organize 写出的缓存加速
 * 支持 --thumbs 缩略图（与 organize 共享 thumb-cache）
 */
import * as path from 'path';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import pLimit from 'p-limit';
import { scanFolder, type ScannedFile } from '../scanner.js';
import { clipTag, type ClipTag } from '../clip.js';
import { heuristicTag } from '../heuristics.js';
import { extractExif } from '../exif.js';
import { makeThumbnail } from '../thumbnail.js';
import { emit, progressEvent, errorEvent } from '../protocol.js';

type SearchOptions = {
  json?: boolean;
  stream?: boolean;
  cache?: string;
  noCache?: boolean;
  thumbs?: boolean;
  thumbSize?: string;
  thumbCache?: string;
  concurrency?: string;
  // 性能开关：默认 true = 跑 CLIP 识别（准确但慢），false = 仅文件名 + 启发式
  withClip?: boolean;
};

type CacheEntry = { mtimeMs: number; size: number; tags: string[]; clipTags: ClipTag[] };
type CacheFile = { version: 1; entries: Record<string, CacheEntry> };

async function loadCache(cachePath: string): Promise<CacheFile> {
  try {
    const buf = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(buf);
    if (parsed?.version === 1) return parsed as CacheFile;
  } catch {}
  return { version: 1, entries: {} };
}

function cacheKey(file: ScannedFile): string {
  return crypto.createHash('sha1').update(file.path).digest('hex');
}

export async function search(folder: string, query: string, options: SearchOptions = {}): Promise<void> {
  const {
    json = false,
    stream = false,
    cache: cachePath,
    noCache = false,
    thumbs = false,
    thumbSize = '240',
    thumbCache: thumbCachePath,
    concurrency = '4',
    withClip = false,  // 默认 false：仅文件名 + 启发式（秒出）；要 CLIP 加 --with-clip
  } = options;
  const q = query.toLowerCase();
  const thumbSizeNum = parseInt(thumbSize, 10);
  const concurrencyNum = Math.max(1, parseInt(concurrency, 10) || 4);

  // 关键：注册 uncaughtException 兜底，与 organize 行为一致
  const uncaughtHandler = (err: Error) => {
    try { emit({ type: 'error', message: `uncaught: ${err?.message || err}` }); } catch {}
    try { process.exit(1); } catch {}
  };
  const unhandledRejectionHandler = (reason: any) => {
    try { emit({ type: 'error', message: `unhandled rejection: ${reason?.message || reason}` }); } catch {}
  };
  process.on('uncaughtException', uncaughtHandler);
  process.on('unhandledRejection', unhandledRejectionHandler);

  const say = (msg: string) => {
    if (json && stream) emit({ type: 'log', level: 'info', message: msg });
    else if (!json) console.log(`🔍 ${msg}`);
  };

  say(`正在搜索: "${query}"`);

  const files = await scanFolder(folder, { recursive: true });
  // 自动检测 cache 路径：<folder>/organized/.photo-vault-cache.json（如果存在）
  // 这样 search 默认就能复用 organize 写的缓存
  let effectiveCachePath = cachePath;
  if (!effectiveCachePath && !noCache) {
    const defaultCache = path.join(folder, 'organized', '.photo-vault-cache.json');
    try {
      await fs.access(defaultCache);
      effectiveCachePath = defaultCache;
      if (json && stream) emit({ type: 'log', level: 'info', message: `自动检测到 cache: ${defaultCache}` });
    } catch {}
  }
  const cache = (!noCache && effectiveCachePath) ? await loadCache(effectiveCachePath) : { version: 1, entries: {} } as CacheFile;

  const limit = pLimit(concurrencyNum);
  const results: any[] = [];

  // 第一阶段：先找出所有匹配的文件（CPU 轻量）
  const matches: Array<{ file: ScannedFile; matchType: 'filename' | 'tag'; hTags: string[]; cTags: ClipTag[] }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (json && stream) progressEvent('scan', i + 1, files.length, file.name);

    // 1) 文件名匹配
    if (file.name.toLowerCase().includes(q)) {
      matches.push({ file, matchType: 'filename', hTags: [], cTags: [] });
      continue;
    }

    // 2) 标签匹配（先从缓存读，没命中再算）
    const key = cacheKey(file);
    const cached = cache.entries[key];
    let hTags: string[];
    let cTags: ClipTag[];

    if (cached && cached.mtimeMs === file.mtime.getTime() && cached.size === file.size) {
      hTags = cached.tags;
      cTags = cached.clipTags;
    } else {
      try {
        const exif = await extractExif(file.path);
        hTags = await heuristicTag(file, exif);
      } catch (e) {
        hTags = [];
        if (json && stream) errorEvent(`EXIF/heuristic failed for ${file.name}: ${e}`);
      }
      // CLIP 推理：默认关闭（太慢），通过 --with-clip 启用
      // 缓存命中时不跑（已经存了）
      if (withClip) {
        try {
          cTags = await clipTag(file.path);
        } catch (e) {
          cTags = [];
          if (json && stream) errorEvent(`CLIP failed for ${file.name}: ${e}`);
        }
      } else {
        cTags = [];
      }
      // 写回缓存（与 organize 兼容）
      cache.entries[cacheKey(file)] = {
        mtimeMs: file.mtime.getTime(),
        size: file.size,
        tags: hTags,
        clipTags: cTags,
      };
    }

    const allTags = [...hTags, ...cTags.map(t => t.label)];
    if (allTags.some(tag => tag.toLowerCase().includes(q))) {
      matches.push({ file, matchType: 'tag', hTags, cTags });
    }
  }

  say(`找到 ${matches.length} 个匹配项${thumbs ? '，生成缩略图...' : ''}`);

  // 第二阶段：缩略图（开启时）+ 装配结果
  if (thumbs) {
    const thumbLimit = pLimit(concurrencyNum);
    const thumbResults = await Promise.allSettled(
      matches.map((m) => thumbLimit(async () => {
        try {
          const t = await makeThumbnail(m.file.path, {
            size: thumbSizeNum,
            cacheDir: thumbCachePath,
            noCache,
          });
          return t;
        } catch (e) {
          if (json && stream) errorEvent(`thumbnail failed for ${m.file.name}: ${e}`);
          return null;
        }
      }))
    );

    matches.forEach((m, idx) => {
      const settled = thumbResults[idx];
      const thumb = (settled.status === 'fulfilled' ? settled.value : null) as Awaited<ReturnType<typeof makeThumbnail>> | null;
      results.push({
        path: m.file.path,
        name: m.file.name,
        matchType: m.matchType,
        tags: [...m.hTags, ...m.cTags.map(t => t.label)],
        clipScores: m.cTags,
        thumbnail: thumb ? {
          dataUrl: thumb.dataUrl,
          width: thumb.width,
          height: thumb.height,
          source: thumb.source,
        } : undefined,
      });
    });
  } else {
    matches.forEach((m) => {
      results.push({
        path: m.file.path,
        name: m.file.name,
        matchType: m.matchType,
        tags: [...m.hTags, ...m.cTags.map(t => t.label)],
        clipScores: m.cTags,
      });
    });
  }

  if (json && stream) {
    emit({ type: 'result', command: 'search', data: { query, count: results.length, results } });
  } else if (!json) {
    console.log(`\n找到 ${results.length} 个匹配结果：\n`);
    results.forEach((r: any) => {
      console.log(`- ${r.name} (${r.matchType})`);
      if (r.tags?.length) console.log(`  标签: ${r.tags.join(', ')}`);
    });
  }

  // 写回缓存（仅当 cache 路径已确定且没禁用）
  if (effectiveCachePath && !noCache) {
    try {
      await fs.mkdir(path.dirname(effectiveCachePath), { recursive: true });
      await fs.writeFile(effectiveCachePath, JSON.stringify(cache));
    } catch (e) {
      if (json && stream) errorEvent(`cache write failed: ${e}`);
    }
  }

  // 关键：json+stream 模式下显式 exit
  // 否则 GUI 永远等不到 close 事件
  process.off('uncaughtException', uncaughtHandler);
  process.off('unhandledRejection', unhandledRejectionHandler);

  if (json && stream) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try { process.exit(0); } catch {}
  }
}
