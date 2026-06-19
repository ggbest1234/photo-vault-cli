# 📖 Photo Vault 使用指南

> Photo Vault 0.9.0 — 本地 AI 照片整理工具
> GitHub: https://github.com/ggbest1234/photo-vault-cli

---

## 🎯 Photo Vault 是什么

一个 100% 本地运行的 AI 照片整理工具：
- **CLIP Large 模型**（~400MB）自动识别照片内容（人物/场景/物体）
- **4 种整理模式**：按标签、按日期、纯 AI、纯文件名启发式
- **EXIF 时间归类**（v0.7+）：用拍摄时间，不是文件修改时间
- **缩略图预览** + **大图查看**（v0.8+）
- **可逆**（v0.6+）：后悔了？一键回滚

**vs 其他工具**：
- ✅ **100% 本地**（照片不出电脑，AI 跑本地模型）
- ✅ **完全开源**（MIT）
- ✅ **HEIC 支持**（v0.9+，iPhone 照片直接处理）
- ❌ **不上传云端**（不是 iCloud/Google Photos）

---

## 📥 安装

### 方式 1：下载预编译包（v0.9.0 推荐）

适合普通用户，**不需要懂代码**。

1. 访问 https://github.com/ggbest1234/photo-vault-cli/releases/tag/v0.9.0
2. 下载对应版本：
   - **`photo-vault-gui_0.9.0_x64-setup.exe`** (2.5 MB) — NSIS 安装包，**推荐**
   - **`photo-vault-gui_0.9.0_x64_en-US.msi`** (3.8 MB) — Windows Installer，企业部署用
   - **`photo-vault-gui.exe`** (11.2 MB) — 绿色版，免安装
3. 双击安装包 → 装好后在开始菜单找"Photo Vault"启动
4. **首次启动会自动下载 CLIP 模型**（~400MB，国内镜像几分钟）

### 方式 2：从源码 build（开发者）

适合想改代码或贡献的人。

```bash
# 1. 克隆
git clone https://github.com/ggbest1234/photo-vault-cli.git
cd photo-vault-cli

# 2. 装 CLI 依赖
npm install

# 3. 下载 CLIP 模型（一次性，~400MB）
python download_model.py
# 或：npx tsx src/index.ts --help 也会提示

# 4. 编译 CLI
npm run build

# 5. 装 GUI 依赖
cd gui
npm install

# 6. 启动 GUI（dev 模式）
npm run tauri dev
```

**要求**：
- Node.js >= 20
- Windows / macOS / Linux
- ~1.5GB 磁盘（CLIP 模型 + node_modules）

---

## 🚀 第一次使用

### 1. 启动 GUI

- **从开始菜单**：Photo Vault → 点击启动
- **绿色版**：双击 `photo-vault-gui.exe`

首次启动会看到深色运行面板，CLI 子进程启动中。

### 2. 设置 CLI 目录

GUI 顶部有一个 **"CLI 目录"** 输入框：
- 默认 `F:\Grok\photo-vault-test`
- 如果你装的是预编译包，**这路径在你的电脑不存在**！
- **改成你的 CLI 项目路径**：
  - 从源码 build：填你的 `photo-vault-cli` 路径
  - 装预编译包：**不需要改**，GUI 内部已经打包了 CLI 逻辑

### 3. 整理你的第一组照片

1. 切换到 **🗂️ 整理** Tab
2. 点 **"📁 选择文件夹"** → 选一个有照片的目录（比如 `D:\Photos\2024`）
3. 选归类模式：
   - **综合 (启发式 + CLIP)** — **推荐新手**，快且准
   - **仅 CLIP AI** — 慢（每张 ~3 秒），但能识别复杂场景
   - **仅启发式** — 极快（秒出），只看文件名
   - **仅按日期** — 纯按 EXIF 拍摄时间归档
4. （可选）勾 **"生成缩略图"**（v0.8+）— 强烈推荐，能在结果页看预览
5. 点 **"👀 预览整理计划"**（dry-run，不动文件）
6. 看结果：
   - 缩略图网格：每张图 + 标签 + 目标文件夹
   - 顶部状态徽章：`📷 EXIF`（绿）= 用了拍摄时间 / `🕐 mtime`（黄）= fallback
