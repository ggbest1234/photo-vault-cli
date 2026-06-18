/**
 * Rollback 命令 - 撤销 organize --apply 的文件移动
 *
 * 读 <output>/.photo-vault-report.json，把 target 文件 move 回 source 位置
 * 支持 dry-run 预览
 */
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { promises as fs } from 'fs';
import { createInterface } from 'readline';
import { emit, logEvent, progressEvent, resultEvent, errorEvent } from '../protocol.js';

type RollbackOptions = {
  output?: string;        // 整理输出根目录（含 .photo-vault-report.json）
  report?: string;        // 自定义报告路径（覆盖默认）
  dryRun?: boolean;       // 只显示，不实际移动
  apply?: boolean;        // 真实回滚
  conflict?: 'skip' | 'rename' | 'overwrite';  // 源位置已有同名文件怎么办
  json?: boolean;
  stream?: boolean;
};

type ReportPlan = {
  file: string;
  source: string;
  target: string;
  targetFolder: string;
  heuristicTags: string[];
  clipTags: Array<{ label: string; score: number }>;
  dateFolder: string;
};

type Report = {
  timestamp: string;
  sourceFolder: string;
  outputFolder: string;
  totalFiles: number;
  mode: string;
  plans: ReportPlan[];
};

type RollbackAction = {
  file: string;
  source: string;
  target: string;
  action: 'restore' | 'skip' | 'overwrite' | 'rename' | 'missing-target' | 'source-exists' | 'same-location';
  renamedTo?: string;     // rename 时的实际目标
  error?: string;
};

