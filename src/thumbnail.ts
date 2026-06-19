/**
 * 缩略图生成
 *  优先级：EXIF embedded thumbnail → sharp resize
 *  缓存：按 sha1(path + mtimeMs + size + 尺寸) 落盘
 *
 *  sharp 走 lazy load：dynamic import + createRequire fallback，
 *  避开 Hermes node 环境 ESM 加载 sharp 的 native binary 失败问题
 */
import * as crypto from 'crypto';
import * as path from 'path';
import { promises as fs } from 'fs';
// @ts-ignore
import exifr from 'exifr';

type SharpInstance = any;

let _sharp: SharpInstance | null = null;
let _sharpLoadFailed = false;

/**
 * 预先加载 sharp（在 import clip/transformers 之前调用）
 * 关键：避免 @xenova/transformers 污染 sharp 的 native binary
 */
export async function preloadSharp(): Promise<boolean> {
  const lib = await getSharp();
  return lib !== null;
}

async function getSharp(): Promise<SharpInstance | null> {
  if (_sharp) return _sharp;
  if (_sharpLoadFailed) return null;

  // 尝试 1：dynamic import（ESM 标准）
  try {
    const m: any = await import('sharp');
    _sharp = m.default ?? m;
    return _sharp;
  } catch {
    // 尝试 2：createRequire + CJS
    try {
      const { createRequire } = await import('module');
      const { fileURLToPath } = await import('url');
      const metaUrl = pathToFileURLString(fileURLToPath(import.meta.url));
      const _req = createRequire(metaUrl);
      _sharp = _req('sharp');
      return _sharp;
    } catch {
      _sharpLoadFailed = true;
      return null;
    }
  }
}

// 辅助：把 path 拼成 file:// URL
function pathToFileURLString(p: string): string {
  // Windows: 'F:\foo' → 'file:///F:/foo'
  if (p.startsWith('/')) return 'file://' + p;
  return 'file:///' + p.replace(/\\/g, '/');
}

export type ThumbnailOptions = {
  size?: number;
  quality?: number;
  cacheDir?: string;
  noCache?: boolean;
};

export type ThumbnailResult = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  source: 'exif' | 'resize' | 'cache' | 'heic-decode';
  tookMs: number;
};

function cacheKey(imagePath: string, mtimeMs: number, size: number, fileSize: number): string {
  return crypto.createHash('sha1')
    .update(`${imagePath}|${mtimeMs}|${size}|${fileSize}`)
    .digest('hex')
    .slice(0, 24);
}

function toDataUrl(buf: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function getExifThumb(imagePath: string): Promise<Buffer | null> {
  try {
    // @ts-ignore
    const thumb = await exifr.thumbnail(imagePath);
    if (thumb && Buffer.isBuffer(thumb) && thumb.length > 0) return thumb;
  } catch {}
  return null;
}

async function sharpResize(
  sharpLib: SharpInstance,
  imagePath: string,
  size: number,
  quality: number
): Promise<{ buf: Buffer; w: number; h: number } | null> {
  try {
    const pipeline = sharpLib(imagePath, { failOn: 'none' })
      .rotate()
      .resize(size, size, { fit: 'inside', withoutEnlargement: true });
    const buf = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    const meta = await sharpLib(buf).metadata().catch(() => null);
    return { buf, w: meta?.width || size, h: meta?.height || size };
  } catch {
    return null;
  }
}

export async function makeThumbnail(
  imagePath: string,
  opts: ThumbnailOptions = {}
): Promise<ThumbnailResult | null> {
  const t0 = Date.now();
  const size = opts.size ?? 240;
  const quality = opts.quality ?? 70;
  const cacheDir = opts.cacheDir ?? './.thumb-cache';
  const noCache = opts.noCache ?? false;

  let mtimeMs = 0;
  let fileSize = 0;
  try {
    const stat = await fs.stat(imagePath);
    mtimeMs = stat.mtimeMs;
    fileSize = stat.size;
  } catch {
    return null;
  }

  const key = cacheKey(imagePath, mtimeMs, size, fileSize);
  const cachePath = path.join(cacheDir, `${key}.jpg`);

  // 1) 缓存命中
  if (!noCache) {
    try {
      const cached = await fs.readFile(cachePath);
      if (cached.length > 0) {
        const sharpLib = await getSharp();
        const meta = sharpLib ? await sharpLib(cached).metadata().catch(() => null) : null;
        return {
          dataUrl: toDataUrl(cached),
          width: meta?.width || size,
          height: meta?.height || size,
          bytes: cached.length,
          source: 'cache',
          tookMs: Date.now() - t0,
        };
      }
    } catch {}
  }

  // 2) EXIF embedded thumbnail
  const exifBuf = await getExifThumb(imagePath);
  if (exifBuf) {
    const sharpLib = await getSharp();
    if (sharpLib) {
      try {
        const compressed = await sharpLib(exifBuf)
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        const meta = await sharpLib(compressed).metadata().catch(() => null);
        if (!noCache) {
          try {
            await fs.mkdir(cacheDir, { recursive: true });
            await fs.writeFile(cachePath, compressed);
          } catch {}
        }
        return {
          dataUrl: toDataUrl(compressed),
          width: meta?.width || size,
          height: meta?.height || size,
          bytes: compressed.length,
          source: 'exif',
          tookMs: Date.now() - t0,
        };
      } catch {}
    }
  }

  // 3) HEIC fallback（v0.9: 用 heic-decode 替代 sharp 处理 HEIF）
  // sharp 0.35 自带的 libheif 较老，无法解码真实 iPhone HEIC 文件
  // heic-decode 是 libheif-js 包装的纯 JS + WASM 实现，无需系统依赖
  if (/\.(heic|heif)$/i.test(imagePath)) {
    try {
      const { default: decodeHeic } = await import('heic-decode');
      const fileBuf = await fs.readFile(imagePath);
      const t1 = Date.now();
      const { width, height, data } = await decodeHeic({ buffer: fileBuf });
      const sharpLib = await getSharp();
      if (sharpLib) {
        // data 是 RGBA buffer，转成 sharp raw 处理
        const compressed = await sharpLib(Buffer.from(data.buffer), {
          raw: { width, height, channels: 4 }
        })
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        const meta = await sharpLib(compressed).metadata().catch(() => null);
        if (!noCache) {
          try {
            await fs.mkdir(cacheDir, { recursive: true });
            await fs.writeFile(cachePath, compressed);
          } catch {}
        }
        return {
          dataUrl: toDataUrl(compressed),
          width: meta?.width || width,
          height: meta?.height || height,
          bytes: compressed.length,
          source: 'heic-decode',  // v0.9+: 新源类型标识
          tookMs: Date.now() - t0,
        };
      }
    } catch (e) {
      // HEIC decode 失败，fall through 到 sharp 尝试
    }
  }

  // 4) sharp fallback
  const sharpLib = await getSharp();
  if (!sharpLib) {
    return null;  // sharp 不可用，GUI 显示占位
  }

  const resized = await sharpResize(sharpLib, imagePath, size, quality);
  if (!resized) return null;

  if (!noCache) {
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cachePath, resized.buf);
    } catch {}
  }
  return {
    dataUrl: toDataUrl(resized.buf),
    width: resized.w,
    height: resized.h,
    bytes: resized.buf.length,
    source: 'resize',
    tookMs: Date.now() - t0,
  };
}
