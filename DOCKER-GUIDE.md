# Hướng dẫn sử dụng Docker cho Dan Data Node

## Yêu cầu

- Docker Desktop hoặc Docker Engine
- Docker Compose v2+

## Khởi động nhanh

### 1. Build và khởi động

```bash
docker-compose up -d --build
```

Hoặc sử dụng script:

```bash
bash start.sh
# Chọn 'y' khi được hỏi về Docker
```

### 2. Xem logs

```bash
docker-compose logs -f
```

### 3. Dừng server

```bash
docker-compose down
```

## Các lệnh Docker hữu ích

### Xem trạng thái container

```bash
docker-compose ps
```

### Restart container

```bash
docker-compose restart
```

### Xem logs (100 dòng cuối)

```bash
docker-compose logs --tail=100
```

### Vào shell của container

```bash
docker-compose exec data-node sh
```

### Xóa container và volumes

```bash
docker-compose down -v
```

### Rebuild image

```bash
docker-compose build --no-cache
docker-compose up -d
```

## Cấu trúc Docker

### Dockerfile

- Base image: `node:18-alpine`
- Working directory: `/app`
- Port: 3000 (có thể thay đổi trong .env)
- Storage: `/app/storage` (được mount từ host)

### docker-compose.yml

- Service name: `data-node`
- Container name: `dan_data_node`
- Network: `data-node-network`
- Volumes:
  - `./storage:/app/storage` - Lưu trữ files
  - `./logs:/app/logs` - Logs
- Ports: `3000:3000` (host:container)
- Restart policy: `unless-stopped`

## Volumes

### Storage Volume

Files được lưu trong `./storage` trên host machine, được mount vào `/app/storage` trong container.

**Lợi ích:**
- Dữ liệu không bị mất khi container restart
- Dễ dàng backup và restore
- Có thể truy cập files từ host

### Logs Volume

Logs được lưu trong `./logs` trên host machine.

**Xem logs:**
```bash
tail -f logs/output.log
tail -f logs/error.log
```

## Environment Variables

Tạo file `.env` để cấu hình:

```env
PORT=3000
STORAGE_PATH=./storage
NODE_ENV=production
```

**Lưu ý:** File `.env` được tự động tạo từ `.env.example` khi chạy `start.sh`

## Networking

### Kết nối với server chính KD

Khi container khởi động, bạn cần nhập:

1. **IP của server chính**: 
   - Nếu KD chạy trên cùng máy: `host.docker.internal` (Mac/Windows) hoặc `172.17.0.1` (Linux)
   - Nếu KD chạy trên máy khác: IP thực của máy đó

2. **Port của server chính**: Thường là `2701`

3. **Tên data node**: Ví dụ `DataNode-Docker-01`

### Expose port ra ngoài

Mặc định port 3000 được expose. Để thay đổi, sửa trong `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # host_port:container_port
```

## Troubleshooting

### Container không khởi động

```bash
# Xem logs chi tiết
docker-compose logs

# Kiểm tra trạng thái
docker-compose ps

# Rebuild image
docker-compose build --no-cache
docker-compose up -d
```

### Không kết nối được với server chính

1. Kiểm tra IP và port của server chính
2. Kiểm tra firewall
3. Nếu KD chạy trên cùng máy, dùng `host.docker.internal` thay vì `localhost`

### Storage đầy

```bash
# Kiểm tra dung lượng
du -sh storage/

# Xóa files cũ
rm -rf storage/match_old_id/
```

### Permission denied

```bash
# Cấp quyền cho thư mục storage
chmod -R 755 storage/
chmod -R 755 logs/
```

### Container bị crash liên tục

```bash
# Xem logs để biết lỗi
docker-compose logs --tail=50

# Restart container
docker-compose restart

# Nếu vẫn lỗi, rebuild
docker-compose down
docker-compose up -d --build
```

## Production Deployment

### 1. Sử dụng Docker Compose

```bash
# Clone repository
git clone <repo_url>
cd dan_data-node

# Tạo .env
cp .env.example .env
nano .env  # Chỉnh sửa cấu hình

# Khởi động
docker-compose up -d

# Xem logs
docker-compose logs -f
```

### 2. Sử dụng Docker Swarm

```bash
# Init swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml dan-data-node

# Xem services
docker service ls

# Xem logs
docker service logs -f dan-data-node_data-node
```

### 3. Sử dụng Kubernetes

Tạo file `k8s-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dan-data-node
spec:
  replicas: 1
  selector:
    matchLabels:
      app: dan-data-node
  template:
    metadata:
      labels:
        app: dan-data-node
    spec:
      containers:
      - name: data-node
        image: dan-data-node:latest
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: storage
          mountPath: /app/storage
      volumes:
      - name: storage
        persistentVolumeClaim:
          claimName: dan-data-node-storage
```

## Monitoring

### Health Check

```bash
# Kiểm tra health
curl http://localhost:3000/

# Response:
# {
#   "status": "online",
#   "nodeId": 1,
#   "isConnected": true,
#   "storage": "/app/storage"
# }
```

### Resource Usage

```bash
# Xem CPU, RAM usage
docker stats dan_data_node

# Xem disk usage
docker system df
```

## Backup và Restore

### Backup

```bash
# Backup storage
tar -czf storage-backup-$(date +%Y%m%d).tar.gz storage/

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

### Restore

```bash
# Restore storage
tar -xzf storage-backup-20251008.tar.gz

# Restart container
docker-compose restart
```

## Security

### Best Practices

1. **Không expose port ra internet** - Chỉ cho phép truy cập từ server chính
2. **Sử dụng network riêng** - Tạo Docker network riêng cho các services
3. **Giới hạn resources** - Set CPU và memory limits trong docker-compose.yml
4. **Regular updates** - Cập nhật base image thường xuyên
5. **Scan vulnerabilities** - Sử dụng `docker scan` để kiểm tra lỗ hổng

### Resource Limits

Thêm vào `docker-compose.yml`:

```yaml
services:
  data-node:
    # ... other configs
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Tham khảo

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

