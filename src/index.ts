#!/usr/bin/env node
/**
 * Photo Vault CLI - 主入口
 *
 * 命令：
 *   scan <folder>          扫描文件夹 + 显示统计
 *   organize <folder>      智能归类（默认 dry-run）
 *
 * 选项：
 *   -m, --mode             标签模式：heuristic | clip | combined（默认 combined）
 *   --apply                实际移动（带 readline 确认）
 *   --threshold <0-1>      CLIP 置信度阈值（默认 0.1）
 *   -l, --limit <N>        只处理前 N 个文件（测试用）
 *   --skip <pattern>       跳过文件名包含 pattern 的文件
 *   -o, --output           输出文件夹（默认 <folder>/organized/）
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { organize } from './commands/organize.js';
import { scan } from './commands/scan.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const version = pkg.version;

const program = new Command();

program
  .name('photo-vault')
  .description('Local photo organizer with CLIP auto-tagging + heuristic tagging. CLI-first, cross-platform.')
  .version(version);

program
  .command('scan <folder>')
  .description('扫描文件夹 + 显示统计信息（图片数 / 大小 / 扩展名分布）')
  .option('-r, --recursive', '递归扫描子文件夹', true)
  .option('-l, --limit <number>', '只统计前 N 个文件（0 = 全部）', '0')
  .action(scan);

program
  .command('organize <folder>')
  .description('智能归类（启发式 + CLIP），默认 dry-run 模式，加 --apply 才真移动')
  .option('-o, --output <folder>', '输出文件夹（默认 <folder>/organized/）')
  .option('-m, --mode <mode>', '标签模式：heuristic | clip | combined（默认 combined）', 'combined')
  .option('--dry-run', '只看不移动（默认）', true)
  .option('--apply', '实际移动文件（弹 readline 确认）', false)
  .option('--threshold <number>', 'CLIP 置信度阈值（0-1，默认 0.1）', '0.1')
  .option('-l, --limit <number>', '只处理前 N 个文件（测试用）', '0')
  .option('--skip <pattern>', '跳过文件名包含 pattern 的文件（可多次使用）', (val: string, prev: string[]) => prev.concat(val), [] as string[])
  .action(organize);

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red('❌ Error:'), err.message);
  process.exit(1);
});