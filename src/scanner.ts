import { promises as fs } from 'fs';
import * as path from 'path';

export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif',
]);

export const SKIP_DIRS = new Set([
  'node_modules', '$RECYCLE.BIN', 'System Volume Information',
]);

export type ScannedFile = {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: Date;
};

export type ScanOptions = {
  recursive?: boolean;
  skip?: string[];
};

export async function scanFolder(
  folder: string,
  options: ScanOptions | boolean = true
): Promise<ScannedFile[]> {
  // 向后兼容：允许传 boolean（旧签名）
  const recursive = typeof options === 'boolean' ? options : (options.recursive !== false);
  const skip = typeof options === 'boolean' ? [] : (options.skip || []);
  const skipSet = new Set([...SKIP_DIRS, ...skip]);

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

      if (entry.name.startsWith('.') || skipSet.has(entry.name)) {
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
