#!/bin/bash
# 图片画质对比测试 - Linux/Mac Shell 脚本
# 使用方法: ./test-quality.sh

echo "========================================"
echo "图片画质对比测试"
echo "========================================"
echo ""

# 检查是否在 server 目录
if [ ! -f "test-image-quality.js" ]; then
    echo "错误: 请在 server 目录下运行此脚本"
    exit 1
fi

# 提示用户输入参数
echo "请输入测试参数:"
echo ""

read -p "API URL (默认: https://generativelanguage.googleapis.com): " API_URL
API_URL=${API_URL:-https://generativelanguage.googleapis.com}

read -p "API Key (必需): " API_KEY
if [ -z "$API_KEY" ]; then
    echo "错误: API Key 不能为空"
    exit 1
fi

read -p "模型名称 (默认: gemini-2.0-flash-exp): " MODEL
MODEL=${MODEL:-gemini-2.0-flash-exp}

read -p "提示词 (可选，按回车使用默认): " PROMPT

echo ""
echo "========================================"
echo "测试配置:"
echo "========================================"
echo "API URL: $API_URL"
echo "API Key: ${API_KEY:0:10}..."
echo "模型: $MODEL"
if [ -n "$PROMPT" ]; then
    echo "提示词: $PROMPT"
fi
echo "========================================"
echo ""

# 构建命令
CMD="node test-image-quality.js --api-url \"$API_URL\" --api-key \"$API_KEY\" --model \"$MODEL\""
if [ -n "$PROMPT" ]; then
    CMD="$CMD --prompt \"$PROMPT\""
fi

# 执行测试
echo "开始测试..."
echo ""
eval $CMD

echo ""
echo "========================================"
echo "测试完成"
echo "========================================"
