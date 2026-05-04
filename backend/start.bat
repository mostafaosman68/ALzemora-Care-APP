@echo off
REM Startup script for Alzheimer Care App (Backend + ML Service)
REM Run from the backend directory

echo.
echo ===============================================
echo Alzheimer Care - Full Stack Startup
echo ===============================================
echo.

REM Check if running from correct directory
if not exist "package.json" (
    echo [ERROR] Run this script from the backend directory
    exit /b 1
)

REM Check if ML service directory exists
if not exist "ml_service" (
    echo [!] Setting up ML service structure...
    python setup_ml.py
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to setup ML service
        exit /b 1
    )
)

REM Check dependencies
echo [*] Checking Node.js dependencies...
if not exist "node_modules" (
    echo [!] Installing Node.js dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install Node dependencies
        exit /b 1
    )
)

echo [*] Checking Python dependencies...
python -c "import flask" 2>nul
if %errorlevel% neq 0 (
    echo [!] Installing Python dependencies...
    pip install -r requirements-ml.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install Python dependencies
        exit /b 1
    )
)

echo.
echo ===============================================
echo ✓ All checks passed!
echo ===============================================
echo.
echo TO START THE APP:
echo.
echo [Terminal 1] - ML Service (MUST START FIRST):
echo   python ml_service\app.py
echo.
echo [Terminal 2] - Node Backend:
echo   npm run dev
echo.
echo ML Service URL:   %ML_SERVICE_URL%
echo ML Service Host:  %ML_SERVICE_HOST%
echo ML Service Port:  %ML_SERVICE_PORT%
echo Backend Port:     %PORT%
echo.
echo Make sure to:
echo   1. Place pretrained ECAPA model in: data\pretrained_ecapa_local\
echo   2. Set ML_SERVICE_HOST / ML_SERVICE_PORT / ML_SERVICE_PATH in .env
echo.
pause
