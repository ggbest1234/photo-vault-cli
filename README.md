# 📸 Photo Vault CLI

> 本地 AI 照片自动整理工具 · 支持 Windows / macOS / Linux

![Status](https://img.shields.io/badge/status-beta-yellow) ![Version](https://img.shields.io/badge/version-0.6.0-blue) ![Node](https://img.shields.io/badge/node-%3E%3D20-green) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

## ✨ 核心特性

- 🔍 **递归扫描**：自动跳过系统文件夹
- 🤖 **CLIP Large 模型**：更大更准的零样本图像识别
- 🏷️ **四种归类模式**：combined / clip / heuristic / date
- ⚡ **并行分析**：`--concurrency` 控制，CLIP 推理不再串行
- 💾 **CLIP 推理缓存**：mtime+size hash 命中后零推理（同文件夹二次扫描 ~17× 加速）
- 🛡️ **Dry-run 安全模式**：默认只预览，加 `--apply` 才移动
- 📊 **清晰报告 + 实时进度**：JSON Lines 协议给 GUI
- 🔒 **100% 本地运行**

## 🚀 快速开始

### 1. 下载 CLIP Large 模型（约 400MB，国内镜像）

```bash
python download_model.py
```

### 2. 使用

```bash
# 方式 A：开发态（无需编译，tsx 解释执行）
npx tsx src/index.ts organize "你的文件夹" --mode combined --limit 20

# 方式 B：编译后跑（生产/GUI 推荐）
npm run build
node dist/index.js organize "你的文件夹" --mode combined --limit 20

# Dry-run 预览（推荐先看效果）
npx tsx src/index.ts organize "你的文件夹" --mode combined --limit 20

# 真实执行
npx tsx src/index.ts organize "你的文件夹" --apply

# 后悔了？回滚（撤销刚才的 --apply）
npx tsx src/index.ts rollback "你的文件夹/organized"           # 预览
npx tsx src/index.ts rollback "你的文件夹/organized" --apply    # 真实回滚

# 加速：增大并发
npx tsx src/index.ts organize "你的文件夹" --concurrency 4

# 清理缓存重新跑
npx tsx src/index.ts organize "你的文件夹" --no-cache

# 搜索
npx tsx src/index.ts search "你的文件夹" beach
```

### 3. GUI 模式（--json --stream）

```bash
npx tsx src/index.ts organize "你的文件夹" --json --stream
```

输出 JSON Lines 到 stdout，每行一个 event：

```
{"type":"log","level":"info","message":"..."}
{"type":"progress","phase":"analyze","current":1,"total":20,"file":"a.jpg"}
{"type":"result","command":"organize","data":{...}}
```

GUI 端按行解析即可。详见 `../photo-vault-gui/`。

## 🧰 命令参考

### `organize <folder>`

| 选项 | 默认 | 说明 |
|------|------|------|
| `--mode` | `combined` | combined / clip / heuristic / date |
| `--limit` | `0` | 限制文件数（0 = 全部） |
| `--apply` | false | 真实移动（否则 dry-run） |
| `--threshold` | `0.1` | CLIP 置信度阈值 |
| `--concurrency` | `2` | 并行分析数（CLIP 推理吃 CPU） |
| `--output` | `<folder>/organized` | 输出根目录 |
| `--cache` | `<output>/.photo-vault-cache.json` | CLIP/heuristic 缓存路径 |
| `--thumbs` | false | 为每个 plan 生成 base64 缩略图（GUI 预览用） |
| `--thumb-size` | `240` | 缩略图边长 px |
| `--thumb-cache` | `<output>/.thumb-cache` | 缩略图缓存目录 |
| `--no-cache` | false | 禁用缓存 |
| `--json` | false | GUI 模式（JSON Lines 输出） |
| `--stream` | false | 与 --json 配合，输出进度事件 |

### `search <folder> <query>`

| 选项 | 默认 | 说明 |
|------|------|------|
| `--cache` | — | 复用 organize 生成的缓存 |
| `--no-cache` | false | 禁用缓存 |
| `--json` / `--stream` | false | 同 organize |

### `scan <folder>`

| 选项 | 默认 | 说明 |
|------|------|------|
| `--limit` | `0` | 限制文件数 |
| `--json` / `--stream` | false | 同上 |

## 📂 输出结构

```
<folder>/organized/
├── by-tag/
│   ├── photo/      # 启发式 / CLIP 识别的标签
│   ├── banner/
│   └── unsorted/   # 无标签兜底
├── by-date/        # --mode date
│   └── 2026-06/
├── .photo-vault-report.json     # 整理计划
└── .photo-vault-cache.json      # CLIP 推理缓存
```

## ⚙️ 缓存说明

- 按 `文件路径 SHA1` 做 key，校验 `mtimeMs + size`
- 文件未变 → 直接复用启发式 + CLIP 结果
- 重复扫描同一文件夹几乎零成本
- 整理/搜索都共享同一份缓存（路径通过 `--cache` 指定）
