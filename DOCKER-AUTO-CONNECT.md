# 🐳 DOCKER AUTO CONNECT - DATA NODE

Hướng dẫn cấu hình Data Node để **TỰ ĐỘNG KẾT NỐI** tới KD Server khi chạy Docker.

---

## ❌ VẤN ĐỀ

Khi chạy Data Node bằng Docker, server khởi động nhưng **KHÔNG KẾT NỐI** tới KD Server:

```bash
docker logs <container_id>

> dan_data-node@1.0.0 start
> node server.js

🚀 Data Node Server đang chạy tại http://localhost:1024
📁 Storage path: /app/storage
# ❌ KHÔNG CÓ DÒNG "Đang kết nối tới server chính..."
```

**Nguyên nhân:**
- File `.env` không có cấu hình `MAIN_SERVER_HOST`, `MAIN_SERVER_PORT`, `NODE_NAME`
- Server chờ input từ stdin (không có trong Docker)
- Status hiển thị **offline** trên admin panel

---

## ✅ GIẢI PHÁP

### 1. Cấu hình file `.env`

Mở file `dan_data-node/.env` và thêm:

```env
# Port cho Data Node Server
PORT=1024

# Đường dẫn lưu trữ files
STORAGE_PATH=./storage

# ✅ THÊM CẤU HÌNH TỰ ĐỘNG KẾT NỐI
MAIN_SERVER_HOST=<IP_SERVER_CHINH>
MAIN_SERVER_PORT=2701
NODE_NAME=DataNode-01
```

**Thay thế:**
- `<IP_SERVER_CHINH>`: IP của KD Server
  - Local: `127.0.0.1` hoặc `localhost`
  - LAN: `192.168.1.100` (IP máy chạy KD)
  - Public: `your-domain.com` hoặc IP public

### 2. Ví dụ cấu hình

#### Local Testing (cùng máy)
```env
MAIN_SERVER_HOST=host.docker.internal
MAIN_SERVER_PORT=2701
NODE_NAME=DataNode-Local-01
```

**Lưu ý:** Dùng `host.docker.internal` để Docker container kết nối tới host machine.

#### LAN (máy khác trong mạng)
```env
MAIN_SERVER_HOST=192.168.1.100
MAIN_SERVER_PORT=2701
NODE_NAME=DataNode-LAN-01
```

#### Production (server public)
```env
MAIN_SERVER_HOST=kd.yourdomain.com
MAIN_SERVER_PORT=2701
NODE_NAME=DataNode-Production-01
```

### 3. Rebuild Docker container

```bash
cd dan_data-node

# Dừng container cũ
docker-compose down

# Rebuild và khởi động
docker-compose up -d --build

# Xem logs
docker-compose logs -f
```

### 4. Kiểm tra logs

Bạn sẽ thấy:

```bash
docker-compose logs -f

🚀 Data Node Server đang chạy tại http://localhost:1024
📁 Storage path: /app/storage
🔌 Tự động kết nối tới server chính...
   Host: 192.168.1.100
   Port: 2701
   Name: DataNode-01
🔌 Đang kết nối tới server chính tại http://192.168.1.100:2701...
✅ Đã kết nối tới server chính!
📤 Đã đăng ký data node: DataNode-01
💓 Heartbeat sent
```

---

## 🏥 HEALTH CHECK TỰ ĐỘNG

KD Server giờ có **health check tự động** mỗi 5 giây:

### Trên KD Server

Khi khởi động KD Server, bạn sẽ thấy:

```bash
cd KD
npm start

Server đang chạy tại http://localhost:2701
🏥 Bắt đầu health check cho data nodes (mỗi 5 giây)
```

### Logs health check

```bash
# Khi data node online
✅ Data node DataNode-01 (ID: 1) đã online

# Khi data node offline
❌ Data node DataNode-01 (ID: 1) đã offline
```

### Kiểm tra trong Admin Panel

1. Truy cập: `http://localhost:2701/admin/data-nodes`
2. Status sẽ tự động cập nhật mỗi 5 giây:
   - 🟢 **Online** - Data node đang kết nối
   - 🔴 **Offline** - Data node mất kết nối
   - ⚠️ **Error** - Data node có lỗi

---

## 🐛 TROUBLESHOOTING

### Lỗi 1: Vẫn không kết nối được

**Kiểm tra:**

