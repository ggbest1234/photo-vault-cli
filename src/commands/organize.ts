/**
 * Organize 命令 - 智能归类
 *
 * 流程：
 *   1. 扫描文件夹（递归 + MD5）
 *   2. 启发式标签（文件名 + EXIF + 业务映射）
 *   3. CLIP 标签（可选）
 *   4. 融合 + 归类计划
 *   5. dry-run 展示 / apply 真移动（带 readline 确认）
 */
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { promises as fs } from 'fs';
import { createInterface } from 'readline';
import { scanFolder, type ScannedFile } from '../scanner.js';
import { clipTag, type ClipTag } from '../clip.js';
import { extractExif } from '../exif.js';
import { heuristicTag } from '../heuristics.js';

type OrganizeOptions = {
  output?: string;
  mode?: string;
  dryRun?: boolean;
  apply?: boolean;
  threshold?: string;
  limit?: string;
  skip?: string[];
};

type FilePlan = {
  source: string;
  name: string;
  tags: string[];
  clipTags: ClipTag[];
  targetFolder: string;
  targetPath: string;
  dateFolder: string;
  exif: any;
};

const isHeuristicMode = (m: string) => m === 'heuristic' || m === 'combined';
const isClipMode = (m: string) => m === 'clip' || m === 'combined';

