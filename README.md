# 📸 Photo Vault CLI

> 用 CLIP AI 整理照片文件夹 · 支持 Windows / macOS / Linux

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)]()
[![Local First](https://img.shields.io/badge/local-first-orange.svg)]()

## 🎯 解决什么

桌面文件夹混乱：
- 下载文件夹 1000+ 文件不会分类
- 截图 / 相册散落各目录
- 找不到某张特定照片

Photo Vault CLI = **本地 CLIP + 自动归类 + 离线整理**

## ✨ 核心特性

- 🔍 **递归扫描**：自动跳过系统目录（`$RECYCLE.BIN` / `.cache` / `node_modules`）
- 🤖 **CLIP 自动标签**：本地 ViT-B/32 模型识别 Top-5 标签
- 🏷️ **置信度阈值**：可调（默认 0.1）
- 📁 **三种归类模式**：
  - `--mode tag`：按标签（`by-tag/<tag>/`）
  - `--mode date`：按年月（`by-date/<YYYY-MM>/`）
  - `--mode both`：双轨（`by-tag/<tag>/<YYYY-MM>/`）
- 🛡️ **Dry-run**：先看计划，不动文件
- 📄 **报告输出**：每张文件的标签 + 归类去向（`.photo-vault-report.json`）
- ⚠️ **冲突保护**：目标文件已存在自动重命名（`file_1.jpg`）
- 🔒 **100% 本地**：模型 + 处理 + 标签，全在本地

## 🚀 快速开始

### 1. 安装依赖

```bash
cd photo-vault-cli
npm install
```

### 2. 下载 CLIP 模型（首次需要，~150 MB）

```bash
# 用 HF 国内镜像（避免 GFW）
HF_ENDPOINT=https://hf-mirror.com python -c "
import os
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
from huggingface_hub import snapshot_download
path = snapshot_download(
    repo_id='Xenova/clip-vit-base-patch32',
    cache_dir='./models/clip-cache',
    allow_patterns=['*.json', '*.txt', 'tokenizer.json', 'onnx/model_quantized.onnx']
)
print('模型路径:', path)
"

# 软链到 transformers 默认位置
mkdir -p node_modules/@xenova/transformers/models/Xenova/clip-vit-base-patch32
ln -s ../../../../../../models/clip-cache/models--Xenova--clip-vit-base-patch32/snapshots/*/* \
      node_modules/@xenova/transformers/models/Xenova/clip-vit-base-patch32/ 2>/dev/null

# Windows 用 mklink 命令代替
```

### 3. 扫描文件夹

```bash
npx tsx src/index.ts scan "C:\Users\Ryan\Downloads"
```

### 4. 整理（先 dry-run 看效果）

```bash
# Dry run（不动文件）
npx tsx src/index.ts organize "C:\Users\Ryan\Downloads" --dry-run

# 真的移动文件
npx tsx src/index.ts organize "C:\Users\Ryan\Downloads"

# 只整理前 10 张（测试）
npx tsx src/index.ts organize "C:\Users\Ryan\Downloads" --limit 10

# 按日期归类
npx tsx src/index.ts organize "C:\Users\Ryan\Downloads" --mode date

# 双轨归类
npx tsx src/index.ts organize "C:\Users\Ryan\Downloads" --mode both

# 自定义输出目录
npx tsx src/index.ts organize "C:\Users\Ryan\Downloads" --output "D:\Photos-Organized"

# 自定义阈值（更严格）
npx tsx src/index.ts organize "C:\Users\Ryan\Downloads" --threshold 0.2
```

### 5. Windows .exe 打包（v0.2.0 计划）

```bash
npm install -g pkg
pkg . --targets node20-win-x64 --output photo-vault.exe
# → photo-vault.exe 在 Windows 直接双击跑
```

## 🎯 标签候选列表（60+ 个）

CLIP 候选标签分 7 大类：

```
- 室内：meeting / office / desk / laptop / book / notebook / phone / kitchen / restaurant / bedroom
- 室外：street / city / building / sky / sunset / sunrise / beach / mountain / snow / rain / forest / park
- 物体：food / coffee / tea / water / wine / fruit / plant / flower / tree / car / bike / dog / cat / bird
- 人：people / selfie / group / family / friend / child / baby
- 物品：paper / document / screen / art / painting / photo / computer / keyboard / mouse
- 抽象：morning / afternoon / evening / night / spring / summer / autumn / winter
```

可编辑 `src/clip.ts` 里的 `CANDIDATE_LABELS` 自定义。

## 📊 v0.1.0 完成度

- [x] **CLI 骨架**：scan / organize 命令
- [x] **文件扫描**：递归 + 系统目录跳过
- [x] **CLIP 集成**：本地模型 + 60+ 候选标签
- [x] **dry-run 模式**
- [x] **三种归类模式**：tag / date / both
- [x] **冲突保护**：自动重命名
- [x] **报告输出**：JSON 格式
- [x] **彩色输出**：chalk + ora
- [ ] **启发式标签**：文件名 + 时间（待集成）
- [ ] **EXIF 提取**：GPS / 相机型号
- [ ] **学习机制**：用户偏好表
- [ ] **Windows .exe 打包**（pkg）
- [ ] **macOS / Linux .app / .deb**
- [ ] **TUI 交互**：inquirer.js

## 🔗 关联项目

- [photo-vault-pwa](../photo-vault-pwa/) — 手机 PWA 端（已上线 https://fableins.com）
- [photo-vault](../photo-vault/) — 主仓 + Obsidian 插件

## 📜 License

MIT © Ryan