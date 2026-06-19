/**
 * ImageModal - 点击缩略图后的大图查看器
 *
 * Features:
 * - 左侧大图（用现有 thumbnail dataUrl + CSS 放大）
 * - 右侧完整元数据（EXIF / 标签 / 路径）
 * - 键盘 ESC 关闭 / ← → 切换
 * - 点击背景关闭，点击内容不关闭
 */
import { useEffect } from 'react';

export type ImageModalItem = {
  file: string;
  source: string;
  target?: string;
  thumbnail?: { dataUrl: string; width: number; height: number; source: 'exif' | 'resize' | 'cache' | 'heic-decode' };
  dateFolder: string;
  dateSource?: 'exif' | 'mtime';
  heuristicTags: string[];
  clipTags: Array<{ label: string; score: number }>;
  matchType?: 'filename' | 'tag';  // search 专用
  exif?: {
    DateTimeOriginal?: string;
    Make?: string;
    Model?: string;
    GPSLatitude?: number;
    GPSLongitude?: number;
    Orientation?: number;
  } | null;
};

type ImageModalProps = {
  items: ImageModalItem[];
  currentIndex: number;        // -1 = closed
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
};

export function ImageModal({ items, currentIndex, onClose, onNavigate }: ImageModalProps) {
  // 键盘导航
  useEffect(() => {
    if (currentIndex < 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      else if (e.key === 'ArrowRight' && currentIndex < items.length - 1) onNavigate(currentIndex + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, items.length, onClose, onNavigate]);

  if (currentIndex < 0 || !items[currentIndex]) return null;

  const item = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="关闭 (ESC)">×</button>
        {hasPrev && (
          <button className="modal-nav modal-prev" onClick={() => onNavigate(currentIndex - 1)} title="上一张 (←)">
            ‹
          </button>
        )}
        {hasNext && (
          <button className="modal-nav modal-next" onClick={() => onNavigate(currentIndex + 1)} title="下一张 (→)">
            ›
          </button>
        )}

        <div className="modal-body">
          {/* 左侧：大图 */}
          <div className="modal-image-area">
            {item.thumbnail ? (
              <img
                src={item.thumbnail.dataUrl}
                alt={item.file}
                className="modal-image"
              />
            ) : (
              <div className="modal-image-placeholder">
                {item.matchType === 'filename' ? '📄' : item.matchType === 'tag' ? '🏷️' : '🖼️'}
                <div className="muted">无缩略图</div>
              </div>
            )}
            <div className="modal-image-counter">
              {currentIndex + 1} / {items.length}
            </div>
          </div>

          {/* 右侧：元数据 */}
          <div className="modal-meta">
            <h3 className="modal-title" title={item.file}>{item.file}</h3>

            <ModalSection title="📅 日期">
              <div className="modal-row">
                <span className="modal-label">归类日期:</span>
                <span className="modal-value">{item.dateFolder || 'unknown'}</span>
              </div>
              {item.dateSource && (
                <div className="modal-row">
                  <span className="modal-label">日期来源:</span>
                  <span className={`date-source-badge ds-${item.dateSource}`}>
                    {item.dateSource === 'exif' ? '📷 EXIF 拍摄时间' : '🕐 文件修改时间'}
                  </span>
                </div>
              )}
              {item.exif?.DateTimeOriginal && (
                <div className="modal-row">
                  <span className="modal-label">EXIF 时间:</span>
                  <span className="modal-value">{item.exif.DateTimeOriginal}</span>
                </div>
              )}
            </ModalSection>

            {item.thumbnail && (
              <ModalSection title="🖼️ 缩略图">
                <div className="modal-row">
                  <span className="modal-label">来源:</span>
                  <span className={`thumb-src-badge src-${item.thumbnail.source}`}>
                    {item.thumbnail.source === 'exif' ? 'EXIF 嵌入' : item.thumbnail.source === 'cache' ? '缓存' : item.thumbnail.source === 'heic-decode' ? 'HEIC 解码' : 'sharp 缩放'}
                  </span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">尺寸:</span>
                  <span className="modal-value">{item.thumbnail.width}×{item.thumbnail.height}</span>
                </div>
              </ModalSection>
            )}

            {item.heuristicTags.length > 0 && (
              <ModalSection title="🏷️ 启发式标签">
                <div className="tag-cloud">
                  {item.heuristicTags.map((t, i) => (
                    <span key={i} className="tag-chip">{t}</span>
                  ))}
                </div>
              </ModalSection>
            )}

            {item.clipTags.length > 0 && (
              <ModalSection title="🤖 CLIP AI 标签">
                <div className="modal-row">
                  {item.clipTags.slice(0, 10).map((t, i) => (
                    <span key={i} className="score-tag">
                      {t.label} <strong>({t.score.toFixed(3)})</strong>
                    </span>
                  ))}
                </div>
              </ModalSection>
            )}

            {item.exif && Object.keys(item.exif).length > 0 && (
              <ModalSection title="📷 EXIF 元数据">
                {item.exif.Make && (
                  <div className="modal-row">
                    <span className="modal-label">相机:</span>
                    <span className="modal-value">{item.exif.Make} {item.exif.Model || ''}</span>
                  </div>
                )}
                {item.exif.GPSLatitude !== undefined && item.exif.GPSLongitude !== undefined && (
                  <div className="modal-row">
                    <span className="modal-label">GPS:</span>
                    <span className="modal-value">
                      {item.exif.GPSLatitude.toFixed(6)}, {item.exif.GPSLongitude.toFixed(6)}
                    </span>
                  </div>
                )}
                {item.exif.Orientation !== undefined && (
                  <div className="modal-row">
                    <span className="modal-label">方向:</span>
                    <span className="modal-value">{item.exif.Orientation}°</span>
                  </div>
                )}
              </ModalSection>
            )}

            <ModalSection title="📁 路径">
              <div className="modal-row">
                <span className="modal-label">源文件:</span>
                <code className="modal-path" onClick={() => navigator.clipboard?.writeText(item.source)} title="点击复制">
                  {item.source}
                </code>
              </div>
              {item.target && (
                <div className="modal-row">
                  <span className="modal-label">目标:</span>
                  <code className="modal-path" onClick={() => navigator.clipboard?.writeText(item.target || '')} title="点击复制">
                    {item.target}
                  </code>
                </div>
              )}
            </ModalSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="modal-section">
      <h4 className="modal-section-title">{title}</h4>
      <div className="modal-section-body">{children}</div>
    </div>
  );
}
