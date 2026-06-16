import { promises as fs } from 'fs';
import * as path from 'path';

export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif',
]);

export type ScannedFile = {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: Date;
};

export async function scanFolder(
  folder: string,
  recursive = true
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`⚠️  Cannot read ${dir}: ${err}`);
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      // 跳过隐藏文件 + 系统目录
      if (entry.name.startsWith('.') || entry.name === 'node_modules' ||
          entry.name === '$RECYCLE.BIN' || entry.name === 'System Volume Information') {
        continue;
      }

      if (entry.isDirectory()) {
        if (recursive) await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.stat(full);
            results.push({
              path: full,
              name: entry.name,
              ext,
              size: stat.size,
              mtime: stat.mtime,
            });
          } catch (err) {
            console.warn(`⚠️  Cannot stat ${full}: ${err}`);
          }
        }
      }
    }
  }

  await walk(folder);
  return results;
}