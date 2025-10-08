#!/bin/bash

###############################################################################
# Uninstall Script cho Dan Data Node trên Ubuntu Server
# Gỡ bỏ systemd service và dọn dẹp
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

echo "╔════════════════════════════════════════════════════════════╗"
echo "║      Uninstall Script - Dan Data Node Ubuntu Server       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

SERVICE_NAME="dan-data-node"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Warning
log_warning "Script này sẽ:"
echo "  • Dừng và xóa systemd service"
echo "  • Xóa file service từ /etc/systemd/system/"
echo "  • KHÔNG xóa thư mục storage (dữ liệu của bạn được giữ lại)"
echo "  • KHÔNG xóa Node.js và npm"
echo ""

read -p "Bạn có chắc chắn muốn tiếp tục? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Đã hủy bỏ"
    exit 0
fi

###############################################################################
# 1. Stop service
###############################################################################
log_info "Bước 1: Dừng service..."

if sudo systemctl is-active --quiet $SERVICE_NAME; then
    sudo systemctl stop $SERVICE_NAME
    log_success "Đã dừng service"
else
    log_warning "Service không đang chạy"
fi

###############################################################################
# 2. Disable service
###############################################################################
log_info "Bước 2: Vô hiệu hóa service..."

if sudo systemctl is-enabled --quiet $SERVICE_NAME 2>/dev/null; then
    sudo systemctl disable $SERVICE_NAME
    log_success "Đã vô hiệu hóa service"
else
    log_warning "Service không được enable"
fi

###############################################################################
# 3. Remove service file
###############################################################################
log_info "Bước 3: Xóa file service..."

if [ -f "$SERVICE_FILE" ]; then
    sudo rm "$SERVICE_FILE"
    log_success "Đã xóa file service: $SERVICE_FILE"
else
    log_warning "File service không tồn tại"
fi

###############################################################################
# 4. Reload systemd
###############################################################################
log_info "Bước 4: Reload systemd daemon..."
sudo systemctl daemon-reload
sudo systemctl reset-failed
log_success "Đã reload systemd daemon"

###############################################################################
# 5. Optional cleanup
###############################################################################
echo ""
log_info "Dọn dẹp tùy chọn:"
echo ""

# Ask to remove node_modules
read -p "Bạn có muốn xóa node_modules? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    if [ -d "$SCRIPT_DIR/node_modules" ]; then
        rm -rf "$SCRIPT_DIR/node_modules"
        log_success "Đã xóa node_modules"
    fi
fi

# Ask to remove logs
read -p "Bạn có muốn xóa logs? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    if [ -d "$SCRIPT_DIR/logs" ]; then
        rm -rf "$SCRIPT_DIR/logs"
        log_success "Đã xóa logs"
    fi
fi

# Ask to remove storage
log_warning "⚠️  CẢNH BÁO: Thao tác này sẽ XÓA TẤT CẢ DỮ LIỆU!"
read -p "Bạn có muốn xóa thư mục storage (DỮ LIỆU)? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Bạn CHẮC CHẮN muốn xóa storage? Nhập 'YES' để xác nhận: " CONFIRM
    if [ "$CONFIRM" = "YES" ]; then
        SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
        if [ -d "$SCRIPT_DIR/storage" ]; then
            rm -rf "$SCRIPT_DIR/storage"
            log_success "Đã xóa storage"
        fi
    else
        log_info "Đã bỏ qua xóa storage"
    fi
else
    log_info "Đã giữ lại thư mục storage"
fi

###############################################################################
# Summary
###############################################################################
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  GỠ CÀI ĐẶT HOÀN TẤT!                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log_success "Dan Data Node service đã được gỡ bỏ!"
echo ""
log_info "Lưu ý:"
echo "  • Node.js và npm vẫn còn trên hệ thống"
echo "  • Bạn có thể cài đặt lại bằng cách chạy: ./setup-ubuntu.sh"
echo ""
log_success "Hoàn tất!"

