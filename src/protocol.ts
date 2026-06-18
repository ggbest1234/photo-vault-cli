/**
 * CLI ⇄ GUI 通信协议
 *  - GUI 调 `npx tsx src/index.ts <cmd> ... --json --stream`
 *  - CLI 向 stdout 写 JSON Lines，每行一个 event
 *  - event.type ∈ { "log" | "progress" | "result" | "error" }
 */
export type CliLogLevel = 'info' | 'warn' | 'error' | 'success';
export type CliPhase = 'scan' | 'analyze' | 'move';

export type CliEvent =
  | { type: 'log'; level: CliLogLevel; message: string }
  | { type: 'progress'; phase: CliPhase; current: number; total: number; file?: string }
  | { type: 'result'; command: string; data: unknown }
  | { type: 'error'; message: string };

export function emit(event: CliEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

export function logEvent(level: CliLogLevel, message: string): void {
  emit({ type: 'log', level, message });
}

export function progressEvent(phase: CliPhase, current: number, total: number, file?: string): void {
  emit({ type: 'progress', phase, current, total, file });
}

export function resultEvent(command: string, data: unknown): void {
  emit({ type: 'result', command, data });
}

export function errorEvent(message: string): void {
  emit({ type: 'error', message });
}

/** 解析 --json / --stream 标志 */
export function parseStreamFlags(args: string[]): { json: boolean; stream: boolean; rest: string[] } {
  let json = false;
  let stream = false;
  const rest: string[] = [];
  for (const a of args) {
    if (a === '--json') json = true;
    else if (a === '--stream') stream = true;
    else rest.push(a);
  }
  return { json, stream, rest };
}
