/**
 * 中文标签翻译器
 * - 加载 src/data/zh-mapping.json（用户/项目级）
 * - 加载用户级 overrides（GUI 写入的翻译）
 * - 启发式后缀处理（-ing/-ed/-ly）
 * - 提供 tagEn -> tagZh 翻译 + 未翻译列表
 */
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _map: Record<string, string> | null = null;
let _overridePath: string | null = null;

function loadFromFile(mapPath: string): Record<string, string> {
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
    return flat;
  } catch {
    return {};
  }
}

/** 加载基础翻译表（built-in） */
function loadBaseMap(): Record<string, string> {
  const here = __dirname;
  const candidates = [
    path.join(here, 'data', 'zh-mapping.json'),
    path.join(here, '..', 'src', 'data', 'zh-mapping.json'),
  ];
  for (const mapPath of candidates) {
    const m = loadFromFile(mapPath);
    if (Object.keys(m).length > 0) return m;
  }
  return {};
}

/** 加载用户级 overrides（GUI 写入） */
function loadOverrides(overridePath: string | null): Record<string, string> {
  if (!overridePath) return {};
  return loadFromFile(overridePath);
}

/** 设置 overrides 路径（CLI 调用） */
export function setOverridePath(p: string | null): void {
  _overridePath = p;
  _map = null;  // 强制重载
}

/** 获取合并的翻译表（base + overrides） */
export function loadZhMap(): Record<string, string> {
  if (_map) return _map;
  const base = loadBaseMap();
  const overrides = loadOverrides(_overridePath);
  _map = { ...base, ...overrides };  // overrides 优先
  return _map;
}

/** 重置缓存（用户改文件后调用） */
export function reloadZhMap(): Record<string, string> {
  _map = null;
  return loadZhMap();
}

/**
 * 启发式后缀处理：running -> run, walked -> walk, slowly -> slow
 * 处理 -ing/-ed/-ly/-s/-es 等
 */
function stemSuffix(tag: string): string | null {
  const lower = tag.toLowerCase();
  // -ing: running -> run, walking -> walk, sitting -> sit
  if (lower.endsWith('ing') && lower.length > 5) {
    const stripped = lower.slice(0, -3);
    // doubled consonant: running -> runn -> run
    if (stripped.length >= 4 && stripped[stripped.length - 1] === stripped[stripped.length - 2]) {
      return stripped.slice(0, -1);
    }
    return stripped;
  }
  // -ed
  if (lower.endsWith('ed') && lower.length > 4) {
    const stripped = lower.slice(0, -2);
    // walked -> walk; danced -> danc (希望匹配 dance -> )
    return stripped;
  }
  // -ly
  if (lower.endsWith('ly') && lower.length > 4) {
    return lower.slice(0, -2);
  }
  // -es
  if (lower.endsWith('es') && lower.length > 4) {
    return lower.slice(0, -2);
  }
  // -s
  if (lower.endsWith('s') && lower.length > 3) {
    return lower.slice(0, -1);
  }
  return null;
}

/** 翻译单个标签 — 带启发式 fallback */
export function translateTag(tag: string, customMap?: Record<string, string>): string {
  const map = customMap || loadZhMap();
  // 1. 直接查
  if (map[tag]) return map[tag];
  // 2. 小写查
  const lower = tag.toLowerCase();
  if (map[lower]) return map[lower];
  // 3. 启发式后缀处理
  const stem = stemSuffix(tag);
  if (stem && map[stem]) return map[stem];
  // 4. 去掉空格和特殊字符
  const norm = tag.replace(/[-_\s]/g, '');
  if (map[norm]) return map[norm];
  // 5. 找不到：返回原值（标记未翻译）
  return tag;
}

/** 批量翻译 */
export function translateTags(tags: string[], customMap?: Record<string, string>): string[] {
  return tags.map(t => translateTag(t, customMap));
}

/**
 * 返回 (translated, untranslated) 两个数组
 * untranslated 用于 GUI 提示用户填翻译
 */
export function translateTagsWithMeta(
  tags: string[],
  customMap?: Record<string, string>
): { translated: Array<{ en: string; zh: string }>; untranslated: string[] } {
  const map = customMap || loadZhMap();
  const translated: Array<{ en: string; zh: string }> = [];
  const untranslated: string[] = [];
  for (const tag of tags) {
    const zh = translateTag(tag, map);
    if (zh === tag && !map[tag] && !map[tag.toLowerCase()]) {
      untranslated.push(tag);
    } else {
      translated.push({ en: tag, zh });
    }
  }
  return { translated, untranslated };
}

/**
 * 添加用户翻译并保存（CLI/GUI 都能用）
 * 立即持久化到 override 文件
 */
export function addOverride(
  tag: string,
  zh: string,
  overridePath?: string
): { ok: boolean; path: string; total: number } {
  const targetPath = overridePath || _overridePath;
  if (!targetPath) {
    return { ok: false, path: '', total: 0 };
  }
  // 读现有 overrides
  let current: Record<string, any> = {};
  try {
    const buf = fs.readFileSync(targetPath, 'utf-8');
    current = JSON.parse(buf);
  } catch {}
  // 确保有 _user_added 段
  if (!current._user_added) current._user_added = {};
  current._user_added[tag] = zh;
  // 写文件
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(current, null, 2), 'utf-8');
    _map = null;  // 强制下次重载
    return { ok: true, path: targetPath, total: Object.keys(current._user_added).length };
  } catch (e) {
    return { ok: false, path: targetPath, total: 0 };
  }
}