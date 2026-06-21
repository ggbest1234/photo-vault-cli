# 📸 Photo Vault GUI

> Tauri 2 + React 19 桌面客户端，包装 photo-vault-cli

![Status](https://img.shields.io/badge/status-beta-yellow) ![Version](https://img.shields.io/badge/version-0.9.1-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-61dafb)

## ✨ 功能

- **3 个 Tab**：🗂️ 整理 / 🔍 搜索 / 📊 扫描
- **实时进度条 + 进度文件**（通过 Tauri shell plugin 流式消费 CLI stdout）
- **JSON Lines 协议**：CLI 通过 `--json --stream` 输出结构化事件
- **结果可视化**：标签云 + 过滤 + 目标路径预览
- **CLI 路径可配**：默认 `F:\Grok\photo-vault-test`

## 🆕 最新功能

### v0.8.0 (2026-06-19) — Image Modal + EXIF Time
- **点击缩略图查看大图**：完整 EXIF 元数据 / 标签 / 路径（点路径复制）
- **键盘导航**：ESC 关闭，← → 切换图片
- 缩略图角标：📷 EXIF（绿）vs 🕐 mtime（黄）一眼看出归类时间来源
- `dateFolder` 显示完整日期（yyyy-MM-dd），不再只是月份

### v0.6.0 (2026-06-18) — Rollback
- Organize 结果页右上角 **"↩️ 回滚这次"** 红色按钮
- RollbackResultView：4-stat 摘要（已还原/跳过/重命名/覆盖）+ 过滤 chips

### v0.5.0 (2026-06-18) — 初始 GUI
- 🗂️ 整理 / 🔍 搜索 两个 Tab（扫描已并入整理）
- 实时进度条 + 深色运行面板 + 日志流
- 缩略图网格（auto-fill 140px minmax）
- 标签云 + 过滤 + 滚动

完整变更见 [CHANGELOG.md](../CHANGELOG.md)

## 🏗 架构

```
React UI (App.tsx)
   ↓ invoke Command
Tauri shell plugin
   ↓ spawn npx tsx
photo-vault-cli (subprocess)
   ↓ stdout: JSON Lines
Tauri stdout event
   ↓ parse by line
React state (usePhotoVaultCli hook)
   ↓ re-render
UI 更新进度/结果
```

**关键设计：**
- CLI 是 source of truth，GUI 只负责呈现
- `usePhotoVaultCli` hook 封装所有 CLI 交互（`src/usePhotoVaultCli.ts`）
- 能力配置（`src-tauri/capabilities/default.json`）只允许 `npx` 这一个程序，args 任意
- Rust 侧零自定义命令，纯前端控制

> 完整使用指南（首次使用、CLI 路径配置、debug 等）见 [../USAGE.md](../USAGE.md)。

## 🚀 开发

```bash
# 1. 装 CLI 依赖 + 编译（photo-vault-test 同级）
cd ../photo-vault-test
npm install
python download_model.py  # 首次需要
npm run build              # ← 关键：编译出 dist/，GUI 才认

# 2. 启动 GUI
cd ../photo-vault-gui
npm install
npm run tauri dev
```

> ⚠️ **每次修改 CLI 代码后都要 `cd ../photo-vault-test && npm run build`**，否则 GUI 跑的是旧的 dist 产物。

## 🔧 配置

GUI 顶部「CLI 目录」可改，指向你的 photo-vault-test 路径。

capabilities 配置在 `src-tauri/capabilities/default.json`：
```json
{
  "identifier": "shell:allow-spawn",
  "allow": [{ "name": "photo-vault-cli", "cmd": "npx", "args": true }]
}
```

## 📦 构建

```bash
npm run tauri build
```

产物：`src-tauri/target/release/photo-vault-gui.exe`