export async function organize(folder: string, options: OrganizeOptions) {
  if (!folder) {
    console.error(chalk.red('❌ Error: folder path is required'));
    process.exit(1);
  }
  const mode = options.mode || 'combined';
  const threshold = parseFloat(options.threshold || '0.1');
  const limit = parseInt(options.limit || '0', 10);
  const dryRun = !options.apply;  // --apply 才真移动
  const outputDir = options.output || path.join(folder, 'organized');
  const skipPatterns = options.skip || [];

  console.log(chalk.bold(`\n📸 Photo Vault Organizer\n`));
  console.log(chalk.gray(`Folder:    ${folder}`));
  console.log(chalk.gray(`Output:    ${outputDir}`));
  console.log(chalk.gray(`Mode:      ${mode}`));
  console.log(chalk.gray(`Threshold: ${threshold}`));
  if (skipPatterns.length > 0) {
    console.log(chalk.gray(`Skip:      ${skipPatterns.join(', ')}`));
  }
  if (dryRun) {
    console.log(chalk.yellow('⚠️  DRY RUN (use --apply to actually move)\n'));
  } else {
    console.log(chalk.green('🚀 APPLY MODE - files will be moved!\n'));
  }

  // 1. 扫描
  const scanSpinner = ora('Scanning folder...').start();
  let files = await scanFolder(folder, true);

  // 跳过 skip patterns
  if (skipPatterns.length > 0) {
    files = files.filter(f => !skipPatterns.some(p => f.name.includes(p)));
  }

  if (limit > 0) {
    files = files.slice(0, limit);
    scanSpinner.succeed(`Scanned (limited to ${limit} files)`);
  } else {
    scanSpinner.succeed(`Scanned ${chalk.green(files.length)} files`);
  }

  if (files.length === 0) {
    console.log(chalk.yellow('No files to process.'));
    return;
  }

  // 2. 处理每个文件
  const tagSpinner = ora('Tagging files...').start();
  const plans: FilePlan[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    tagSpinner.text = `Tagging ${i + 1}/${files.length}: ${file.name}`;

    // EXIF
    const exif = await extractExif(file.path);

    // 启发式标签
    const heuristicTags = isHeuristicMode(mode)
      ? await heuristicTag(file, exif)
      : [];

    // CLIP 标签
    const clipTags = isClipMode(mode)
      ? await clipTag(file.path)
      : [];

    // 过滤 CLIP 置信度
    const filteredClip = clipTags.filter(t => t.score >= threshold);

    // 主标签（启发式优先）
    const primaryTag = heuristicTags.length > 0
      ? heuristicTags[0]
      : (filteredClip[0]?.label || null);

    // 归类路径：by-tag/<primaryTag>/<YYYY-MM>/
    const date = new Date(file.mtime);
    const yyyyMm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const dateFolder = yyyyMm;

    let targetFolder: string;
    if (primaryTag) {
      targetFolder = path.join(outputDir, 'by-tag', primaryTag);
    } else {
      targetFolder = path.join(outputDir, 'by-tag', 'unsorted');
    }

    // 目标路径
    let targetPath = path.join(targetFolder, file.name);
    let counter = 1;
    while (await fileExists(targetPath)) {
      const ext = path.extname(file.name);
      const base = path.basename(file.name, ext);
      targetPath = path.join(targetFolder, `${base}_${counter}${ext}`);
      counter++;
    }

    plans.push({
      source: file.path,
      name: file.name,
      tags: heuristicTags,
      clipTags: filteredClip,
      targetFolder,
      targetPath,
      dateFolder,
      exif,
    });
  }

  tagSpinner.succeed(`Tagged ${plans.length} files`);

  // 3. 展示计划
  console.log(chalk.bold('\n📋 Organization Plan:\n'));
  for (const plan of plans) {
    const allTags = [
      ...plan.tags.map(t => chalk.cyan(t)),
      ...plan.clipTags.map(t => chalk.yellow(`${t.label}(${(t.score * 100).toFixed(1)}%)`)),
    ];
    const tagStr = allTags.length > 0 ? allTags.join(' ') : chalk.gray('(no tags)');

    const dateStr = plan.exif?.DateTimeOriginal
      ? chalk.gray(`EXIF: ${plan.exif.DateTimeOriginal}`)
      : '';

    console.log(`  ${chalk.bold(plan.name)}`);
    console.log(`    → ${chalk.gray(plan.targetFolder.replace(folder, '.'))}/`);
    console.log(`    Tags: ${tagStr} ${dateStr}`);
  }

  // 4. 按日期归类副本（双轨）
  if (mode === 'combined' || mode === 'clip' || mode === 'heuristic') {
    console.log(chalk.bold('\n📅 Also creating by-date copies:\n'));
    for (const plan of plans) {
      const dateTarget = path.join(outputDir, 'by-date', plan.dateFolder, plan.name);
      console.log(`  ${plan.name} → ${chalk.gray('by-date/' + plan.dateFolder + '/')}`);
    }
  }

  // 5. 总结
  const summary = {
    total: plans.length,
    withTags: plans.filter(p => p.tags.length > 0 || p.clipTags.length > 0).length,
    unsorted: plans.filter(p => p.tags.length === 0 && p.clipTags.length === 0).length,
    byTag: path.join(outputDir, 'by-tag'),
    byDate: path.join(outputDir, 'by-date'),
  };

  console.log(chalk.bold('\n📊 Summary:'));
  console.log(`  Total:     ${summary.total}`);
  console.log(`  With tags: ${chalk.green(summary.withTags)}`);
  console.log(`  Unsorted:  ${chalk.yellow(summary.unsorted)}`);
  console.log(`  By-tag:    ${chalk.blue(summary.byTag)}`);
  console.log(`  By-date:   ${chalk.blue(summary.byDate)}`);

  // 6. 应用 / 报告
  if (!dryRun) {
    // 确认
    const confirmed = await confirm(`\n⚠️  真的要移动 ${plans.length} 个文件吗？`);
    if (!confirmed) {
      console.log(chalk.yellow('已取消'));
      return;
    }

    // 真移动
    const moveSpinner = ora('Moving files...').start();
    let moved = 0;
    let failed = 0;

    for (const plan of plans) {
      try {
        await fs.mkdir(plan.targetFolder, { recursive: true });
        await fs.rename(plan.source, plan.targetPath);
        moved++;
      } catch (err) {
        console.error(chalk.red(`Failed: ${plan.name}`), (err as Error).message);
        failed++;
      }
    }

    moveSpinner.succeed(`Moved ${moved} files${failed > 0 ? `, ${failed} failed` : ''}`);

    // 写报告
    const reportPath = path.join(outputDir, 'organize-report.json');
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      folder,
      output: outputDir,
      mode,
      summary,
      plans,
    }, null, 2), 'utf-8');
    console.log(chalk.gray(`📄 Report: ${reportPath}`));
  } else {
    // 写 dry-run 报告
    const reportPath = path.join(outputDir, 'organize-report.json');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      folder,
      output: outputDir,
      mode,
      summary,
      plans,
      dryRun: true,
    }, null, 2), 'utf-8');
    console.log(chalk.gray(`\n📄 Report (dry-run): ${reportPath}`));
    console.log(chalk.yellow('\n💡 Re-run with --apply to actually move files'));
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => {
    rl.question(chalk.yellow(question + ' (y/N): '), answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}