7. 满意后点 **"🚀 开始整理"**（= dry-run 改成 apply）
8. 文件被移动到 `<原文件夹>/organized/by-tag/xxx/`

### 4. 点击缩略图查看大图（v0.8+）

- 任意缩略图**点击** → 弹出大图 modal
- 左侧：大图（用 EXIF Orientation 自动旋转）
- 右侧：完整元数据（日期、标签、EXIF、路径）
- 键盘：**ESC** 关闭、**← →** 切换
- 路径**点击复制**到剪贴板

### 5. 后悔了？回滚（v0.6+）

- 在整理结果页右上角，点 **"↩️ 回滚这次"** 红色按钮
- 确认后文件被移回原位
- 自动清理空的目标目录
- 默认策略：源位置已有同名文件 → 自动重命名为 `xxx_rollbackN.ext`
- 想换策略：`--conflict skip` / `rename`（默认）/ `overwrite`

### 6. 搜索（v0.7+）

1. 切换到 **🔍 搜索** Tab
2. 选文件夹 + 输入关键词（比如 `beach`、`evening`、`dog`）
3. 勾 **"复用 CLIP 缓存"**（跑过 organize 后秒出）
4. 选 **"🧠 CLIP 语义匹配"**（默认关闭，开启会慢但能找到语义标签）
5. 点搜索 → 结果可点击查看大图

---

## 🎓 进阶使用

### 命令行直接用（不通过 GUI）

预编译包**不含 CLI**，要命令行用需要 from source：

```bash
cd photo-vault-cli

# 整理 + 缩略图 + profile（v0.8+）
node dist/index.js organize "D:/Photos" --thumbs --profile --apply

# 搜索（CLIP 语义）
node dist/index.js search "D:/Photos" dog --thumbs --with-clip

# 回滚
node dist/index.js rollback "D:/Photos/organized" --apply

# 扫描统计
node dist/index.js scan "D:/Photos"
```

完整 flags 看 [README.md](README.md) 或 `node dist/index.js <cmd> --help`。

### 性能调优（v0.8+ `--profile`）

```bash
node dist/index.js organize "D:/Photos" --concurrency 8 --profile
```

输出：
```
📊 Profile:
  Wall time:    10.72s
  CPU time:     2514ms
  Peak RSS:     87.3 MB
  Cache hit:    100.0% (1000/1000)
  Throughput:   10869.6 files/s
```

调优建议：
- **机械硬盘**：concurrency = 1-2
- **SSD**：concurrency = 4-8
- **NVMe + 多核 CPU**：concurrency = 8-16

### 日期归类优先级（v0.7+）

Photo Vault 按这个优先级决定文件归到哪个月份/日期：

1. **EXIF DateTimeOriginal**（拍摄时间）— 最准确，📷 EXIF 角标
2. **mtime**（文件修改时间）— 兜底，🕐 mtime 角标
3. **未知**（HEIC 无 EXIF 情况）— `unknown` 文件夹

**为什么？** 从网盘下载照片、相机时间不准、文件被复制 —— mtime 都不准。EXIF 才是真相。

---

## ❓ 常见问题

### Q: 第一次启动很慢？
A: 在下载 CLIP Large 模型（~400MB，国内镜像几分钟）。下完缓存到 `models/clip-cache/`，后续秒开。

### Q: HEIC 照片识别慢？
A: HEIC 解码 + CLIP 推理会慢一些。如果量大：
- 第一遍：跑 `combined` 模式让 cache 写好
- 第二遍：开 `heuristic` 模式秒出（用 EXIF 时间归类，不跑 CLIP）

### Q: 整理完发现归错文件夹？
A: 用 rollback 撤销：
1. 整理结果页 → "↩️ 回滚这次" 按钮
2. 选 skip / rename / overwrite 冲突策略
3. 重新整理（调整模式或阈值）

