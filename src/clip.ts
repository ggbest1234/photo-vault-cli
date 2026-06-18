/**
 * CLIP 零样本图像分类（Large 模型版）
 * 关键：@xenova/transformers 走 dynamic import，避免与 sharp native binary 冲突
 */
import fs from 'fs';
import path from 'path';

const MODEL_ID = 'Xenova/clip-vit-large-patch14';
const HF_MIRROR = 'https://hf-mirror.com';
const CACHE_DIR = './models/clip-cache';

export function isModelDownloaded(): boolean {
  const modelDir = path.join(CACHE_DIR, 'models--Xenova--clip-vit-large-patch14');
  const snapshotsDir = path.join(modelDir, 'snapshots');
  if (fs.existsSync(snapshotsDir)) {
    try {
      return fs.readdirSync(snapshotsDir).length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

export type ClipTag = {
  label: string;
  score: number;
};

let _pipeline: any = null;
let _transformers: any = null;

async function getTransformers() {
  if (_transformers) return _transformers;
  const mod: any = await import('@xenova/transformers');
  _transformers = mod;
  const { env } = mod;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.useFS = true;
  if (HF_MIRROR) env.remoteHost = HF_MIRROR;
  return mod;
}

export async function ensureClip(): Promise<void> {
  if (_pipeline) return;
  const { pipeline } = await getTransformers();
  if (!isModelDownloaded()) {
    console.log('\n[CLIP] 需要下载 Large 模型...\n');
  }
  _pipeline = await pipeline(
    'zero-shot-image-classification',
    MODEL_ID,
    { cache_dir: CACHE_DIR }
  );
}

const CANDIDATE_LABELS = [
  'meeting', 'office', 'desk', 'laptop', 'book', 'phone',
  'kitchen', 'restaurant', 'bedroom', 'living room', 'bathroom',
  'street', 'city', 'building', 'sky', 'sunset', 'sunrise',
  'beach', 'mountain', 'snow', 'rain', 'forest', 'park',
  'food', 'coffee', 'tea', 'water', 'wine', 'fruit',
  'plant', 'flower', 'tree', 'dog', 'cat', 'bird',
  'car', 'bike', 'train', 'bus',
  'people', 'selfie', 'group', 'family', 'child',
  'screen', 'document', 'art', 'photo',
  'morning', 'afternoon', 'evening', 'night',
];

export async function clipTag(imagePath: string): Promise<ClipTag[]> {
  try {
    await ensureClip();
    if (!_pipeline) return [];
    const result = await _pipeline(imagePath, CANDIDATE_LABELS);
    return result.slice(0, 5).map((r: any) => ({
      label: r.label,
      score: r.score,
    }));
  } catch (err) {
    return [];
  }
}
