#!/usr/bin/env python3
"""
Photo Vault CLI - CLIP Large 模型下载脚本
"""
import subprocess
import sys
import os

def install_package(package):
    print(f"正在安装依赖: {package} ...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])

def main():
    print("=" * 50)
    print("Photo Vault CLI - 模型下载工具 (Large 版)")
    print("=" * 50)
    print()

    try:
        import huggingface_hub
    except ImportError:
        install_package("huggingface_hub")

    from huggingface_hub import snapshot_download

    print("正在下载 CLIP Large 模型（约 400MB）...")
    print("使用国内镜像加速下载，请稍候...\n")

    os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

    try:
        path = snapshot_download(
            repo_id="Xenova/clip-vit-large-patch14",
            cache_dir="./models/clip-cache",
            allow_patterns=[
                "*.json",
                "*.txt",
                "onnx/model_quantized.onnx"
            ]
        )
        print("\n✅ 模型下载完成！")
        print(f"模型路径: {path}")
    except Exception as e:
        print(f"\n❌ 下载失败: {e}")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())