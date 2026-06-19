# 📸 Photo Vault GUI

> Tauri 2 + React 19 桌面客户端，包装 photo-vault-cli

![Status](https://img.shields.io/badge/status-beta-yellow) ![Version](https://img.shields.io/badge/version-0.8.0-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-61dafb)

## ✨ 功能

- **3 个 Tab**：🗂️ 整理 / 🔍 搜索 / 📊 扫描
- **实时进度条 + 进度文件**（通过 Tauri shell plugin 流式消费 CLI stdout）
- **JSON Lines 协议**：CLI 通过 `--json --stream` 输出结构化事件
- **结果可视化**：标签云 + 过滤 + 目标路径预览
- **CLI 路径可配**：默认 `F:\Grok\photo-vault-test`

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
