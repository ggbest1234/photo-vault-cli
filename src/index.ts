#!/usr/bin/env node
import { Command } from 'commander';
import { organize } from './commands/organize.js';
import { scan } from './commands/scan.js';
import { search } from './commands/search.js';
import { isModelDownloaded } from './clip.js';
import { preloadSharp } from './thumbnail.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const version = pkg.version;

// 关键：在 import clip/transformers 之前预先加载 sharp
// 避免 @xenova/transformers 静态 import 污染 sharp 的 native binary
// （二者是同一进程内的 native module 竞争）
await preloadSharp();

const program = new Command();

program
  .name('photo-vault')
  .description('Local photo organizer with CLIP auto-tagging')
  .version(version);

program
  .command('scan <folder>')
  .description('扫描文件夹')
  .option('--json', '输出 JSON Lines 协议（GUI 模式）')
  .option('--stream', '流式输出进度事件（与 --json 配合）')
  .option('--limit <number>', '限制数量', '0')
  .action((folder, opts) => scan(folder, { recursive: true, limit: opts.limit, json: !!opts.json, stream: !!opts.stream }));

program
  .command('organize <folder>')
  .description('整理照片')
  .option('--mode <mode>', 'combined | date | clip | heuristic', 'combined')
  .option('--limit <number>', '限制数量', '0')
  .option('--apply', '真实移动（默认 dry-run）')
  .option('--threshold <n>', 'CLIP 标签置信度阈值', '0.1')
  .option('--concurrency <n>', '并行分析数（CLIP 推理吃 CPU，默认 2）', '2')
  .option('--cache <path>', 'CLIP 推理缓存路径', '<output>/.photo-vault-cache.json')
  .option('--no-cache', '禁用缓存')
  .option('--output <dir>', '整理输出根目录', '<folder>/organized')
  .option('--thumbs', '为每个 plan 生成 base64 缩略图（GUI 预览用）')
  .option('--thumb-size <n>', '缩略图边长 px', '240')
  .option('--thumb-cache <dir>', '缩略图缓存目录', '<output>/.thumb-cache')
  .option('--json', '输出 JSON Lines 协议（GUI 模式）')
  .option('--stream', '流式输出进度事件（与 --json 配合）')
  .action((folder, opts) => {
    const output = opts.output === '<folder>/organized' ? join(folder, 'organized') : opts.output;
    const cache = opts.cache === '<output>/.photo-vault-cache.json' ? join(output, '.photo-vault-cache.json') : opts.cache;
    const thumbCache = opts.thumbCache === '<output>/.thumb-cache' ? join(output, '.thumb-cache') : opts.thumbCache;
    return organize(folder, {
      output,
      mode: opts.mode,
      apply: !!opts.apply,
      threshold: opts.threshold,
      limit: opts.limit,
      concurrency: opts.concurrency,
      cache,
      noCache: opts.cache === false,
      thumbs: !!opts.thumbs,
      thumbSize: opts.thumbSize,
      thumbCache,
      json: !!opts.json,
      stream: !!opts.stream,
    });
  });

program
  .command('search <folder> <query>')
  .description('搜索图片（按标签或文件名）')
  .option('--json', '输出 JSON Lines 协议（GUI 模式）')
  .option('--stream', '流式输出进度事件（与 --json 配合）')
  .option('--cache <path>', '复用 CLIP 缓存（由 organize 生成）')
  .option('--no-cache', '禁用缓存')
  .option('--thumbs', '为每个结果生成 base64 缩略图（GUI 预览用）')
  .option('--thumb-size <n>', '缩略图边长 px', '240')
  .option('--thumb-cache <dir>', '缩略图缓存目录', '<folder>/organized/.thumb-cache')
  .option('--concurrency <n>', '缩略图并发数', '4')
  .option('--with-clip', '启用 CLIP 推理匹配（默认关闭，仅文件名+启发式；启用后慢但能找到语义标签）')
  .action((folder, query, opts) => {
    const thumbCache = opts.thumbCache === '<folder>/organized/.thumb-cache'
      ? join(folder, 'organized', '.thumb-cache')
      : opts.thumbCache;
    return search(folder, query, {
      json: !!opts.json,
      stream: !!opts.stream,
      cache: opts.cache,
      noCache: opts.cache === false,
      thumbs: !!opts.thumbs,
      thumbSize: opts.thumbSize,
      thumbCache,
      concurrency: opts.concurrency,
      withClip: !!opts.withClip,
    });
  });

program.parseAsync(process.argv).catch((err) => {
  // 最后兜底：JSON 模式走 error event，否则红字
  try {
    process.stdout.write(JSON.stringify({ type: 'error', message: err?.message || String(err) }) + '\n');
  } catch {
    console.error('Error:', err?.message || err);
  }
  process.exit(1);
});

// 静默 unused import 警告
void isModelDownloaded;
