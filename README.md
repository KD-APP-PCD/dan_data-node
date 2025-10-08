# Dan Data Node

Server phụ để lưu trữ và stream media files cho hệ thống KD Quiz.

## Tính năng

- Kết nối tới server chính qua Socket.IO
- Nhận và lưu trữ files (text, images, videos)
- Stream media files qua HTTP
- Tự động cập nhật thông tin storage
- Heartbeat để duy trì kết nối
- Hỗ trợ Docker để dễ dàng triển khai

## Yêu cầu hệ thống

- Node.js 18+ hoặc Docker
- Kết nối mạng tới server chính KD
- Dung lượng ổ đĩa đủ để lưu trữ media files

## Cài đặt

### Cách 1: Chạy trực tiếp với Node.js

1. Cài đặt dependencies:
```bash
npm install
```

2. Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```

3. Chỉnh sửa file `.env` nếu cần (tùy chọn):
```env
PORT=3000
STORAGE_PATH=./storage
```

4. Khởi động server:
```bash
npm start
```

5. Nhập thông tin kết nối khi được yêu cầu:
- IP server chính (ví dụ: 192.168.1.100)
- PORT server chính (ví dụ: 2701)
- Tên Data Node (ví dụ: DataNode-01)

### Cách 2: Chạy với Docker

1. Build và khởi động:
```bash
docker-compose up -d
```

2. Xem logs:
```bash
docker-compose logs -f
```

3. Dừng server:
```bash
docker-compose down
```

### Cách 3: Sử dụng script tự động

```bash
chmod +x start.sh
./start.sh
```

## Cấu hình

### Biến môi trường

- `PORT`: Port để chạy server (mặc định: 3000)
- `STORAGE_PATH`: Đường dẫn lưu trữ files (mặc định: ./storage)

### Kết nối tới server chính

Trước khi chạy data node, bạn cần:

1. Đăng nhập vào admin panel của server chính KD
2. Vào trang "Quản lý Data Nodes"
3. Thêm port mới (ví dụ: 3000)
4. Lưu lại thông tin

Sau đó khi chạy data node, nhập:
- IP của server chính
- Port đã được thêm trong admin panel
- Tên cho data node

## API Endpoints

### GET /
Health check và thông tin node

**Response:**
```json
{
  "status": "online",
  "nodeId": 1,
  "isConnected": true,
  "storage": "/app/storage"
}
```

### GET /stream/:matchId/:fileName
Stream media file

**Ví dụ:**
```
GET /stream/match_123/khoi_dong_rieng_0_1234567890.mp4
```

## Cấu trúc thư mục

```
dan_data-node/
├── server.js           # Main server file
├── package.json        # Dependencies
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose configuration
├── start.sh           # Startup script
├── .env.example       # Environment variables example
├── storage/           # File storage directory
│   └── match_*/       # Files organized by match ID
└── README.md          # This file
```

## Troubleshooting

### Không kết nối được tới server chính

1. Kiểm tra IP và port của server chính
2. Đảm bảo port đã được thêm trong admin panel
3. Kiểm tra firewall và network connectivity
4. Xem logs để biết chi tiết lỗi

### File không stream được

1. Kiểm tra file có tồn tại trong thư mục storage
2. Kiểm tra quyền truy cập file
3. Xem logs để biết chi tiết lỗi

### Storage đầy

1. Kiểm tra dung lượng ổ đĩa
2. Xóa các files không cần thiết
3. Tăng dung lượng ổ đĩa

## Bảo mật

- Data node chỉ chấp nhận kết nối từ server chính đã đăng ký
- Files được lưu trữ trong thư mục riêng biệt theo match ID
- Không có authentication cho streaming (có thể thêm nếu cần)

## License

ISC