@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Project directory: %CD%
echo [INFO] Detecting Python runtime...

if exist ".venv\Scripts\python.exe" (
    echo [INFO] Using project uv environment.
    ".venv\Scripts\python.exe" run_me.py
    if errorlevel 1 goto :launch_error
    goto :success
)

where py >nul 2>&1
if not errorlevel 1 (
    py -3.10 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
    if not errorlevel 1 (
        echo [INFO] Using Python 3.10 from py launcher.
        py -3.10 run_me.py
        if errorlevel 1 goto :launch_error
        goto :success
    )
)

where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
    if not errorlevel 1 (
        echo [INFO] Using Python from PATH.
        python run_me.py
        if errorlevel 1 goto :launch_error
        goto :success
    )
)

echo [ERROR] Python 3.10 or newer was not found.
echo Install Python or create .venv with uv, then run Start.bat again.
pause
exit /b 1

:launch_error
echo [ERROR] yukiBlogs manager failed to start.
pause
exit /b 1

:success
echo [OK] yukiBlogs manager launch request completed.
exit /b 0