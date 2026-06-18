import chalk from 'chalk';
import ora from 'ora';
import { scanFolder } from '../scanner.js';
import { emit } from '../protocol.js';

type ScanOptions = {
  recursive?: boolean;
  limit?: string;
  json?: boolean;
  stream?: boolean;
};

export async function scan(folder: string, options: ScanOptions) {
  if (!folder) {
    if (options.json) emit({ type: 'error', message: 'folder path is required' });
    else console.error(chalk.red('❌ Error: folder path is required'));
    process.exit(1);
  }
  const limit = parseInt(options.limit || '0', 10);
  const { json = false, stream = false } = options;

  const say = (color: typeof chalk, msg: string) => {
    if (json && stream) emit({ type: 'log', level: 'info', message: msg });
    else if (!json) console.log(color(msg));
  };

  if (!json) {
    console.log(chalk.bold(`\n📸 Photo Vault Scanner\n`));
    console.log(chalk.gray(`Folder: ${folder}`));
    console.log(chalk.gray(`Recursive: ${options.recursive !== false}`));
    if (limit > 0) console.log(chalk.gray(`Limit: ${limit} files`));
    console.log();
  }

  if (json && stream) emit({ type: 'progress', phase: 'scan', current: 0, total: 0 });
  const spinner = json ? null : ora('Scanning folder...').start();
  let files = await scanFolder(folder, options.recursive !== false);
  if (spinner) spinner.succeed(`Found ${chalk.green(files.length)} images`);
  else if (json) emit({ type: 'log', level: 'success', message: `Found ${files.length} images` });

  if (limit > 0 && files.length > limit) files = files.slice(0, limit);

  if (limit > 0) files = files.slice(0, limit);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const byExt: Record<string, number> = {};
  for (const f of files) byExt[f.ext] = (byExt[f.ext] || 0) + 1;

  const summary = {
    folder,
    total: files.length,
    totalSizeMB: +(totalSize / 1024 / 1024).toFixed(2),
    avgSizeKB: files.length ? +(totalSize / files.length / 1024).toFixed(1) : 0,
    byExt,
    topLargest: [...files].sort((a, b) => b.size - a.size).slice(0, 10).map(f => ({
      path: f.path, sizeMB: +(f.size / 1024 / 1024).toFixed(2),
    })),
  };

  if (json && stream) {
    emit({ type: 'result', command: 'scan', data: summary });
  } else if (!json) {
    console.log(chalk.bold('\n📊 Summary:'));
    console.log(`  Total:    ${chalk.green(files.length)} files`);
    console.log(`  Total size: ${chalk.cyan(summary.totalSizeMB)} MB`);
    if (files.length > 0) console.log(`  Avg size: ${chalk.cyan(summary.avgSizeKB)} KB`);

    console.log(chalk.bold('\n📁 By extension:'));
    for (const [ext, count] of Object.entries(byExt).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${chalk.yellow(ext.padEnd(8))} ${count}`);
    }
    console.log(chalk.bold(`\n🔝 Top 10 largest files:`));
    for (const f of summary.topLargest) {
      console.log(`  ${chalk.gray(String(f.sizeMB).padStart(8))} MB  ${f.path}`);
    }
    console.log();
  }
}
