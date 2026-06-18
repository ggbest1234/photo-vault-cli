# Changelog

All notable changes to Photo Vault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-06-18 — Rollback Support

### Added
- **`rollback` 命令** — 撤销 `organize --apply` 的文件移动
  - 读 `.photo-vault-report.json` 反向 move 文件回原位
  - 三种冲突策略：`--conflict skip` / `rename` (默认) / `overwrite`
  - 自动清理空的目标目录（含 `by-tag` / `by-date` 父目录）
  - 写带时间戳的回退报告（`.photo-vault-rollback-<ts>.json`）
  - Dry-run 预览模式
  - 完整容错：源位置已有同名文件时自动重命名为 `xxx_rollbackN.ext`
  - GUI 集成：Organize 结果页加 "↩️ 回滚这次" 按钮 + Rollback 结果视图
- **JSON Lines 协议支持 rollback**（log / progress / result / error）
- **进程级兜底**（与 organize / search 一致）：uncaughtException + process.exit
- **CLI 命令完整列表**：
  - `scan` — 扫描统计
  - `organize` — 智能整理（4 模式）
  - `search` — 标签/文件名搜索（带缩略图）
  - `rollback` — 撤销整理（新增）

### Verified
- ✅ 3 文件 dry-run 预览：3 个还原计划
- ✅ 3 文件 --apply：成功还原 + 自动清理空目录
- ✅ `--json --stream` GUI 模式：result event 正常 + process.exit 触发
- ✅ 冲突场景：源位置已有同名 → 自动 rename `photo1_rollback1.jpg`
- ✅ 多轮回滚：第二次 target 已不存在 → 标记 missing-target 跳过

---

## [0.5.0] - 2026-06-18 — Beta

### Added
- **CLIP Large 模型集成**：零样本图像分类（`Xenova/clip-vit-large-patch14`）
  - 50+ 候选标签（meeting / beach / dog / night / etc.）
  - 国内镜像（`hf-mirror.com`）加速下载
  - ONNX 量化模型（~400MB）
- **缩略图生成**（`--thumbs`）
  - 三级 fallback：EXIF embedded thumbnail → sharp resize → 文件级缓存
  - 缓存按 `sha1(path + mtime + size + size_px)` 落盘
  - 单图 3-7KB base64 dataUrl
  - 缩略图源标签：EXIF / CACHE / JPG
- **JSON Lines 协议**：CLI 与 GUI 通信标准
  - 4 种 event：`log` / `progress` / `result` / `error`
  - 流式进度回调（扫描 / 分析 / 移动三阶段）
  - 人类可读模式 + 机器可读模式共存
- **Tauri 2 + React 19 桌面 GUI**
  - 3 个 tab：🗂️ 整理 / 🔍 搜索 / 📊 扫描
  - 实时进度条 + 深色运行面板 + 日志流
  - 缩略图网格布局（auto-fill 140px minmax）
  - EXIF / CACHE / JPG 角标
  - CLIP 语义匹配开关（默认关闭避免误触发）
- **p-limit 并行分析**：`--concurrency` 可调
- **mtime 缓存机制**：重复扫描同目录 ~17× 加速
- **scan / organize / search 三大命令**
- **organize**：4 模式（combined / clip / heuristic / date）
- **search**：文件名 + 启发式 + CLIP 语义（可选）
- **scan**：统计（图片数 / MB / 平均 KB / 格式分布）
- **dry-run 安全模式**：默认预览，加 `--apply` 才移动
- **Windows .cmd shim 兼容**：`npx` 改用 `node dist/index.js` 直接调用
- **sharp + transformers.js native binary 兼容**：
  - sharp pin 到 `0.33.5`（0.35 在 Hermes node 22 ERR_DLOPEN_FAILED）
  - `await preloadSharp()` 顶层预加载（在 transformers 之前）
  - `@xenova/transformers` 改 dynamic import
- **进程级 robustness**：
  - `Promise.allSettled` 替代 `Promise.all`（单图失败不阻塞）
  - `uncaughtException` / `unhandledRejection` 兜底
  - json+stream 模式 `process.exit(0)` + 100ms flush
- **缩略图 EXIF 自动旋转**（按 Orientation flag）
- **文件重名自动编号**（`file_1.jpg`, `file_2.jpg`）

### Known Limitations
- EXIF 时间归类（目前用 mtime）— 0.6 计划
- 撤销/回滚功能（report 文件存在但 GUI 无 UI）— 0.6 计划
- HEIC 缩略图需完整测试
- 没发布到 GitHub Releases

### Verified
- ✅ 30 张图 + 缩略图搜索：0.3 秒（无 CLIP）/ 13 秒（首次 CLIP）
- ✅ 重复扫描同目录：34ms → 2ms（17× 加速）
- ✅ 单图缩略图：~20ms（EXIF 缺失时 sharp resize）
- ✅ Windows Tauri 2 + Node 22.22 兼容

---

## [0.1.0] - 2026-06-08 — Initial Alpha (internal)

### Added
- 基础扫描（递归 + 跳过系统文件夹）
- 启发式标签（业务名/时间/EXIF/AI生成判断）
- organize 命令初版（仅 heuristic 模式）
- dry-run 预览
