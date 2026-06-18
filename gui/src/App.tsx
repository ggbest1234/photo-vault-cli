import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { usePhotoVaultCli, type Progress, type ScanResult } from './usePhotoVaultCli';
import './App.css';

type Tab = 'organize' | 'search';

const DEFAULT_CLI_CWD = 'F:\\Grok\\photo-vault-test';

function App() {
  const [tab, setTab] = useState<Tab>('organize');
  const [cliCwd, setCliCwd] = useState(DEFAULT_CLI_CWD);

  const cli = usePhotoVaultCli(cliCwd);

  return (
    <main className="container">
      <header className="header">
        <h1>📸 Photo Vault</h1>
        <p className="subtitle">本地 AI 照片整理 · CLI 内核驱动</p>

        <div className="cwd-row">
          <label>CLI 目录</label>
          <input
            value={cliCwd}
            onChange={(e) => setCliCwd(e.target.value)}
            placeholder="F:\Grok\photo-vault-test"
          />
        </div>

        <div className="tabs">
          <button className={tab === 'organize' ? 'active' : ''} onClick={() => { cli.reset(); setTab('organize'); }}>
            🗂️ 整理
          </button>
          <button className={tab === 'search' ? 'active' : ''} onClick={() => { cli.reset(); setTab('search'); }}>
            🔍 搜索
          </button>
        </div>
      </header>

      {tab === 'organize' && <OrganizeTab cli={cli} />}
      {tab === 'search' && <SearchTab cli={cli} />}

      <RunPanel cli={cli} />
    </main>
  );
}

