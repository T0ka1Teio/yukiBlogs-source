@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo [INFO] yukiBlogs 控制台 - 开发热重载模式启动器
echo.

rem 检查控制台是否仍在运行（默认前端端口 3210）
netstat -ano | findstr ":3210" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [WARN] 端口 3210 仍被占用，控制台可能还在运行！
    echo [WARN] 请先关闭控制台窗口；若自定义过 YUKIBLOGS_FRONTEND_PORT 请自行核对端口。
    pause
    exit /b 1
)

rem 移除打包产物，让 launcher.py 自动改用 npm run dev 开发模式
if exist ".next" (
    echo [INFO] 正在移除旧的打包产物 .next（仅删除构建缓存，源码与数据不受影响）...
    rmdir /s /q ".next"
)

echo [INFO] 启动开发模式：前端支持热重载（Fast Refresh），改页面/组件代码即时生效。
echo [INFO] 注意：修改 Python 后端 cms_core 后需要关闭控制台并重新运行本脚本。
echo.
call Start.bat
