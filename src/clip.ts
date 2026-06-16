/**
 * CLIP 零样本图像分类
 *
 * 用 Xenova/clip-vit-base-patch32 模型
 * 模型需预下载到 node_modules/@xenova/transformers/models/Xenova/clip-vit-base-patch32/
 * 或首次运行时自动从 HuggingFace 下载（需代理）
 */
import { pipeline, env } from '@xenova/transformers';

// 允许使用本地模型（避免去远程拉）
env.allowLocalModels = true;
env.useBrowserCache = false;
env.useFS = true;

// 可选：设置 HuggingFace 镜像（国内环境）
// env.remoteHost = 'https://hf-mirror.com';

let _classifier: any = null;
let _loading: Promise<void> | null = null;

const CANDIDATE_LABELS = [
  // 室内
  'meeting', 'office', 'desk', 'laptop', 'book', 'notebook', 'phone',
  'kitchen', 'restaurant', 'bedroom', 'living room', 'window', 'bathroom',
  // 室外
  'street', 'city', 'building', 'sky', 'sunset', 'sunrise',
  'beach', 'mountain', 'snow', 'rain', 'forest', 'park', 'garden', 'river',
  // 物体
  'food', 'coffee', 'tea', 'water', 'wine', 'fruit', 'bread',
  'plant', 'flower', 'tree',
  'car', 'bike', 'train', 'bus',
  'dog', 'cat', 'bird', 'fish',
  // 人
  'people', 'selfie', 'group', 'family', 'friend', 'child', 'baby',
  'hand', 'face', 'smile',
  // 物品
  'paper', 'document', 'screen', 'art', 'painting', 'photo', 'poster',
  'computer', 'keyboard', 'mouse', 'cable', 'charger',
  'clothes', 'shoes', 'hat', 'bag',
  // 抽象
  'morning', 'afternoon', 'evening', 'night',
  'spring', 'summer', 'autumn', 'winter',
];

export type ClipTag = {
  label: string;
  score: number;
};

export async function ensureClip(): Promise<void> {
  if (_classifier) return;
  if (_loading) return _loading;

  _loading = (async () => {
    _classifier = await pipeline(
      'zero-shot-image-classification',
      'Xenova/clip-vit-base-patch32'
    );
  })();

  return _loading;
}

export async function clipTag(imagePath: string): Promise<ClipTag[]> {
  try {
    await ensureClip();
    if (!_classifier) return [];
    const result = await _classifier(imagePath, CANDIDATE_LABELS);
    return (result as any[]).slice(0, 5).map((r: any) => ({
      label: r.label,
      score: r.score,
    }));
  } catch (err) {
    console.error(`CLIP failed for ${imagePath}:`, (err as Error).message);
    return [];
  }
}

export function isClipAvailable(): boolean {
  return _classifier !== null;
}