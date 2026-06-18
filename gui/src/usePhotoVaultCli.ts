/**
 * usePhotoVaultCli - 封装与 photo-vault CLI 的所有交互
 *
 * 协议：CLI 必须带 --json --stream，stdout 输出 JSON Lines
 *   {"type":"log", ...} | {"type":"progress", ...} | {"type":"result", ...} | {"type":"error", ...}
 */
import { useCallback, useRef, useState } from 'react';
import { Command } from '@tauri-apps/plugin-shell';

/* ----------- 类型 ----------- */
export type CliEvent =
  | { type: 'log'; level: 'info' | 'warn' | 'error' | 'success'; message: string }
  | { type: 'progress'; phase: 'scan' | 'analyze' | 'move'; current: number; total: number; file?: string }
  | { type: 'result'; command: string; data: any }
  | { type: 'error'; message: string };

export type Progress = { phase: 'scan' | 'analyze' | 'move'; current: number; total: number; file?: string } | null;

export type LogLine = { level: 'info' | 'warn' | 'error' | 'success'; message: string; ts: number };

export type RunState = 'idle' | 'running' | 'done' | 'error';

export type OrganizeResult = {
  timestamp: string;
  sourceFolder: string;
  outputFolder: string;
  totalFiles: number;
  mode: string;
  threshold: number;
  concurrency: number;
  cacheHits: number;
  durationMs: number;
  plans: Array<{
    file: string;
    source: string;
    target: string;
    targetFolder: string;
    heuristicTags: string[];
    clipTags: Array<{ label: string; score: number }>;
    dateFolder: string;
    thumbnail?: {
      dataUrl: string;
      width: number;
      height: number;
      source: 'exif' | 'resize' | 'cache';
    };
  }>;
};

export type SearchResult = {
  query: string;
  count: number;
  results: Array<{
    path: string;
    name: string;
    matchType: 'filename' | 'tag';
    tags: string[];
    clipScores?: Array<{ label: string; score: number }>;
    thumbnail?: {
      dataUrl: string;
      width: number;
      height: number;
      source: 'exif' | 'resize' | 'cache';
    };
  }>;
};

export type ScanResult = {
  folder: string;
  total: number;
  totalSizeMB: number;
  avgSizeKB: number;
  byExt: Record<string, number>;
  topLargest: Array<{ path: string; sizeMB: number }>;
};

/* ----------- Hook ----------- */
export function usePhotoVaultCli(cliCwd: string) {
  const [state, setState] = useState<RunState>('idle');
  const [progress, setProgress] = useState<Progress>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [organizeResult, setOrganizeResult] = useState<OrganizeResult | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  const appendLog = useCallback((line: Omit<LogLine, 'ts'>) => {
    setLogs((prev) => [...prev, { ...line, ts: Date.now() }].slice(-500));
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setProgress(null);
    setLogs([]);
    setOrganizeResult(null);
    setSearchResult(null);
    setScanResult(null);
    setErrorMsg(null);
  }, []);

  /** 通用：跑一条 CLI 命令并流式消费 stdout
   *
   * 优先用编译版 `node dist/index.js`（更稳、更快）
   * 若 dist 不存在则回退到 `npx tsx src/index.ts`（开发态）
   */
  const run = useCallback(
    async (args: string[]) => {
      setState('running');
      setProgress(null);
      setLogs([]);
      setErrorMsg(null);
      cancelledRef.current = false;

      try {
        // 直接用编译版 dist/index.js — 避开 npx/tsx shim 在 Windows 上的兼容问题
        // 若 dist 不存在，CLI 端会报 ENOENT，错误会回传到 stderr
        const fullArgs = ['dist/index.js', ...args, '--json', '--stream'];
        const cmd = Command.create('node', fullArgs, { cwd: cliCwd });

        let resultData: any = null;
        let buf = '';

        cmd.stdout.on('data', (chunk: string) => {
          if (cancelledRef.current) return;
          buf += chunk;
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              const ev = JSON.parse(line) as CliEvent;
              handleEvent(ev);
            } catch {
              appendLog({ level: 'info', message: line });
            }
          }
        });

        cmd.stderr.on('data', (chunk: string) => {
          if (cancelledRef.current) return;
          chunk.split(/\r?\n/).filter(Boolean).forEach((l) => appendLog({ level: 'error', message: l }));
        });

        const handleEvent = (ev: CliEvent) => {
          if (ev.type === 'log') {
            appendLog({ level: ev.level, message: ev.message });
          } else if (ev.type === 'progress') {
            setProgress({ phase: ev.phase, current: ev.current, total: ev.total, file: ev.file });
          } else if (ev.type === 'result') {
            resultData = ev.data;
          } else if (ev.type === 'error') {
            appendLog({ level: 'error', message: ev.message });
            setErrorMsg(ev.message);
          }
        };

        const child = await cmd.spawn();
        void child;
        await new Promise<void>((resolve) => {
          cmd.on('close', () => resolve());
        });

        if (cancelledRef.current) {
          setState('idle');
          return null;
        }

        setState('done');
        return resultData;
      } catch (err: any) {
        appendLog({ level: 'error', message: String(err?.message || err) });
        setErrorMsg(String(err?.message || err));
        setState('error');
        return null;
      }
    },
    [cliCwd, appendLog]
  );

  const runOrganize = useCallback(
    async (opts: { folder: string; mode: 'combined' | 'date' | 'clip' | 'heuristic'; limit: number; threshold: number; concurrency: number; apply: boolean; thumbs: boolean; thumbSize: number; output?: string }) => {
      const args = [
        'organize',
        opts.folder,
        '--mode', opts.mode,
        '--limit', String(opts.limit),
        '--threshold', String(opts.threshold),
        '--concurrency', String(opts.concurrency),
        opts.thumbs ? '--thumbs' : '',
        opts.thumbs ? '--thumb-size' : '',
        opts.thumbs ? String(opts.thumbSize) : '',
        opts.apply ? '--apply' : '',
        opts.output ? `--output ${opts.output}` : '',
      ].filter(Boolean) as string[];
      const data = (await run(args)) as OrganizeResult | null;
      if (data) setOrganizeResult(data);
      return data;
    },
    [run]
  );

  const runSearch = useCallback(
    async (opts: { folder: string; query: string; useCache: boolean; cachePath?: string; thumbs: boolean; thumbSize: number; concurrency: number; withClip: boolean }) => {
      const args = [
        'search',
        opts.folder,
        opts.query,
        opts.useCache && opts.cachePath ? `--cache ${opts.cachePath}` : '--no-cache',
        opts.thumbs ? '--thumbs' : '',
        opts.thumbs ? '--thumb-size' : '',
        opts.thumbs ? String(opts.thumbSize) : '',
        opts.thumbs ? '--concurrency' : '',
        opts.thumbs ? String(opts.concurrency) : '',
        opts.withClip ? '--with-clip' : '',
      ].filter(Boolean) as string[];
      const data = (await run(args)) as SearchResult | null;
      if (data) setSearchResult(data);
      return data;
    },
    [run]
  );

  const runScan = useCallback(
    async (opts: { folder: string }) => {
      const data = (await run(['scan', opts.folder])) as ScanResult | null;
      if (data) setScanResult(data);
      return data;
    },
    [run]
  );

  return {
    state,
    progress,
    logs,
    errorMsg,
    organizeResult,
    searchResult,
    scanResult,
    runOrganize,
    runSearch,
    runScan,
    reset,
  };
}
