#!/bin/bash

###############################################################################
# Auto Setup Script cho Dan Data Node trên Ubuntu Server
# Tự động cài đặt Node.js, dependencies, và cấu hình systemd service
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    log_error "Vui lòng KHÔNG chạy script này với quyền root hoặc sudo"
    log_info "Script sẽ tự động yêu cầu sudo khi cần thiết"
    exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Auto Setup Script - Dan Data Node cho Ubuntu Server     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
log_info "Script directory: $SCRIPT_DIR"

###############################################################################
# 1. Update system
###############################################################################
log_info "Bước 1: Cập nhật hệ thống..."
sudo apt-get update -y
log_success "Đã cập nhật danh sách packages"

###############################################################################
# 2. Install Node.js 18.x
###############################################################################
log_info "Bước 2: Kiểm tra và cài đặt Node.js..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_info "Node.js đã được cài đặt: $NODE_VERSION"
else
    log_info "Đang cài đặt Node.js 18.x..."
    
    # Install Node.js 18.x from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    log_success "Đã cài đặt Node.js $(node -v)"
fi

# Verify npm
if command -v npm &> /dev/null; then
    log_success "npm version: $(npm -v)"
else
    log_error "npm không được cài đặt!"
    exit 1
fi

###############################################################################
# 3. Install dependencies
###############################################################################
log_info "Bước 3: Cài đặt dependencies..."

cd "$SCRIPT_DIR"

if [ ! -f "package.json" ]; then
    log_error "Không tìm thấy package.json trong thư mục hiện tại!"
    exit 1
fi

npm install
log_success "Đã cài đặt tất cả dependencies"

###############################################################################
# 4. Create .env file
###############################################################################
log_info "Bước 4: Tạo file .env..."

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        log_success "Đã tạo file .env từ .env.example"
    else
        # Create default .env
        cat > .env << EOF
# Dan Data Node Configuration
PORT=3000
STORAGE_PATH=./storage
NODE_ENV=production
EOF
        log_success "Đã tạo file .env mặc định"
    fi
else
    log_warning "File .env đã tồn tại, bỏ qua bước này"
fi

###############################################################################
# 5. Create storage directory
###############################################################################
log_info "Bước 5: Tạo thư mục storage..."

mkdir -p "$SCRIPT_DIR/storage"
mkdir -p "$SCRIPT_DIR/logs"
chmod 755 "$SCRIPT_DIR/storage"
chmod 755 "$SCRIPT_DIR/logs"

log_success "Đã tạo thư mục storage và logs"

###############################################################################
# 6. Create systemd service
###############################################################################
log_info "Bước 6: Tạo systemd service..."

SERVICE_NAME="dan-data-node"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Get current user
CURRENT_USER=$(whoami)

# Create service file
sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Dan Data Node - Distributed Storage Node
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/node $SCRIPT_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=append:$SCRIPT_DIR/logs/output.log
StandardError=append:$SCRIPT_DIR/logs/error.log

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

log_success "Đã tạo systemd service: $SERVICE_FILE"

# Reload systemd
sudo systemctl daemon-reload
log_success "Đã reload systemd daemon"

###############################################################################
# 7. Configure firewall (optional)
###############################################################################
log_info "Bước 7: Cấu hình firewall..."

if command -v ufw &> /dev/null; then
    read -p "Bạn có muốn mở port 3000 trên firewall? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo ufw allow 3000/tcp
        log_success "Đã mở port 3000 trên firewall"
    else
        log_warning "Bỏ qua cấu hình firewall"
    fi
else
    log_warning "UFW không được cài đặt, bỏ qua cấu hình firewall"
fi

###############################################################################
# 8. Summary and instructions
###############################################################################
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    CÀI ĐẶT HOÀN TẤT!                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log_success "Dan Data Node đã được cài đặt thành công!"
echo ""
echo "📋 Các lệnh quản lý service:"
echo "   • Khởi động:  sudo systemctl start $SERVICE_NAME"
echo "   • Dừng:       sudo systemctl stop $SERVICE_NAME"
echo "   • Khởi động lại: sudo systemctl restart $SERVICE_NAME"
echo "   • Xem trạng thái: sudo systemctl status $SERVICE_NAME"
echo "   • Xem logs:   sudo journalctl -u $SERVICE_NAME -f"
echo "   • Tự động khởi động: sudo systemctl enable $SERVICE_NAME"
echo ""
echo "📁 Thư mục quan trọng:"
echo "   • Storage: $SCRIPT_DIR/storage"
echo "   • Logs: $SCRIPT_DIR/logs"
echo "   • Config: $SCRIPT_DIR/.env"
echo ""
echo "🚀 Bước tiếp theo:"
echo "   1. Chỉnh sửa file .env nếu cần (PORT, STORAGE_PATH...)"
echo "   2. Khởi động service: sudo systemctl start $SERVICE_NAME"
echo "   3. Kiểm tra trạng thái: sudo systemctl status $SERVICE_NAME"
echo "   4. Kết nối với server chính KD"
echo ""

# Ask to start service now
read -p "Bạn có muốn khởi động service ngay bây giờ? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo systemctl start $SERVICE_NAME
    sleep 2
    sudo systemctl status $SERVICE_NAME --no-pager
    echo ""
    log_success "Service đã được khởi động!"
    
    # Ask to enable auto-start
    read -p "Bạn có muốn tự động khởi động service khi boot? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo systemctl enable $SERVICE_NAME
        log_success "Đã bật tự động khởi động!"
    fi
else
    log_info "Bạn có thể khởi động service sau bằng lệnh: sudo systemctl start $SERVICE_NAME"
fi

echo ""
log_success "Hoàn tất! Chúc bạn sử dụng vui vẻ! 🎉"