### Q: 缩略图不显示？
A: 检查：
- 文件格式（HEIC/HEIF 用 heic-decode，其他用 sharp）
- 缩略图缓存目录权限（默认 `<output>/.thumb-cache/`）
- 看 GUI 运行面板日志

### Q: GPU 加速？
A: **当前不支持**。CLIP 跑在 CPU 上，每张 ~3 秒。HEIC decode 是 WASM，CPU 跑。
v1.0+ 可能加 ONNX GPU runtime（需要 sharp / transformers.js 都支持 CUDA/DirectML）。

### Q: macOS / Linux 怎么装？
A: v0.9.0 只出了 Windows prebuilt。macOS/Linux 用户：
- 从源码 build（步骤见上"方式 2"）
- 后续版本会出 macOS .dmg 和 Linux .AppImage

### Q: 文件会被上传吗？
A: **不会**。100% 本地运行。CLIP 模型在你机器上，照片在你机器上，无网络传输（除首次下载模型外）。

---

## 🆕 v0.9.0 更新

> 完整历史见 [CHANGELOG.md](CHANGELOG.md)

### HEIC 完整支持
- **之前**：iPhone HEIC 照片只能勉强归类，缩略图/EXIF 读不到
- **现在**：集成 `heic-decode`（libheif-js WASM），**零系统依赖**
  - 33ms 解码 800×600 HEIC → 240px 缩略图
  - GUI 缩略图角标变橙色 `HEIC`
  - **真·iPhone 照片能用**了

### 预编译包（首次发布）
- **NSIS 安装包** (`.exe` setup) — 2.5 MB — **推荐**
- **MSI 安装包** (`.msi`) — 3.8 MB — 企业部署
- **绿色版** (raw `.exe`) — 11.2 MB — 免安装

**用户免 build** —— 下载 → 双击 → 立即用。

### 已知限制
- **HEIC EXIF DateTimeOriginal 仍 fail** —— heic-decode 不解析 EXIF，元数据需要别的方案（v1.0+）
- **macOS / Linux prebuilt 未生成** —— Windows 优先
- **无自动更新** —— 新版本需手动下载

---

## 🔧 故障排查

### GUI 启动报 "program not found"
- CLI 路径不对
- 从源码 build：先 `cd photo-vault-cli && npm run build`
- 装预编译包：用默认 `F:\Grok\photo-vault-test`（或填你机器的实际路径）

### 缩略图一直显示占位符
- 缩略图生成失败。看运行面板日志
- HEIC：v0.9+ 已支持，更新到最新版
- 其他格式：看 sharp 错误

### `Closing file descriptor on garbage collection` 警告
- Node.js 22 + sharp/libvips 的已知警告
- **无害** —— 不影响功能，可以忽略

### `GLib-GObject-CRITICAL` 警告
- Tauri webkit 内部噪声
- **无害** —— 忽略

### 跑 organize 卡住 / 没结果
- 看运行面板日志
- 文件损坏 / 权限不足 / 磁盘满
- 加 `--thumbs --json --stream` 让 CLI 输出详细 JSON 调试

### rollback 后 organized/ 目录还在
- 不应该。如果还在，说明 organize 没成功执行（dry-run）
- 只有 `--apply` 后才能 rollback

---

## 📊 版本一览

| 版本 | 日期 | 关键功能 |
|------|------|----------|
| **0.9.0** | 2026-06-19 | HEIC 完整 + 预编译包 |
| 0.8.0 | 2026-06-19 | 大图 modal + --profile + 1000 张图基准 |
| 0.7.0 | 2026-06-19 | EXIF 时间归类（拍摄时间 vs mtime） |
| 0.6.0 | 2026-06-18 | Rollback 撤销 |
| 0.5.0 | 2026-06-18 | Beta 首发（CLIP + GUI） |

---

## 📞 反馈 & 贡献

- **Issues**: https://github.com/ggbest1234/photo-vault-cli/issues
- **Discussions**: https://github.com/ggbest1234/photo-vault-cli/discussions
- **贡献代码**: fork → PR
- **报告 bug**: 带 GUI 运行面板日志 + 复现步骤

---

*Last updated: 2026-06-19 · v0.9.0 Beta*
