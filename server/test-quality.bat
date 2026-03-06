@echo off
chcp 65001
REM 图片画质对比测试 - Windows 批处理脚本
REM 使用方法: test-quality.bat

echo ========================================
echo 图片画质对比测试
echo ========================================
echo.

REM 检查是否在 server 目录
if not exist "test-image-quality.js" (
    echo 错误: 请在 server 目录下运行此脚本
    pause
    exit /b 1
)

REM 提示用户输入参数
echo 请输入测试参数:
echo.

set /p API_URL="API URL (默认: https://generativelanguage.googleapis.com): "
if "%API_URL%"=="" set API_URL=https://generativelanguage.googleapis.com

set /p API_KEY="API Key (必需): "
if "%API_KEY%"=="" (
    echo 错误: API Key 不能为空
    pause
    exit /b 1
)

set /p MODEL="模型名称 (默认: gemini-2.0-flash-exp): "
if "%MODEL%"=="" set MODEL=gemini-2.0-flash-exp

set /p PROMPT="提示词 (可选，按回车使用默认): "

echo.
echo ========================================
echo 测试配置:
echo ========================================
echo API URL: %API_URL%
echo API Key: %API_KEY:~0,10%...
echo 模型: %MODEL%
if not "%PROMPT%"=="" echo 提示词: %PROMPT%
echo ========================================
echo.

REM 构建命令
set CMD=node test-image-quality.js --api-url "%API_URL%" --api-key "%API_KEY%" --model "%MODEL%"
if not "%PROMPT%"=="" set CMD=%CMD% --prompt "%PROMPT%"

REM 执行测试
echo 开始测试...
echo.
%CMD%

echo.
echo ========================================
echo 测试完成
echo ========================================
pause
