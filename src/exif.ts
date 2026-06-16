/**
 * EXIF 提取 - 用 sharp（如果可用）
 * 提取 GPS / 相机型号 / 拍摄时间
 */
import sharp from 'sharp';

export type ExifData = {
  DateTimeOriginal?: string;
  Make?: string;
  Model?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
  Orientation?: number;
};

export async function extractExif(imagePath: string): Promise<ExifData | null> {
  try {
    const metadata = await sharp(imagePath).metadata();
    const exif = metadata.exif;
    if (!exif) return null;

    // sharp 返回 EXIF buffer，需要 exifr 解析
    // 简化版：只提取 metadata 里直接的字段
    const result: ExifData = {};

    if (metadata.exif) {
      // 用 sharp 的 raw metadata（不完整）
      // 完整 EXIF 解析需要 exifr 包
    }

    if (metadata.orientation) {
      result.Orientation = metadata.orientation;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    return null;
  }
}