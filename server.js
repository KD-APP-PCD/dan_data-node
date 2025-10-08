/**
 * Dan Data Node Server
 * Server phụ để lưu trữ và stream media files cho hệ thống KD
 */

import express from 'express';
import { createServer } from 'http';
import { io as ioClient } from 'socket.io-client';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, 'storage');

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Tạo thư mục storage nếu chưa có
await ensureStorageDirectory();

async function ensureStorageDirectory() {
  try {
    if (!existsSync(STORAGE_PATH)) {
      await fs.mkdir(STORAGE_PATH, { recursive: true });
      console.log('✅ Đã tạo thư mục storage:', STORAGE_PATH);
    }
  } catch (error) {
    console.error('❌ Lỗi khi tạo thư mục storage:', error);
  }
}

// Socket.IO client để kết nối với server chính
let mainServerSocket = null;
let nodeId = null;
let isConnected = false;

/**
 * Kết nối tới server chính
 */
async function connectToMainServer(host, port, nodeName) {
  try {
    const serverUrl = `http://${host}:${port}`;
    
    console.log(`🔌 Đang kết nối tới server chính: ${serverUrl}`);
    
    mainServerSocket = ioClient(serverUrl, {
      path: '/data-node-socket',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    
    mainServerSocket.on('connect', () => {
      console.log('✅ Đã kết nối tới server chính');
      
      // Đăng ký data node
      mainServerSocket.emit('register', {
        port: PORT,
        name: nodeName
      }, (response) => {
        if (response.success) {
          nodeId = response.nodeId;
          isConnected = true;
          console.log(`✅ Đăng ký thành công! Node ID: ${nodeId}`);
          
          // Bắt đầu gửi heartbeat
          startHeartbeat();
          
          // Gửi thông tin storage
          updateStorageInfo();
        } else {
          console.error('❌ Đăng ký thất bại:', response.error);
          process.exit(1);
        }
      });
    });
    
    mainServerSocket.on('disconnect', () => {
      console.log('🔌 Mất kết nối với server chính');
      isConnected = false;
    });
    
    mainServerSocket.on('connect_error', (error) => {
      console.error('❌ Lỗi kết nối:', error.message);
    });
    
    // Lắng nghe sự kiện upload file
    mainServerSocket.on('upload_file', async (data, callback) => {
      try {
        console.log('📥 Nhận yêu cầu upload file:', data.fileName);
        
        const result = await handleFileUpload(data);
        
        callback({
          success: true,
          ...result
        });
        
        // Cập nhật storage info sau khi upload
        await updateStorageInfo();
        
      } catch (error) {
        console.error('❌ Lỗi khi upload file:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });
    
    // Lắng nghe sự kiện xóa file
    mainServerSocket.on('delete_file', async (data, callback) => {
      try {
        console.log('🗑️  Nhận yêu cầu xóa file:', data.filePath);
        
        await handleFileDelete(data.filePath);
        
        callback({
          success: true,
          message: 'Đã xóa file thành công'
        });
        
        // Cập nhật storage info sau khi xóa
        await updateStorageInfo();
        
      } catch (error) {
        console.error('❌ Lỗi khi xóa file:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });
    
    // Lắng nghe yêu cầu lấy storage info
    mainServerSocket.on('get_storage_info', async (data, callback) => {
      try {
        const storageInfo = await getStorageInfo();
        callback({
          success: true,
          data: storageInfo
        });
      } catch (error) {
        callback({
          success: false,
          error: error.message
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Lỗi khi kết nối tới server chính:', error);
    throw error;
  }
}

/**
 * Gửi heartbeat định kỳ
 */
function startHeartbeat() {
  setInterval(() => {
    if (mainServerSocket && isConnected) {
      mainServerSocket.emit('heartbeat', (response) => {
        if (response && response.success) {
          // console.log('💓 Heartbeat OK');
        }
      });
    }
  }, 30000); // Mỗi 30 giây
}

/**
 * Cập nhật thông tin storage
 */
async function updateStorageInfo() {
  try {
    const storageInfo = await getStorageInfo();
    
    if (mainServerSocket && isConnected) {
      mainServerSocket.emit('storage_update', {
        storageUsed: storageInfo.used,
        storageTotal: storageInfo.total
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi cập nhật storage info:', error);
  }
}

/**
 * Lấy thông tin storage
 */
async function getStorageInfo() {
  try {
    const used = await getDirectorySize(STORAGE_PATH);
    
    // Lấy tổng dung lượng ổ đĩa (giả định 100GB, có thể dùng thư viện để lấy chính xác)
    const total = 100 * 1024 * 1024 * 1024; // 100GB
    
    return {
      used,
      total,
      available: total - used,
      path: STORAGE_PATH
    };
  } catch (error) {
    console.error('❌ Lỗi khi lấy storage info:', error);
    return {
      used: 0,
      total: 0,
      available: 0,
      path: STORAGE_PATH
    };
  }
}

/**
 * Tính kích thước thư mục
 */
async function getDirectorySize(dirPath) {
  let size = 0;
  
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      
      if (file.isDirectory()) {
        size += await getDirectorySize(filePath);
      } else {
        const stats = await fs.stat(filePath);
        size += stats.size;
      }
    }
  } catch (error) {
    console.error('❌ Lỗi khi tính kích thước thư mục:', error);
  }
  
  return size;
}

/**
 * Xử lý upload file
 */
async function handleFileUpload(data) {
  const { matchId, fileName, fileType, fileSize, fileData, section, questionOrder } = data;
  
  // Tạo thư mục cho match
  const matchDir = path.join(STORAGE_PATH, `match_${matchId}`);
  await fs.mkdir(matchDir, { recursive: true });
  
  // Tạo tên file unique
  const timestamp = Date.now();
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  const uniqueFileName = `${section}_${questionOrder}_${timestamp}${ext}`;
  
  const filePath = path.join(matchDir, uniqueFileName);
  
  // Lưu file
  const buffer = Buffer.from(fileData, 'base64');
  await fs.writeFile(filePath, buffer);
  
  console.log(`✅ Đã lưu file: ${filePath} (${fileSize} bytes)`);
  
  // Tạo stream URL
  const streamUrl = `http://localhost:${PORT}/stream/match_${matchId}/${uniqueFileName}`;
  
  return {
    filePath: filePath,
    streamUrl: streamUrl,
    storagePath: `match_${matchId}/${uniqueFileName}`,
    fileSize: fileSize
  };
}

/**
 * Xử lý xóa file
 */
async function handleFileDelete(filePath) {
  const fullPath = path.join(STORAGE_PATH, filePath);
  
  if (existsSync(fullPath)) {
    await fs.unlink(fullPath);
    console.log(`✅ Đã xóa file: ${fullPath}`);
  } else {
    throw new Error('File không tồn tại');
  }
}

// Routes

/**
 * GET /
 * Health check
 */
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    nodeId: nodeId,
    isConnected: isConnected,
    storage: STORAGE_PATH
  });
});

/**
 * GET /stream/:matchId/:fileName
 * Stream file
 */
app.get('/stream/:matchId/:fileName', async (req, res) => {
  try {
    const { matchId, fileName } = req.params;
    const filePath = path.join(STORAGE_PATH, matchId, fileName);
    
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File không tồn tại' });
    }
    
    // Stream file
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('❌ Lỗi khi stream file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Khởi động server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 Data Node Server đang chạy tại http://localhost:${PORT}`);
  console.log(`📁 Storage path: ${STORAGE_PATH}`);
  
  // Prompt user để nhập thông tin kết nối
  promptConnection();
});

/**
 * Prompt user nhập thông tin kết nối
 */
async function promptConnection() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('Nhập IP server chính: ', (host) => {
    rl.question('Nhập PORT server chính: ', (port) => {
      rl.question('Nhập tên Data Node: ', (name) => {
        rl.close();
        
        // Kết nối tới server chính
        connectToMainServer(host, port, name).catch(error => {
          console.error('❌ Không thể kết nối tới server chính:', error);
          process.exit(1);
        });
      });
    });
  });
}

