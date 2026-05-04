@echo off
REM Quick fix for missing dependencies
echo [*] Installing missing Node dependencies...
cd /d "%~dp0"
npm install
if %errorlevel% equ 0 (
    echo [OK] Dependencies installed successfully!
    echo.
    echo You can now run: npm run dev
) else (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
