/**
 * Organize 命令 - 智能归类（支持 date / clip / heuristic 模式 + JSON 协议 + 并行 + 缓存）
 */
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import { createInterface } from 'readline';
import pLimit from 'p-limit';
import { scanFolder, type ScannedFile } from '../scanner.js';
import { clipTag, type ClipTag, isModelDownloaded } from '../clip.js';
import { extractExif, type ExifData } from '../exif.js';
import { heuristicTag } from '../heuristics.js';
import { translateTags, translateTagsWithMeta } from '../i18n.js';
import { makeThumbnail } from '../thumbnail.js';
import { emit, logEvent, progressEvent, resultEvent, errorEvent } from '../protocol.js';

type OrganizeOptions = {
  output?: string;
  mode?: string;
  dryRun?: boolean;
  apply?: boolean;
  threshold?: string;
  limit?: string;
  skip?: string[];
  json?: boolean;
  stream?: boolean;
  cache?: string;
  noCache?: boolean;
  thumbs?: boolean;
  thumbSize?: string;
  thumbCache?: string;
  concurrency?: string;
  profile?: boolean;          // v0.8+: 输出性能指标
    zhOverrides?: string;       // v0.9.1+: 用户级翻译覆盖文件路径
  };

type FilePlan = {
  source: string;
  name: string;
  tags: string[];                          // v0.9+: 原始英文 tag（机器用）
  tagsZh: string[];                        // v0.9+: 中文显示名（GUI 用）
  untranslatedTags: string[];              // v0.9.1+: 未翻译英文（GUI 提示）
  clipTags: ClipTag[];
  targetFolder: string;
  targetPath: string;
  dateFolder: string;                    // yyyy-MM-dd（GUI 显示）
  dateSource?: 'exif' | 'mtime';         // v0.7+: 日期来源（EXIF 优先）
  exif: ExifData | null;                 // v0.7+: 完整 EXIF（GUI 可展示相机型号等）
  thumbnail?: {
    dataUrl: string;
    width: number;
    height: number;
    source: 'exif' | 'resize' | 'cache' | 'heic-decode';   // v0.9+
  };
};

function isClipMode(mode?: string) { return mode === 'clip' || mode === 'combined'; }
function isHeuristicMode(mode?: string) { return mode === 'heuristic' || mode === 'combined'; }
function isDateMode(mode?: string) { return mode === 'date'; }

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(chalk.yellow(message + ' (y/N): '), answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/* ---------------- 缓存 ---------------- */

type CacheEntry = {
  mtimeMs: number;
  size: number;
  exifDateMs?: number;     // v0.7+: EXIF DateTimeOriginal 时间戳（用于 dateFolder）
  tags: string[];
  clipTags: ClipTag[];
};
type CacheFile = { version: 2; entries: Record<string, CacheEntry> };

async function loadCache(cachePath: string): Promise<CacheFile> {
  try {
    const buf = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(buf);
    // v0.7 起 version 升到 2（加入 exifDateMs 字段），旧 v1 cache 不兼容
    if (parsed?.version === 2) return parsed as CacheFile;
  } catch {}
  return { version: 2, entries: {} };
}

async function saveCache(cachePath: string, cacheData: CacheFile): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cacheData));
}

/**
 * v0.8+: 收集性能指标（--profile）
 *  返回内存峰值（MB）、CPU 时间
 */
function collectProfile(t0: number, total: number, cacheHits: number): {
  wallMs: number;
  cpuMs: number;
  rssPeakMB: number;
  cacheHitRate: string;
  throughput: string;
} {
  const wall = Date.now() - t0;
  const cpu = process.cpuUsage().user / 1000 + process.cpuUsage().system / 1000;
  const rssMB = process.memoryUsage().rss / 1024 / 1024;
  const hitRate = total > 0 ? ((cacheHits / total) * 100).toFixed(1) : '0';
  const tps = wall > 0 ? (total / (wall / 1000)).toFixed(1) : '0';
  return {
    wallMs: wall,
    cpuMs: Math.round(cpu),
    rssPeakMB: Math.round(rssMB * 10) / 10,
    cacheHitRate: `${hitRate}%`,
    throughput: `${tps} files/s`,
  };
}

function fileCacheKey(file: ScannedFile): string {
  return crypto.createHash('sha1').update(file.path).digest('hex');
}

/**
 * 解析 EXIF DateTimeOriginal 字符串 → Date
 * exifr 输出格式可能是：
 *   - "2024:01:15 14:30:45" (EXIF 原始格式)
 *   - Date 对象（如果配置了）
 * 失败返回 null，调用方 fallback 到 mtime
 */
function parseExifDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    // EXIF 原格式: "YYYY:MM:DD HH:MM:SS"
    const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * 从 Date 提取 yyyy-MM / yyyy-MM-dd 字符串
 */
function formatDate(date: Date, granularity: 'month' | 'day' = 'day'): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  if (granularity === 'month') return `${y}-${m}`;
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ---------------- 主流程 ---------------- */

export async function organize(folder: string, options: OrganizeOptions = {}) {
  // 关键：注册 uncaughtException 兜底，避免 sharp/libvips 抛出未捕获错误 kill 进程
  // 且导致 fd 未关闭（GUI 看到 "Closing file descriptor on garbage collection"）
  const uncaughtHandler = (err: Error) => {
    try {
      errorEvent(`uncaught: ${err?.message || err}`);
    } catch {}
    try { process.exit(1); } catch {}
  };
  const unhandledRejectionHandler = (reason: any) => {
    try {
      errorEvent(`unhandled rejection: ${reason?.message || reason}`);
    } catch {}
  };
  process.on('uncaughtException', uncaughtHandler);
  process.on('unhandledRejection', unhandledRejectionHandler);

  const output = options.output ?? path.join(folder, 'organized');
  const mode = options.mode ?? 'combined';
  const apply = options.apply ?? false;
  const threshold = options.threshold ?? '0.1';
  const limitOpt = options.limit ?? '0';
  const skip = options.skip ?? [];
  const json = options.json ?? false;
  const stream = options.stream ?? false;
  const concurrency = options.concurrency ?? '2';
  const cachePath = options.cache ?? path.join(output, '.photo-vault-cache.json');
  const noCache = options.noCache ?? false;
  const thumbs = options.thumbs ?? false;
  const thumbSize = parseInt(options.thumbSize ?? '240', 10);
  const thumbCachePath = options.thumbCache ?? path.join(output, '.thumb-cache');
  const profile = options.profile ?? false;       // v0.8+: 输出性能指标
    const zhOverrides = options.zhOverrides ?? '';  // v0.9.1+: 用户翻译覆盖文件

    // v0.9.1: 让 i18n 模块知道 overrides 路径
    if (zhOverrides && zhOverrides.length > 0) {
      try {
        const { setOverridePath } = await import('../i18n.js');
        setOverridePath(zhOverrides);
      } catch {}
    }

    const thresholdNum = parseFloat(threshold);
  const limitNum = parseInt(limitOpt, 10);
  const concurrencyNum = Math.max(1, parseInt(concurrency, 10) || 2);

  // 友好的 cli 输出
  const say = (color: typeof chalk, msg: string) => {
    if (json && stream) logEvent('info', msg);
    else if (!json) console.log(color(msg));
  };
  const err = (msg: string) => {
    if (json) errorEvent(msg);
    else console.error(chalk.red(msg));
  };

  say(chalk.cyan, '\n📸 Photo Vault - 开始整理\n');

  if (isClipMode(mode) && !isModelDownloaded()) {
    say(chalk.yellow, '⚠️  CLIP 模型尚未下载，AI 识别功能将不可用\n');
  }

  // 1) 扫描
  if (json && stream) progressEvent('scan', 0, 0);
  else if (!json) ora('正在扫描文件夹...').start();
  const t0 = Date.now();
  const files = await scanFolder(folder, { recursive: true, skip });
  say(chalk.green, `✅ 扫描完成，共发现 ${files.length} 个文件`);
  if (json && stream) progressEvent('scan', files.length, files.length);
  if (limitNum > 0) files.splice(limitNum);

  // 2) 加载缓存
  const cacheData: CacheFile = noCache ? { version: 2, entries: {} } : await loadCache(cachePath);
  let cacheHits = 0;

  // 3) 并行分析
  const limit = pLimit(concurrencyNum);
  const plans: FilePlan[] = new Array(files.length);
  const total = files.length;
  let done = 0;

  const spinner = (!json && !stream) ? ora('正在分析文件...').start() : null;

  const analyze = async (file: ScannedFile, idx: number) => {
    try {
      const key = fileCacheKey(file);
      const cached = cacheData.entries[key];
      let heuristicTags: string[] = [];
      let filteredClip: ClipTag[] = [];
      let exifDateMs: number | undefined = undefined;
      let exif: ExifData | null = null;
      let dateSource: 'exif' | 'mtime' = 'mtime';

      // 缓存命中条件：mtime + size 都没变
      // 注：exifDateMs 是从 EXIF 解析出来的，不直接进 cache key（EXIF 时间理论上不会改）
      // 但如果 EXIF 损坏前后不同，cache 命中会复用旧 dateSource（最稳）
      if (cached && cached.mtimeMs === file.mtime.getTime() && cached.size === file.size) {
        heuristicTags = cached.tags;
        filteredClip = cached.clipTags;
        exifDateMs = cached.exifDateMs;
        if (exifDateMs) {
          dateSource = 'exif';
        }
        cacheHits++;
      } else {
        try {
          exif = await extractExif(file.path);
          heuristicTags = isHeuristicMode(mode) ? await heuristicTag(file, exif) : [];
          // 解析 EXIF DateTimeOriginal
          const exifDate = parseExifDate(exif?.DateTimeOriginal);
          if (exifDate) {
            exifDateMs = exifDate.getTime();
            dateSource = 'exif';
          }
        } catch (e) {
          if (json && stream) errorEvent(`EXIF/heuristic failed for ${file.name}: ${e}`);
        }

        try {
          const clipRaw = isClipMode(mode) ? await clipTag(file.path) : [];
          filteredClip = clipRaw.filter(t => t.score >= thresholdNum);
        } catch (e) {
          if (json && stream) errorEvent(`CLIP failed for ${file.name}: ${e}`);
        }

        cacheData.entries[key] = {
          mtimeMs: file.mtime.getTime(),
          size: file.size,
          exifDateMs,
          tags: heuristicTags,
          clipTags: filteredClip,
        };
      }

      const primaryTag = heuristicTags.length > 0
        ? heuristicTags[0]
        : (filteredClip[0]?.label || null);

      // 日期归类：EXIF 优先（拍摄时间），fallback 到 mtime
      // 注意：mtime 仍可作为 cache key（因为文件被改 mtime 就变，cache 自动失效）
      const date = exifDateMs ? new Date(exifDateMs) : new Date(file.mtime);
      const yyyyMm = formatDate(date, 'month');
      const yyyyMmDd = formatDate(date, 'day');

      let targetFolder: string;
      let dateFolder: string;
      if (isDateMode(mode)) {
        // by-date 模式：按 yyyy-MM-dd 子目录
        targetFolder = path.join(output, 'by-date', yyyyMm, yyyyMmDd);
        dateFolder = `${yyyyMm}/${yyyyMmDd}`;
      } else if (primaryTag) {
        // by-tag 模式：dateFolder 仍记录 EXIF 时间（用于 GUI 显示）
        targetFolder = path.join(output, 'by-tag', primaryTag);
        dateFolder = yyyyMmDd;
      } else {
        targetFolder = path.join(output, 'by-tag', 'unsorted');
        dateFolder = yyyyMmDd;
      }

      let targetPath = path.join(targetFolder, file.name);
      let counter = 1;
      while (await fileExists(targetPath)) {
        const ext = path.extname(file.name);
        const base = path.basename(file.name, ext);
        targetPath = path.join(targetFolder, `${base}_${counter}${ext}`);
        counter++;
      }

      const { translated, untranslated } = translateTagsWithMeta(heuristicTags);
      plans[idx] = {
        source: file.path,
        name: file.name,
        tags: heuristicTags,
        tagsZh: translated.map(t => t.zh),
        untranslatedTags: untranslated,
        clipTags: filteredClip,
        targetFolder,
        targetPath,
        dateFolder,
        dateSource,                    // v0.7 新增：日期来源（GUI 用）
        exif: exif ?? null,           // v0.7 新增：完整 EXIF（GUI 可展示相机型号等）
      };

      // 缩略图（开启时）— 单图失败不阻塞其他
      if (thumbs) {
        try {
          const t = await makeThumbnail(file.path, {
            size: thumbSize,
            cacheDir: thumbCachePath,
            noCache,
          });
          if (t) {
            plans[idx].thumbnail = {
              dataUrl: t.dataUrl,
              width: t.width,
              height: t.height,
              source: t.source,
            };
          }
        } catch (e) {
          if (json && stream) errorEvent(`thumbnail failed for ${file.name}: ${e}`);
        }
      }
    } catch (err) {
      // 单图分析彻底失败也要让其他图继续 — 写一个空 plan
      plans[idx] = {
        source: file.path,
        name: file.name,
        tags: [],
        tagsZh: [],
        untranslatedTags: [],
        clipTags: [],
        targetFolder: path.join(output, 'by-tag', 'unsorted'),
        targetPath: path.join(output, 'by-tag', 'unsorted', file.name),
        dateFolder: 'unknown',
        exif: null,
      };
      if (json && stream) errorEvent(`analyze hard-fail for ${file.name}: ${err}`);
    }

    done++;
    const pct = total > 0 ? Math.floor((done / total) * 100) : 100;
    if (json && stream) {
      progressEvent('analyze', done, total, file.name);
    } else if (spinner) {
      spinner.text = `正在分析 (${done}/${total}, ${pct}%): ${file.name}`;
    }
  };

  await Promise.allSettled(files.map((f, i) => limit(() => analyze(f, i))));

  if (spinner) spinner.succeed(`分析完成${cacheHits > 0 ? ` (缓存命中 ${cacheHits})` : ''}`);

  // 4) 输出计划（仅非 json 模式打印到 stdout）
  if (!json) {
    console.log(chalk.green(`\n✅ 整理计划已生成（共 ${plans.length} 个文件）\n`));
    plans.forEach((plan, index) => {
      const clipStr = plan.clipTags.length > 0
        ? plan.clipTags.map(t => `${t.label}(${t.score.toFixed(2)})`).join(', ')
        : '无';
      console.log(
        chalk.gray(`${(index + 1).toString().padStart(2)}. `) +
        chalk.white(plan.name.padEnd(28)) +
        chalk.cyan('→ ') +
        chalk.yellow(plan.targetFolder.split(path.sep).pop() || 'unsorted') +
        chalk.gray(` [${clipStr}]`)
      );
    });
  }

  // 5) 写报告
  const report: any = {
    timestamp: new Date().toISOString(),
    sourceFolder: folder,
    outputFolder: output,
    totalFiles: plans.length,
    mode,
    threshold: thresholdNum,
    concurrency: concurrencyNum,
    cacheHits,
    durationMs: Date.now() - t0,
    plans: plans.map(p => ({
      file: p.name,
      source: p.source,
      target: p.targetPath,
      targetFolder: p.targetFolder,
      heuristicTags: p.tags,
      heuristicTagsZh: p.tagsZh,         // v0.9+: 中文
      untranslatedTags: p.untranslatedTags, // v0.9.1+: 未翻译英文
      clipTags: p.clipTags,
      dateFolder: p.dateFolder,           // yyyy-MM-dd（GUI 显示）
      dateSource: p.dateSource,           // v0.7+: 'exif' | 'mtime'
      exif: p.exif,                       // v0.7+: 完整 EXIF
      thumbnail: p.thumbnail,
    })),
  };

  const reportPath = path.join(output, '.photo-vault-report.json');
  await fs.mkdir(output, { recursive: true });

  // v0.8+: --profile 性能指标
  let profileData: any = null;
  if (profile) {
    profileData = collectProfile(t0, plans.length, cacheHits);
    report.profile = profileData;
  }

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  if (profile && !json) {
    console.log(chalk.gray(`\n📊 Profile:`));
    console.log(chalk.gray(`  Wall time:    ${(profileData.wallMs / 1000).toFixed(2)}s`));
    console.log(chalk.gray(`  CPU time:     ${profileData.cpuMs}ms`));
    console.log(chalk.gray(`  Peak RSS:     ${profileData.rssPeakMB} MB`));
    console.log(chalk.gray(`  Cache hit:    ${profileData.cacheHitRate} (${cacheHits}/${plans.length})`));
    console.log(chalk.gray(`  Throughput:   ${profileData.throughput}`));
  }

  if (json && stream) {
    resultEvent('organize', report);
  } else if (!json) {
    console.log(chalk.gray(`\n📄 报告已生成: ${reportPath}`));
  }

  // 6) 写缓存
  if (!noCache) {
    try { await saveCache(cachePath, cacheData); } catch (e) { err(`缓存写入失败: ${e}`); }
  }

  // 7) 执行移动
  if (apply) {
    if (!json) {
      const confirmed = await confirm(`\n确定要移动这 ${plans.length} 个文件吗？`);
      if (!confirmed) { console.log(chalk.gray('已取消操作。')); return; }
    } else {
      logEvent('info', `开始移动 ${plans.length} 个文件`);
    }

    let successCount = 0;
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      try {
        await fs.mkdir(plan.targetFolder, { recursive: true });
        await fs.rename(plan.source, plan.targetPath);
        successCount++;
        if (json && stream) {
          progressEvent('move', i + 1, plans.length, plan.name);
        }
      } catch (e) {
        err(`移动失败: ${plan.name} — ${e}`);
      }
    }
    say(chalk.green, `\n✅ 移动完成！成功移动 ${successCount}/${plans.length} 个文件`);
  } else if (!json) {
    console.log(chalk.yellow('\n📝 当前为 dry-run 模式'));
    console.log(chalk.gray('   添加 --apply 参数可执行真实移动\n'));
  }

  // 关键：显式退出 + 清 handler
  // 避免 sharp 异步 handle 被 GC 时报警告 + 确保 GUI 端能拿到 close 事件
  process.off('uncaughtException', uncaughtHandler);
  process.off('unhandledRejection', unhandledRejectionHandler);

  // 给 stdout 100ms flush 时间，再优雅退出
  if (json && stream) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try { process.exit(0); } catch {}
  }
}
