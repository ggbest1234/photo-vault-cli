/**
 * EXIF 提取 - 使用 exifr（纯 JS，无原生依赖，Windows 友好）
 */
// @ts-ignore
import exifr from 'exifr';

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
    // @ts-ignore
    const exif = await exifr.parse(imagePath, {
      pick: ['DateTimeOriginal', 'Make', 'Model', 'GPSLatitude', 'GPSLongitude', 'Orientation']
    });

    if (!exif) return null;

    return {
      DateTimeOriginal: exif.DateTimeOriginal,
      Make: exif.Make,
      Model: exif.Model,
      GPSLatitude: exif.GPSLatitude,
      GPSLongitude: exif.GPSLongitude,
      Orientation: exif.Orientation
    };
  } catch (err) {
    return null;
  }
}