```bash
# 1. Kiểm tra .env có đúng không
cat dan_data-node/.env

# 2. Kiểm tra KD Server đang chạy
curl http://<MAIN_SERVER_HOST>:2701

# 3. Kiểm tra network
ping <MAIN_SERVER_HOST>

# 4. Kiểm tra firewall
# Đảm bảo port 2701 không bị block
```

### Lỗi 2: "Cannot connect to server"

**Nguyên nhân:** IP hoặc port sai

**Giải pháp:**

```bash
# Kiểm tra IP của KD Server
# Trên máy chạy KD:
ifconfig | grep inet  # macOS/Linux
ipconfig              # Windows

# Cập nhật .env với IP đúng
MAIN_SERVER_HOST=<IP_DUNG>
```

### Lỗi 3: Docker không đọc .env

**Nguyên nhân:** File `.env` không được mount vào container

**Giải pháp:**

Kiểm tra `docker-compose.yml`:

```yaml
services:
  data-node:
    build: .
    ports:
      - "1024:1024"
    volumes:
      - ./storage:/app/storage
      - ./.env:/app/.env  # ✅ Đảm bảo dòng này có
    restart: unless-stopped
```

### Lỗi 4: "host.docker.internal" không hoạt động

**Nguyên nhân:** Linux không hỗ trợ `host.docker.internal`

**Giải pháp:**

```bash
# Option 1: Dùng IP thật của host
ip addr show | grep inet

# Option 2: Thêm vào docker-compose.yml
services:
  data-node:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

---

## 📊 KIỂM TRA STATUS

### 1. Kiểm tra từ Docker logs

```bash
docker-compose logs -f | grep "kết nối"
```

### 2. Kiểm tra từ KD Server logs

```bash
cd KD
npm start

# Xem logs:
# ✅ Data node registered: DataNode-01
# 📊 Storage info updated: 0 / 500GB
```

### 3. Kiểm tra từ Admin Panel

```bash
# Mở browser
open http://localhost:2701/admin/data-nodes

# Kiểm tra status column:
# - Online: Màu xanh
# - Offline: Màu đỏ
```

### 4. Kiểm tra từ API

```bash
curl http://localhost:2701/api/data-nodes

# Response:
[
  {
    "id": 1,
    "name": "DataNode-01",
    "host": "192.168.1.100",
    "port": 1024,
    "status": "online",  # ✅ Phải là "online"
    "storage_used": 0,
    "storage_total": 536870912000
  }
]
```

---

## 🎯 BEST PRACTICES

### 1. Đặt tên Data Node có ý nghĩa

```env
# ❌ Không tốt
NODE_NAME=DataNode-01

# ✅ Tốt hơn
NODE_NAME=DataNode-Production-SG-01
NODE_NAME=DataNode-Backup-US-02
NODE_NAME=DataNode-Dev-Local
```

### 2. Sử dụng domain thay vì IP

```env
# ❌ IP có thể thay đổi
MAIN_SERVER_HOST=192.168.1.100

# ✅ Domain ổn định hơn
MAIN_SERVER_HOST=kd.yourdomain.com
```

### 3. Backup file .env

```bash
# Backup trước khi thay đổi
cp .env .env.backup

# Restore nếu cần
cp .env.backup .env
```

### 4. Sử dụng .env.example

```bash
# Tạo .env từ template
cp .env.example .env

# Sửa các giá trị cần thiết
nano .env
```

---

## 📝 CHECKLIST

Sau khi cấu hình:

- [ ] File `.env` có `MAIN_SERVER_HOST`, `MAIN_SERVER_PORT`, `NODE_NAME`
- [ ] KD Server đang chạy tại `http://<MAIN_SERVER_HOST>:2701`
- [ ] Docker container đã rebuild: `docker-compose up -d --build`
- [ ] Logs hiển thị "✅ Đã kết nối tới server chính!"
- [ ] Admin panel hiển thị status "Online"
- [ ] Health check chạy mỗi 5 giây
- [ ] Không có lỗi trong logs

---

## 🎉 KẾT LUẬN

Giờ Data Node sẽ **TỰ ĐỘNG KẾT NỐI** khi khởi động Docker!

**Lợi ích:**
- ✅ Không cần nhập thủ công
- ✅ Tự động reconnect khi mất kết nối
- ✅ Health check mỗi 5 giây
- ✅ Status cập nhật real-time
- ✅ Dễ dàng deploy production

**Next steps:**
1. Test kết nối local
2. Deploy lên production server
3. Monitor logs và status
4. Setup backup và failover

