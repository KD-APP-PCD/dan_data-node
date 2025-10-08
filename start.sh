#!/bin/bash

# Script khởi động Data Node Server

echo "========================================="
echo "  Dan Data Node - Khởi động Server"
echo "========================================="
echo ""

# Kiểm tra file .env
if [ ! -f .env ]; then
  echo "⚠️  File .env không tồn tại. Tạo từ .env.example..."
  cp .env.example .env
  echo "✅ Đã tạo file .env. Vui lòng cấu hình trước khi chạy."
  exit 1
fi

# Kiểm tra Docker
if command -v docker &> /dev/null; then
  echo "🐳 Phát hiện Docker. Bạn muốn chạy với Docker? (y/n)"
  read -r use_docker
  
  if [ "$use_docker" = "y" ] || [ "$use_docker" = "Y" ]; then
    echo "🚀 Khởi động với Docker..."
    docker-compose up -d
    echo ""
    echo "✅ Data Node đã khởi động!"
    echo "📝 Xem logs: docker-compose logs -f"
    echo "🛑 Dừng server: docker-compose down"
    exit 0
  fi
fi

# Chạy trực tiếp với Node.js
echo "🚀 Khởi động với Node.js..."

# Kiểm tra node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 Cài đặt dependencies..."
  npm install
fi

# Khởi động server
npm start

