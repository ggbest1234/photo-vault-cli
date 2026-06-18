@echo off
chcp 65001 >nul
echo ========================================
echo   Photo Vault CLI - Model Download
echo ========================================
echo.
echo Downloading CLIP model (~150MB)...
echo.

"C:\Users\zhuhu\AppData\Local\Programs\Python\Python312\python.exe" download_model.py

echo.
echo Download finished. Press any key to exit...
pause >nul
