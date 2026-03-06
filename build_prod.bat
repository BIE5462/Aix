@echo off
echo ==========================================
echo Starting Production Build Process
echo ==========================================

echo.
echo [1/3] Building Frontend...
cd frontend
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed!
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo [2/3] Building Admin System...
cd admin-system
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo Admin System build failed!
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo [3/3] Preparing Server...
cd server
call npm install --production
cd ..

echo.
echo ==========================================
echo Build Complete Successfully!
echo ==========================================
echo.
echo Next steps:
echo 1. Ensure Nginx is running (nginx -s reload if config changed)
echo 2. Start the backend server: cd server ^& npm start
echo.
pause