/* ============== Organize ============== */
function OrganizeTab({ cli }: { cli: ReturnType<typeof usePhotoVaultCli> }) {
  const [folder, setFolder] = useState('');
  const [mode, setMode] = useState<'combined' | 'date' | 'clip' | 'heuristic'>('combined');
  const [limit, setLimit] = useState(0);
  const [limitAuto, setLimitAuto] = useState(true);   // true = 跟随 scan 结果
  const [threshold, setThreshold] = useState(0.1);
  const [concurrency, setConcurrency] = useState(2);
  const [apply, setApply] = useState(false);
  const [thumbs, setThumbs] = useState(true);
  const [thumbSize, setThumbSize] = useState(240);

  const pickFolder = async () => {
    const f = await open({ directory: true });
    if (f) setFolder(f as string);
  };

  // folder 变化 → 自动扫描
  useEffect(() => {
    if (!folder) return;
    if (cli.state === 'running') return;
    cli.runScan({ folder }).then((result) => {
      if (result && limitAuto) {
        setLimit(result.total);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const submit = () => {
    if (!folder) return alert('请选择照片文件夹');
    if (cli.scanResult?.total === 0) return alert('该文件夹没有找到图片文件');
    cli.runOrganize({ folder, mode, limit, threshold, concurrency, apply, thumbs, thumbSize });
  };

  return (
    <section className="card">
      <h3>🗂️ 智能整理</h3>

      <div className="section">
        <label>照片文件夹</label>
        <div className="row">
          <button className="btn btn-secondary" onClick={pickFolder}>📁 选择文件夹</button>
          {folder && <div className="path-box">{folder}</div>}
          {folder && (
            <button
              className="btn btn-secondary btn-mini"
              onClick={() => cli.runScan({ folder })}
              disabled={cli.state === 'running'}
              title="重新扫描"
            >
              🔄 重新扫描
            </button>
          )}
        </div>
      </div>

      {/* 扫描结果摘要 */}
      {cli.scanResult && <ScanSummary scan={cli.scanResult} scanning={cli.state === 'running' && !cli.organizeResult} />}

      <div className="grid-2">
        <div className="section">
          <label>归类模式</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="combined">综合 (启发式 + CLIP)</option>
            <option value="clip">仅 CLIP AI 识别</option>
            <option value="heuristic">仅启发式（无 AI）</option>
            <option value="date">仅按日期</option>
          </select>
        </div>
        <div className="section">
          <label>
            限制数量
            {limitAuto && cli.scanResult && <span className="auto-badge">（自动 = 全部 {cli.scanResult.total}）</span>}
            {limit === 0 && <span className="auto-badge">（0 = 全部）</span>}
          </label>
          <input
            type="number"
            value={limit}
            onChange={(e) => { setLimit(parseInt(e.target.value) || 0); setLimitAuto(false); }}
            onFocus={() => setLimitAuto(false)}
          />
        </div>
        <div className="section">
          <label>CLIP 置信度阈值 ({threshold})</label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
          />
        </div>
        <div className="section">
          <label>并发数 ({concurrency})</label>
          <input
            type="range" min={1} max={8} step={1}
            value={concurrency}
            onChange={(e) => setConcurrency(parseInt(e.target.value))}
          />
        </div>
      </div>

      <div className="section checkbox-row">
        <label>
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
          <span>真实移动文件（不勾选 = dry-run 预览）</span>
        </label>
      </div>

      <div className="section checkbox-row">
        <label>
          <input type="checkbox" checked={thumbs} onChange={(e) => setThumbs(e.target.checked)} />
          <span>生成缩略图（{thumbSize}px，GUI 预览用）</span>
        </label>
      </div>

      {thumbs && (
        <div className="section">
          <label>缩略图边长 ({thumbSize}px)</label>
          <input
            type="range" min={120} max={480} step={20}
            value={thumbSize}
            onChange={(e) => setThumbSize(parseInt(e.target.value))}
          />
        </div>
      )}

      <button
        className="btn btn-primary big"
        onClick={submit}
        disabled={cli.state === 'running' || !folder || !cli.scanResult}
      >
        {cli.state === 'running' ? '⏳ 运行中...' : apply ? '🚀 开始整理（会移动文件）' : '👀 预览整理计划'}
      </button>

      {cli.organizeResult && <OrganizeResultView result={cli.organizeResult} />}
    </section>
  );
}

/* ============== 扫描结果摘要 ============== */
function ScanSummary({ scan, scanning }: { scan: ScanResult; scanning: boolean }) {
  const extEntries = Object.entries(scan.byExt).sort((a, b) => b[1] - a[1]);
  return (
    <div className="scan-summary">
      <div className="scan-stats">
        <div className="stat">
          <div className="stat-value">{scan.total}</div>
          <div className="stat-label">图片</div>
        </div>
        <div className="stat">
          <div className="stat-value">{scan.totalSizeMB.toFixed(1)}</div>
          <div className="stat-label">MB</div>
        </div>
        <div className="stat">
          <div className="stat-value">{scan.avgSizeKB.toFixed(0)}</div>
          <div className="stat-label">平均 KB</div>
        </div>
        <div className="stat">
          <div className="stat-value">{extEntries.length}</div>
          <div className="stat-label">格式</div>
        </div>
      </div>
      <div className="scan-exts">
        {extEntries.map(([ext, n]) => (
          <span key={ext} className="ext-chip">
            {ext} <span className="count">{n}</span>
          </span>
        ))}
      </div>
      {scanning && <div className="scan-loading">⏳ 扫描中...</div>}
    </div>
  );
}

function OrganizeResultView({ result }: { result: NonNullable<ReturnType<typeof usePhotoVaultCli>['organizeResult']> }) {
  const [filter, setFilter] = useState('');
  const [showThumbs, setShowThumbs] = useState(true);
  const visible = result.plans.filter((p) => !filter || p.targetFolder.includes(filter) || p.file.includes(filter));
  const byTag = new Map<string, number>();
  result.plans.forEach((p) => {
    const tag = p.targetFolder.split(/[\\/]/).pop() || 'unknown';
    byTag.set(tag, (byTag.get(tag) || 0) + 1);
  });
  return (
    <div className="result-card success">
      <div className="result-header">
        ✅ 计划完成 · 共 {result.totalFiles} 个文件 · 耗时 {(result.durationMs / 1000).toFixed(1)}s
        {result.cacheHits > 0 && <span className="badge">缓存命中 {result.cacheHits}</span>}
        <button
          className="thumb-toggle"
          onClick={() => setShowThumbs(v => !v)}
          title="切换缩略图"
        >
          {showThumbs ? '🖼️ 隐藏缩略图' : '🖼️ 显示缩略图'}
        </button>
      </div>
      <div className="tag-cloud">
        {Array.from(byTag.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([tag, n]) => (
            <button key={tag} className="tag-chip" onClick={() => setFilter(tag)}>
              {tag} <span className="count">{n}</span>
            </button>
          ))}
      </div>
      <input
        className="filter-input"
        placeholder="按标签或文件名过滤..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className={`plan-grid ${showThumbs ? 'with-thumbs' : 'list-only'}`}>
        {visible.slice(0, 200).map((p, i) => (
          <div key={i} className="thumb-card" title={p.source + '\n→ ' + p.target}>
            <div className="thumb-img-wrap">
              {showThumbs && p.thumbnail ? (
                <img src={p.thumbnail.dataUrl} alt={p.file} loading="lazy" />
              ) : (
                <div className="thumb-placeholder">
                  {showThumbs ? '🖼️' : (i + 1).toString()}
                </div>
              )}
              {showThumbs && p.thumbnail && (
                <span className={`thumb-src-badge src-${p.thumbnail.source}`} title={`源: ${p.thumbnail.source}`}>
                  {p.thumbnail.source === 'exif' ? 'EXIF' : p.thumbnail.source === 'cache' ? 'CACHE' : 'JPG'}
                </span>
              )}
            </div>
            <div className="thumb-meta">
              <div className="thumb-name" title={p.file}>{p.file}</div>
              <div className="thumb-target">{p.targetFolder.split(/[\\/]/).pop()}</div>
              {p.clipTags.length > 0 && (
                <div className="thumb-tags">{p.clipTags.slice(0, 2).map(t => `${t.label}(${t.score.toFixed(2)})`).join(' ')}</div>
              )}
            </div>
          </div>
        ))}
        {visible.length > 200 && <div className="muted grid-end">仅显示前 200 条，共 {visible.length} 条匹配</div>}
      </div>
    </div>
  );
}

/* ============== Search ============== */
function SearchTab({ cli }: { cli: ReturnType<typeof usePhotoVaultCli> }) {
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [useCache, setUseCache] = useState(true);
  const [thumbs, setThumbs] = useState(true);
  const [thumbSize, setThumbSize] = useState(240);
  const [withClip, setWithClip] = useState(false);

  const pickFolder = async () => {
    const f = await open({ directory: true });
    if (f) setFolder(f as string);
  };

  const submit = () => {
    if (!folder || !query) return alert('请选择文件夹并输入搜索关键词');
    cli.runSearch({ folder, query, useCache, thumbs, thumbSize, concurrency: 4, withClip });
  };

  return (
    <section className="card">
      <h3>🔍 标签/文件名搜索</h3>

      <div className="section">
        <label>搜索文件夹</label>
        <div className="row">
          <button className="btn btn-secondary" onClick={pickFolder}>📁 选择文件夹</button>
          {folder && <div className="path-box">{folder}</div>}
        </div>
      </div>

      <div className="section">
        <label>关键词</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="beach / evening / dog / banner..."
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>

      <div className="section checkbox-row">
        <label>
          <input type="checkbox" checked={useCache} onChange={(e) => setUseCache(e.target.checked)} />
          <span>复用 CLIP 缓存（先点过「整理」会更快）</span>
        </label>
      </div>

      <div className="section checkbox-row">
        <label className={withClip ? 'slow-option' : ''}>
          <input type="checkbox" checked={withClip} onChange={(e) => setWithClip(e.target.checked)} />
          <span>
            🧠 CLIP 语义匹配
            <span className="warn-hint">{withClip ? '⚠️ 首次会慢（加载模型+推理），之后用缓存秒出' : '关闭 = 仅文件名+启发式（秒出）'}</span>
          </span>
        </label>
      </div>

      <div className="section checkbox-row">
        <label>
          <input type="checkbox" checked={thumbs} onChange={(e) => setThumbs(e.target.checked)} />
          <span>显示缩略图（{thumbSize}px）</span>
        </label>
      </div>

      {thumbs && (
        <div className="section">
          <label>缩略图边长 ({thumbSize}px)</label>
          <input
            type="range" min={120} max={480} step={20}
            value={thumbSize}
            onChange={(e) => setThumbSize(parseInt(e.target.value))}
          />
        </div>
      )}

      <button className="btn btn-primary big" onClick={submit} disabled={cli.state === 'running' || !folder || !query}>
        {cli.state === 'running' ? '⏳ 搜索中...' : '🔍 开始搜索'}
      </button>

      {cli.searchResult && <SearchResultView result={cli.searchResult} />}
    </section>
  );
}

function SearchResultView({ result }: { result: NonNullable<ReturnType<typeof usePhotoVaultCli>['searchResult']> }) {
  const [showThumbs, setShowThumbs] = useState(true);
  const [matchFilter, setMatchFilter] = useState<'all' | 'filename' | 'tag'>('all');
  const filtered = result.results.filter(r => matchFilter === 'all' || r.matchType === matchFilter);
  const filenameCount = result.results.filter(r => r.matchType === 'filename').length;
  const tagCount = result.results.filter(r => r.matchType === 'tag').length;
  return (
    <div className="result-card success">
      <div className="result-header">
        🔍 找到 {result.count} 个匹配「{result.query}」的结果
        <button
          className="thumb-toggle"
          onClick={() => setShowThumbs(v => !v)}
          title="切换缩略图"
        >
          {showThumbs ? '🖼️ 隐藏缩略图' : '🖼️ 显示缩略图'}
        </button>
      </div>
      <div className="tag-cloud">
        <button className={`tag-chip ${matchFilter === 'all' ? 'active-filter' : ''}`} onClick={() => setMatchFilter('all')}>
          全部 <span className="count">{result.count}</span>
        </button>
        <button className={`tag-chip ${matchFilter === 'filename' ? 'active-filter' : ''}`} onClick={() => setMatchFilter('filename')}>
          📄 文件名 <span className="count">{filenameCount}</span>
        </button>
        <button className={`tag-chip ${matchFilter === 'tag' ? 'active-filter' : ''}`} onClick={() => setMatchFilter('tag')}>
          🏷️ 标签 <span className="count">{tagCount}</span>
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="muted">没有匹配项。试试别的关键词？</p>
      ) : (
        <div className={`plan-grid ${showThumbs ? 'with-thumbs' : 'list-only'}`}>
          {filtered.slice(0, 200).map((r, i) => (
            <div key={i} className="thumb-card" title={r.path}>
              <div className="thumb-img-wrap">
                {showThumbs && r.thumbnail ? (
                  <img src={r.thumbnail.dataUrl} alt={r.name} loading="lazy" />
                ) : (
                  <div className="thumb-placeholder">{r.matchType === 'filename' ? '📄' : '🏷️'}</div>
                )}
                <span className={`match-badge-big ${r.matchType}`} title={r.matchType === 'filename' ? '文件名匹配' : '标签匹配'}>
                  {r.matchType === 'filename' ? '📄' : '🏷️'}
                </span>
                {showThumbs && r.thumbnail && (
                  <span className={`thumb-src-badge src-${r.thumbnail.source}`} title={`源: ${r.thumbnail.source}`}>
                    {r.thumbnail.source === 'exif' ? 'EXIF' : r.thumbnail.source === 'cache' ? 'CACHE' : 'JPG'}
                  </span>
                )}
              </div>
              <div className="thumb-meta">
                <div className="thumb-name" title={r.name}>{r.name}</div>
                {r.tags.length > 0 && (
                  <div className="thumb-tags" title={r.tags.join(', ')}>{r.tags.slice(0, 3).join(' · ')}</div>
                )}
                {r.clipScores && r.clipScores.length > 0 && (
                  <div className="thumb-scores">
                    {r.clipScores.slice(0, 2).map((t, j) => (
                      <span key={j} className="score-tag">{t.label}({t.score.toFixed(2)})</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {filtered.length > 200 && <div className="muted grid-end">仅显示前 200 条，共 {filtered.length} 条匹配</div>}
        </div>
      )}
    </div>
  );
}

/* ============== 运行面板（进度+日志） ============== */
function RunPanel({ cli }: { cli: ReturnType<typeof usePhotoVaultCli> }) {
  if (cli.state === 'idle' && cli.logs.length === 0) return null;
  return (
    <section className="card run-panel">
      <div className="run-header">
        <h3>📡 实时运行</h3>
        <span className={`status status-${cli.state}`}>{stateLabel(cli.state)}</span>
      </div>
      <ProgressBar progress={cli.progress} />
      <div className="logs">
        {cli.logs.slice(-50).map((l, i) => (
          <div key={i} className={`log-line log-${l.level}`}>
            <span className="log-ts">{new Date(l.ts).toLocaleTimeString()}</span>
            <span className="log-msg">{l.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProgressBar({ progress }: { progress: Progress }) {
  if (!progress || progress.total === 0) return null;
  const pct = progress.total > 0 ? Math.min(100, (progress.current / progress.total) * 100) : 0;
  return (
    <div className="progress-block">
      <div className="progress-label">
        {phaseLabel(progress.phase)} · {progress.current}/{progress.total} ({pct.toFixed(0)}%)
        {progress.file && <span className="progress-file"> · {progress.file}</span>}
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function phaseLabel(p: 'scan' | 'analyze' | 'move') {
  return p === 'scan' ? '🔍 扫描' : p === 'analyze' ? '🤖 AI 分析' : '📦 移动';
}
function stateLabel(s: string) {
  return s === 'running' ? '运行中' : s === 'done' ? '完成' : s === 'error' ? '出错' : '空闲';
}

export default App;
