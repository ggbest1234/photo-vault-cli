/**
 * 启发式标签 - 不依赖 CLIP / EXIF 解析
 *
 * 规则：
 *   1. 文件名包含 banner → tag: banner
 *   2. 文件名包含 illustration → tag: illustration
 *   3. 文件名含日期 (YYYY-MM-DD) → tag: date:YYYY-MM-DD
 *   4. 业务名映射 → tag: hystory-XX / suanszi-XX
 *   5. 拍摄时间晚 21-23 点 → tag: night
 *   6. 拍摄时间早 5-7 点 → tag: morning
 *   7. 文件名含 stock-photo 标记 → tag: stock
 */
import type { ScannedFile } from './scanner.js';
import type { ExifData } from './exif.js';

// 业务名映射
const BUSINESS_MAP: Record<string, string> = {
  'humai-huhu': 'hystory-06',      // 鱼目混珠
  'yumu-hunzhu': 'hystory-06',
  'lu-wei-ma': 'hystory-08',        // 鹿为马（指鹿为马）
  'zhiluma': 'hystory-08',
  'wenji-qiwu': 'hystory-36',       // 闻鸡起舞
  'yugong-yishan': 'hystory-37',    // 愚公移山
  'tui-er-qiu-qi-ci': 'hystory-38', // 退而求其次
  'suanszi': 'suanszi-content',     // 算子次元
};

export async function heuristicTag(
  file: ScannedFile,
  exif: ExifData | null
): Promise<string[]> {
  const tags: string[] = [];
  const name = file.name.toLowerCase();

  // 1. banner / illustration
  if (name.includes('banner')) tags.push('banner');
  if (name.includes('illustration')) tags.push('illustration');

  // 2. 日期标记 (YYYY-MM-DD)
  const dateMatch = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (dateMatch) {
    tags.push(`date:${dateMatch[0].replace(/_/g, '-')}`);
  }

  // 3. 业务名映射
  for (const [key, value] of Object.entries(BUSINESS_MAP)) {
    if (name.includes(key)) {
      tags.push(value);
      break;  // 只取第一个匹配
    }
  }

  // 4. 时间规律（晚 21-23 点）
  const mtime = new Date(file.mtime);
  const hour = mtime.getHours();
  if (hour >= 21 || hour < 5) {
    tags.push('night');
  } else if (hour >= 5 && hour < 8) {
    tags.push('morning');
  } else if (hour >= 18 && hour < 21) {
    tags.push('evening');
  }

  // 5. EXIF 有 GPS
  if (exif?.GPSLatitude && exif?.GPSLongitude) {
    tags.push('geo-tagged');
  }

  // 6. EXIF 有相机型号（说明是相机拍的，不是下载的）
  if (exif?.Make || exif?.Model) {
    tags.push('camera-shot');
  }

  // 7. mmx output 标记（AI 生成的图通常没 EXIF）
  if (!exif && tags.length === 0) {
    tags.push('mmx-output');
  }

  return tags;
}