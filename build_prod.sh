#!/bin/bash

# 遇到错误立即退出
set -e

echo "=========================================="
echo "Starting Production Build Process (Linux)"
echo "=========================================="

echo ""
echo "[1/3] Building Frontend..."
cd frontend
# 使用 npm ci 更适合生产环境构建（如果存在 package-lock.json）
if [ -f "package-lock.json" ]; then
    npm ci
else
    npm install
fi

npm run build
if [ $? -ne 0 ]; then
    echo "Frontend build failed!"
    exit 1
fi
cd ..

echo ""
echo "[2/3] Building Admin System..."
cd admin-system
if [ -f "package-lock.json" ]; then
    npm ci
else
    npm install
fi

npm run build
if [ $? -ne 0 ]; then
    echo "Admin System build failed!"
    exit 1
fi
cd ..

echo ""
echo "[3/3] Preparing Server..."
cd server
npm install --production
cd ..

echo ""
echo "=========================================="
echo "Build Complete Successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Ensure Nginx is running (sudo systemctl reload nginx if config changed)"
echo "2. Start the backend server: cd server && npm start"
echo "   (Recommended: use PM2 for production process management: pm2 start server.js)"
echo ""