export async function rollback(folder: string, options: RollbackOptions = {}) {
  const {
    output: outputOpt = folder,
    report: reportOpt,
    dryRun = true,
    apply = false,
    conflict = 'rename',
    json = false,
    stream = false,
  } = options;

  const output = outputOpt;
  const reportPath = reportOpt ?? path.join(output, '.photo-vault-report.json');

  // 进程级兜底
  const uncaughtHandler = (err: Error) => {
    try { errorEvent(`uncaught: ${err?.message || err}`); } catch {}
    try { process.exit(1); } catch {}
  };
  const unhandledRejectionHandler = (reason: any) => {
    try { errorEvent(`unhandled rejection: ${reason?.message || reason}`); } catch {}
  };
  process.on('uncaughtException', uncaughtHandler);
  process.on('unhandledRejection', unhandledRejectionHandler);

  const say = (color: typeof chalk, msg: string) => {
    if (json && stream) logEvent('info', msg);
    else if (!json) console.log(color(msg));
  };
  const sayErr = (msg: string) => {
    if (json) errorEvent(msg);
    else console.error(chalk.red(msg));
  };

  say(chalk.cyan, '\n↩️  Photo Vault - 回滚\n');

  // 1) 读报告
  let report: Report;
  try {
    const buf = await fs.readFile(reportPath, 'utf-8');
    report = JSON.parse(buf);
  } catch (e) {
    sayErr(`无法读取报告: ${reportPath}\n${e}`);
    if (json && stream) {
      process.off('uncaughtException', uncaughtHandler);
      process.off('unhandledRejection', unhandledRejectionHandler);
      await new Promise(r => setTimeout(r, 50));
      try { process.exit(1); } catch {}
    }
    return;
  }

  if (!report.plans || !Array.isArray(report.plans)) {
    sayErr(`报告格式错误: 缺少 plans 数组`);
    if (json && stream) {
      process.off('uncaughtException', uncaughtHandler);
      process.off('unhandledRejection', unhandledRejectionHandler);
      await new Promise(r => setTimeout(r, 50));
      try { process.exit(1); } catch {}
    }
    return;
  }

  say(chalk.gray, `报告时间: ${report.timestamp}`);
  say(chalk.gray, `原始文件夹: ${report.sourceFolder}`);
  say(chalk.gray, `整理文件夹: ${report.outputFolder}`);
  say(chalk.gray, `模式: ${report.mode}, 文件数: ${report.totalFiles}`);
  say(chalk.gray, `报告路径: ${reportPath}\n`);

  // 2) 检查每个 plan 的状态，决定 action
  const actions: RollbackAction[] = [];
  const removedDirs = new Set<string>();

  for (const plan of report.plans) {
    const targetExists = await fileExists(plan.target);
    const sourceExists = await fileExists(plan.source);

    if (!targetExists) {
      // target 不存在（用户可能已手动删除），跳过
      actions.push({
        file: plan.file,
        source: plan.source,
        target: plan.target,
        action: 'missing-target',
        error: '目标文件不存在（可能已被移动/删除）',
      });
      continue;
    }

    if (plan.source === plan.target) {
      // 源和目标相同（奇怪情况）
      actions.push({
        file: plan.file,
        source: plan.source,
        target: plan.target,
        action: 'same-location',
      });
      continue;
    }

    if (sourceExists) {
      // 源位置已有同名文件
      if (conflict === 'skip') {
        actions.push({
          file: plan.file,
          source: plan.source,
          target: plan.target,
          action: 'source-exists',
          error: '源位置已存在同名文件，已跳过',
        });
        continue;
      } else if (conflict === 'rename') {
        // 重命名：把目标文件 move 到源位置，源位置原文件不动
        const renamedTo = await uniquePath(plan.source);
        actions.push({
          file: plan.file,
          source: plan.source,
          target: plan.target,
          action: 'rename',
          renamedTo,
        });
        // 跟踪 target 父目录（之后清理空目录用）
        removedDirs.add(path.dirname(plan.target));
        continue;
      } else if (conflict === 'overwrite') {
        actions.push({
          file: plan.file,
          source: plan.source,
          target: plan.target,
          action: 'overwrite',
        });
        removedDirs.add(path.dirname(plan.target));
        continue;
      }
    } else {
      // 源位置空 — 正常回滚
      actions.push({
        file: plan.file,
        source: plan.source,
        target: plan.target,
        action: 'restore',
      });
      removedDirs.add(path.dirname(plan.target));
    }
  }

  // 3) 统计
  const stats = {
    restore: actions.filter(a => a.action === 'restore').length,
    rename: actions.filter(a => a.action === 'rename').length,
    overwrite: actions.filter(a => a.action === 'overwrite').length,
    skip: actions.filter(a => a.action === 'source-exists').length,
    missing: actions.filter(a => a.action === 'missing-target').length,
    same: actions.filter(a => a.action === 'same-location').length,
    errors: 0,
  };

  // 4) 输出计划
  if (json && stream) {
    logEvent('info', `计划: 还原 ${stats.restore}，重命名 ${stats.rename}，覆盖 ${stats.overwrite}，跳过 ${stats.skip}，目标缺失 ${stats.missing}`);
  } else {
    console.log(chalk.bold('📋 回滚计划：\n'));
    const summary = [];
    if (stats.restore) summary.push(chalk.green(`还原 ${stats.restore} 个`));
    if (stats.rename) summary.push(chalk.yellow(`重命名 ${stats.rename} 个`));
    if (stats.overwrite) summary.push(chalk.yellow(`覆盖 ${stats.overwrite} 个`));
    if (stats.skip) summary.push(chalk.gray(`跳过 ${stats.skip} 个（源位置已有同名）`));
    if (stats.missing) summary.push(chalk.gray(`跳过 ${stats.missing} 个（目标已丢失）`));
    if (stats.same) summary.push(chalk.gray(`${stats.same} 个源目标相同`));
    console.log(`  ${summary.join('，')}\n`);

    // 列前 20 个明细
    actions.slice(0, 20).forEach((a) => {
      let line: string;
      const tag = a.action === 'restore' ? chalk.green('↩️ ') :
                  a.action === 'rename' ? chalk.yellow('📝') :
                  a.action === 'overwrite' ? chalk.red('⚠️ ') :
                  a.action === 'source-exists' ? chalk.gray('⊘') :
                  a.action === 'missing-target' ? chalk.gray('?') :
                  chalk.gray('=');
      line = `  ${tag} ${path.basename(a.target)}`;
      if (a.action === 'rename' && a.renamedTo) {
        line += chalk.gray(` → ${a.renamedTo}`);
      } else if (a.action === 'missing-target') {
        line += chalk.gray(`  [${a.error}]`);
      } else if (a.action === 'source-exists') {
        line += chalk.gray(`  [${a.error}]`);
      }
      console.log(line);
    });
    if (actions.length > 20) console.log(chalk.gray(`  ... 共 ${actions.length} 个\n`));
    else console.log();
  }

  // 5) Dry-run / 真实执行
  if (dryRun && !apply) {
    say(chalk.yellow, '🔍 当前为 dry-run 模式');
    say(chalk.gray, '   添加 --apply 参数可执行真实回滚\n');
  } else {
    if (!json) {
      const confirmed = await confirmPrompt(`\n确定要回滚这 ${stats.restore + stats.rename + stats.overwrite} 个文件吗？`);
      if (!confirmed) {
        say(chalk.gray, '已取消。');
        return;
      }
    } else {
      logEvent('info', `开始回滚 ${stats.restore + stats.rename + stats.overwrite} 个文件`);
    }

    const spinner = (!json && !stream) ? ora('正在回滚...').start() : null;
    let success = 0;
    let fail = 0;
    const failures: Array<{ file: string; error: string }> = [];

    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.action === 'missing-target' || a.action === 'source-exists' || a.action === 'same-location') {
        continue; // 跳过不可回滚的
      }

      try {
        if (a.action === 'overwrite') {
          // 覆盖：先删源位置
          await fs.unlink(a.source);
        }

        const dest = a.action === 'rename' ? a.renamedTo! : a.source;

        // 确保目标父目录存在
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(a.target, dest);
        success++;

        if (json && stream) {
          progressEvent('move', i + 1, actions.length, a.file);
        } else if (spinner) {
          spinner.text = `正在回滚 (${i + 1}/${actions.length}): ${a.file}`;
        }
      } catch (e: any) {
        fail++;
        failures.push({ file: a.file, error: e?.message || String(e) });
        if (json && stream) errorEvent(`回滚失败: ${a.file} — ${e?.message || e}`);
      }
    }

    if (spinner) spinner.succeed(`回滚完成：成功 ${success}，失败 ${fail}`);

    // 6) 清理空目录
    let cleanedDirs = 0;
    for (const dir of removedDirs) {
      try {
        const entries = await fs.readdir(dir);
        if (entries.length === 0) {
          await fs.rmdir(dir);
          cleanedDirs++;
        }
      } catch {}
    }
    // 也尝试删上层空目录（如 by-tag / by-date）
    for (const dir of removedDirs) {
      const parents = [path.join(output, 'by-tag'), path.join(output, 'by-date')];
      for (const p of parents) {
        try {
          const entries = await fs.readdir(p);
          if (entries.length === 0) {
            await fs.rmdir(p);
          }
        } catch {}
      }
    }

    // 7) 写回退报告
    const rollbackReportPath = path.join(output, `.photo-vault-rollback-${Date.now()}.json`);
    const rollbackReport = {
      timestamp: new Date().toISOString(),
      rolledBackAt: report.timestamp,
      outputFolder: output,
      conflictStrategy: conflict,
      actions: actions.map(a => ({
        file: a.file,
        from: a.target,
        to: a.renamedTo || a.source,
        action: a.action,
        error: a.error,
      })),
      stats: { ...stats, cleanedDirs },
    };
    try {
      await fs.writeFile(rollbackReportPath, JSON.stringify(rollbackReport, null, 2));
    } catch (e) {
      if (json && stream) errorEvent(`回退报告写入失败: ${e}`);
    }

    if (!json) {
      console.log(chalk.gray(`\n📄 回退报告: ${rollbackReportPath}`));
      if (failures.length) {
        console.log(chalk.red(`\n❌ 失败明细 (${failures.length}):`));
        failures.slice(0, 10).forEach(f => console.log(chalk.gray(`  - ${f.file}: ${f.error}`)));
      }
    }

    // json 输出结果
    if (json && stream) {
      resultEvent('rollback', { ...rollbackReport, success, fail });
    }
  }

  // 退出处理
  process.off('uncaughtException', uncaughtHandler);
  process.off('unhandledRejection', unhandledRejectionHandler);

  if (json && stream) {
    await new Promise(r => setTimeout(r, 100));
    try { process.exit(0); } catch {}
  }
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function uniquePath(target: string): Promise<string> {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  let n = 1;
  while (await fileExists(path.join(dir, `${base}_rollback${n}${ext}`))) {
    n++;
  }
  return path.join(dir, `${base}_rollback${n}${ext}`);
}

async function confirmPrompt(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(chalk.yellow(message + ' (y/N): '), answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
