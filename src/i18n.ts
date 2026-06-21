/**
 * 中文标签翻译器
 * - 加载 src/data/zh-mapping.json（用户可扩展）
 * - 提供 tagEn -> tagZh 翻译
 * - 支持运行时用户 override（GUI 选项）
 */
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _map: Record<string, string> | null = null;

/** 加载翻译表（lazy + cache）
 * 兼容 dist 部署和 src dev：
 *  - dist/i18n.js -> dist/data/zh-mapping.json
 *  - src/i18n.ts  -> src/data/zh-mapping.json
 *  fallback chain
 */
export function loadZhMap(customPath?: string): Record<string, string> {
  if (_map) return _map;
  const here = path.dirname(fileURLToPath(import.meta.url));
  // 1. 用户指定
  // 2. 同目录 data/
  // 3. 上级目录 data/（dev src/i18n.ts 时 dist/ 不存在）
  const candidates = customPath
    ? [customPath]
    : [
        path.join(here, 'data', 'zh-mapping.json'),
        path.join(here, '..', 'src', 'data', 'zh-mapping.json'),
      ];
  for (const mapPath of candidates) {
    try {
      const buf = fs.readFileSync(mapPath, 'utf-8');
      const parsed = JSON.parse(buf);
      const flat: Record<string, string> = {};
      for (const section of Object.values(parsed)) {
        if (typeof section === 'object' && section !== null) {
          for (const [k, v] of Object.entries(section as Record<string, string>)) {
            if (k.startsWith('_')) continue;
            flat[k] = v as string;
          }
        }
      }
      _map = flat;
      return flat;
    } catch {}
  }
  _map = {};
  return {};
}

/** 重置缓存（用户改了 json 后调用） */
export function reloadZhMap(customPath?: string): Record<string, string> {
  _map = null;
  return loadZhMap(customPath);
}

/** 翻译单个标签（找不到返回原值） */
export function translateTag(tag: string, customMap?: Record<string, string>): string {
  const map = customMap || loadZhMap();
  return map[tag] || map[tag.toLowerCase()] || tag;
}

/** 批量翻译（保留顺序和去重） */
export function translateTags(tags: string[], customMap?: Record<string, string>): string[] {
  return tags.map(t => translateTag(t, customMap));
}
