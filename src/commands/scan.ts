import chalk from 'chalk';
import ora from 'ora';
import { scanFolder } from '../scanner.js';

type ScanOptions = {
  recursive?: boolean;
  limit?: string;
};

export async function scan(folder: string, options: ScanOptions) {
  if (!folder) {
    console.error(chalk.red('❌ Error: folder path is required'));
    process.exit(1);
  }
  const limit = parseInt(options.limit || '0', 10);

  console.log(chalk.bold(`\n📸 Photo Vault Scanner\n`));
  console.log(chalk.gray(`Folder: ${folder}`));
  console.log(chalk.gray(`Recursive: ${options.recursive !== false}`));
  if (limit > 0) console.log(chalk.gray(`Limit: ${limit} files`));
  console.log();

  const spinner = ora('Scanning folder...').start();
  let files = await scanFolder(folder, options.recursive !== false);
  spinner.succeed(`Found ${chalk.green(files.length)} images`);

  if (limit > 0 && files.length > limit) {
    files = files.slice(0, limit);
  }

  // 按大小排序（最大的先看）
  const sorted = [...files].sort((a, b) => b.size - a.size);

  // 分组
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const byExt: Record<string, number> = {};
  for (const f of files) {
    byExt[f.ext] = (byExt[f.ext] || 0) + 1;
  }

  console.log(chalk.bold('\n📊 Summary:'));
  console.log(`  Total:    ${chalk.green(files.length)} files`);
  console.log(`  Total size: ${chalk.cyan((totalSize / 1024 / 1024).toFixed(2))} MB`);
  if (files.length > 0) {
    console.log(`  Avg size: ${chalk.cyan((totalSize / files.length / 1024).toFixed(1))} KB`);
  }

  console.log(chalk.bold('\n📁 By extension:'));
  for (const [ext, count] of Object.entries(byExt).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${chalk.yellow(ext.padEnd(8))} ${count}`);
  }

  console.log(chalk.bold(`\n🔝 Top 10 largest files:`));
  for (const f of sorted.slice(0, 10)) {
    const size = (f.size / 1024 / 1024).toFixed(2);
    console.log(`  ${chalk.gray(size.padStart(8))} MB  ${f.path}`);
  }
  console.log();
}