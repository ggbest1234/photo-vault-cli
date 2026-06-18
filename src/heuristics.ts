/**
 * 启发式标签 - 不依赖 CLIP（已扩展）
 */
import type { ScannedFile } from './scanner.js';
import type { ExifData } from './exif.js';

// 业务名映射（可扩展）
const BUSINESS_MAP: Record<string, string> = {
  'humai-huhu': 'hystory-06',
  'yumu-hunzhu': 'hystory-06',
  'lu-wei-ma': 'hystory-08',
  'zhiluma': 'hystory-08',
  'wenji-qiwu': 'hystory-36',
  'yugong-yishan': 'hystory-37',
  'tui-er-qiu-qi-ci': 'hystory-38',
  'suanszi': 'suanszi-content',
};

export async function heuristicTag(
  file: ScannedFile,
  exif: ExifData | null
): Promise<string[]> {
  const tags: string[] = [];
  const name = file.name.toLowerCase();

  // 1. 常见文件类型标记
  if (name.includes('banner')) tags.push('banner');
  if (name.includes('illustration')) tags.push('illustration');
  if (name.includes('screenshot')) tags.push('screenshot');
  if (name.includes('photo')) tags.push('photo');
  if (name.includes('image')) tags.push('image');

  // 2. 日期标记
  const dateMatch = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (dateMatch) {
    tags.push(`date:${dateMatch[0].replace(/_/g, '-')}`);
  }

  // 3. 业务名映射
  for (const [key, value] of Object.entries(BUSINESS_MAP)) {
    if (name.includes(key)) {
      tags.push(value);
      break;
    }
  }

  // 4. 时间规律（基于文件修改时间）
  const mtime = new Date(file.mtime);
  const hour = mtime.getHours();
  if (hour >= 21 || hour < 5) {
    tags.push('night');
  } else if (hour >= 5 && hour < 8) {
    tags.push('morning');
  } else if (hour >= 18 && hour < 21) {
    tags.push('evening');
  }

  // 5. EXIF 信息
  if (exif?.GPSLatitude && exif?.GPSLongitude) {
    tags.push('geo-tagged');
  }
  if (exif?.Make || exif?.Model) {
    tags.push('camera-shot');
  }

  // 6. AI 生成图判断（通常没有 EXIF）
  if (!exif && tags.length === 0) {
    tags.push('mmx-output');
  }

  // 7. 扩展：常见场景关键词
  if (name.includes('beach') || name.includes('sea')) tags.push('beach');
  if (name.includes('mountain')) tags.push('mountain');
  if (name.includes('city') || name.includes('street')) tags.push('city');
  if (name.includes('food') || name.includes('eat')) tags.push('food');
  if (name.includes('dog') || name.includes('cat')) tags.push('pet');

  return tags;
}