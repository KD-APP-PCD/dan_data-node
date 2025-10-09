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
import checkDiskSpace from 'check-disk-space';
import mime from 'mime-types';
import { MatchManager } from './match-manager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, 'storage');
const HOST = process.env.HOST || 'localhost';

// Initialize MatchManager
const matchManager = new MatchManager(STORAGE_PATH, PORT, HOST);

// Danh sách các định dạng file được hỗ trợ
const SUPPORTED_FORMATS = {
  images: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
    '.ico', '.tiff', '.tif', '.heic', '.heif', '.avif'
  ],
  videos: [
    '.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv',
    '.m4v', '.mpg', '.mpeg', '.3gp', '.ogv', '.m2ts', '.mts'
  ],
  audio: [
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma'
  ]
};

// Kiểm tra file có được hỗ trợ không
function isSupportedFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return [...SUPPORTED_FORMATS.images, ...SUPPORTED_FORMATS.videos, ...SUPPORTED_FORMATS.audio].includes(ext);
}

// Lấy loại file
function getFileType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (SUPPORTED_FORMATS.images.includes(ext)) return 'image';
  if (SUPPORTED_FORMATS.videos.includes(ext)) return 'video';
  if (SUPPORTED_FORMATS.audio.includes(ext)) return 'audio';
  return 'unknown';
}

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

    // Lắng nghe yêu cầu tạo folder
    mainServerSocket.on('create_folder', async (data, callback) => {
      try {
        const { folderName } = data;
        console.log(`📁 Nhận yêu cầu tạo folder: ${folderName}`);

        const folderPath = path.join(STORAGE_PATH, folderName);

        // Check if storage directory exists and is writable
        try {
          await fs.access(STORAGE_PATH, fs.constants.W_OK);
        } catch (accessError) {
          console.error(`❌ Storage directory không có quyền ghi: ${STORAGE_PATH}`);
          console.error(`   Error: ${accessError.message}`);
          callback({
            success: false,
            error: `Storage directory không có quyền ghi: ${accessError.message}`
          });
          return;
        }

        // Tạo folder nếu chưa tồn tại
        if (!existsSync(folderPath)) {
          try {
            await fs.mkdir(folderPath, { recursive: true, mode: 0o755 });
            console.log(`✅ Đã tạo folder: ${folderPath}`);

            // Verify folder was created
            if (!existsSync(folderPath)) {
              throw new Error('Folder created but not found');
            }
          } catch (mkdirError) {
            console.error(`❌ Không thể tạo folder: ${folderPath}`);
            console.error(`   Error: ${mkdirError.message}`);
            console.error(`   Code: ${mkdirError.code}`);
            callback({
              success: false,
              error: `Không thể tạo folder: ${mkdirError.message}`
            });
            return;
          }
        } else {
          console.log(`ℹ️  Folder đã tồn tại: ${folderPath}`);
        }

        callback({
          success: true,
          folderPath: folderPath,
          message: `Folder ${folderName} đã sẵn sàng`
        });

      } catch (error) {
        console.error('❌ Lỗi khi tạo folder:', error);
        console.error('   Stack:', error.stack);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // ========== MATCH MANAGEMENT HANDLERS ==========

    // Tạo trận đấu mới
    mainServerSocket.on('create_match', async (data, callback) => {
      try {
        console.log('🎮 [CREATE_MATCH] Nhận yêu cầu tạo trận đấu:');
        console.log(`   Match ID: ${data.matchId}`);
        console.log(`   Match Name: ${data.name}`);
        console.log(`   Match Code: ${data.code}`);
        console.log(`   Created By: ${data.createdBy || 'N/A'}`);

        const match = await matchManager.createMatch(data);

        console.log(`✅ [CREATE_MATCH] Đã tạo trận đấu thành công: ${data.matchId}`);
        console.log(`   Folder: ${STORAGE_PATH}/${data.matchId}`);

        callback({
          success: true,
          data: match,
          message: `Đã tạo trận đấu ${data.matchId}`
        });

      } catch (error) {
        console.error(`❌ [CREATE_MATCH] Lỗi khi tạo trận đấu ${data.matchId}:`, error.message);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Đọc match.json
    mainServerSocket.on('get_match', async (data, callback) => {
      try {
        const { matchId } = data;
        console.log(`📖 [GET_MATCH] Nhận yêu cầu đọc match: ${matchId}`);

        const match = await matchManager.getMatch(matchId);

        console.log(`✅ [GET_MATCH] Đã đọc match.json thành công: ${matchId}`);
        console.log(`   Total questions: ${match.statistics?.total_questions || 0}`);
        console.log(`   Total media files: ${match.statistics?.total_media_files || 0}`);

        callback({
          success: true,
          data: match
        });

      } catch (error) {
        console.error(`❌ [GET_MATCH] Lỗi khi đọc match ${matchId}:`, error.message);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Thêm câu hỏi vào match.json
    mainServerSocket.on('add_question', async (data, callback) => {
      try {
        const { matchId, ...questionData } = data;
        console.log(`➕ Nhận yêu cầu thêm câu hỏi vào ${matchId}`);

        const question = await matchManager.addQuestion(matchId, questionData);

        callback({
          success: true,
          data: question,
          message: 'Đã thêm câu hỏi thành công'
        });

      } catch (error) {
        console.error('❌ Lỗi khi thêm câu hỏi:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Cập nhật câu hỏi
    mainServerSocket.on('update_question', async (data, callback) => {
      try {
        const { matchId, ...updateData } = data;
        console.log(`📝 [UPDATE_QUESTION] Nhận yêu cầu cập nhật câu hỏi trong ${matchId}`);

        const match = await matchManager.updateQuestion(matchId, updateData);

        callback({
          success: true,
          data: match,
          message: 'Đã cập nhật câu hỏi thành công'
        });

      } catch (error) {
        console.error('❌ [UPDATE_QUESTION] Lỗi:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Xóa câu hỏi
    mainServerSocket.on('delete_question', async (data, callback) => {
      try {
        const { matchId, section, playerIndex, order } = data;
        console.log(`🗑️  [DELETE_QUESTION] Nhận yêu cầu xóa câu hỏi từ ${matchId}/${section}`);

        await matchManager.deleteQuestion(matchId, section, playerIndex, order);

        callback({
          success: true,
          message: 'Đã xóa câu hỏi thành công'
        });

      } catch (error) {
        console.error('❌ [DELETE_QUESTION] Lỗi:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Gán câu hỏi cho thí sinh
    mainServerSocket.on('assign_player', async (data, callback) => {
      try {
        const { matchId, section, currentPlayerIndex, questionOrder, newPlayerIndex } = data;
        console.log(`🔄 [ASSIGN_PLAYER] Nhận yêu cầu gán câu hỏi:`, {
          matchId,
          section,
          currentPlayerIndex,
          questionOrder,
          newPlayerIndex
        });

        const question = await matchManager.assignQuestionToPlayer(
          matchId,
          section,
          currentPlayerIndex,
          questionOrder,
          newPlayerIndex
        );

        callback({
          success: true,
          data: question,
          message: 'Đã gán câu hỏi cho thí sinh mới'
        });

      } catch (error) {
        console.error('❌ [ASSIGN_PLAYER] Lỗi:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Xóa trận đấu
    mainServerSocket.on('delete_match', async (data, callback) => {
      try {
        const { matchId } = data;
        console.log(`🗑️  Nhận yêu cầu xóa trận đấu: ${matchId}`);

        await matchManager.deleteMatch(matchId);

        callback({
          success: true,
          message: `Đã xóa trận đấu ${matchId}`
        });

      } catch (error) {
        console.error('❌ Lỗi khi xóa trận đấu:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Lấy danh sách tất cả trận đấu
    mainServerSocket.on('get_all_matches', async (data, callback) => {
      try {
        console.log('📋 Nhận yêu cầu lấy danh sách trận đấu');

        const matches = await matchManager.getAllMatches();

        callback({
          success: true,
          data: matches
        });

      } catch (error) {
        console.error('❌ Lỗi khi lấy danh sách trận đấu:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Cập nhật trạng thái trận đấu
    mainServerSocket.on('update_match_status', async (data, callback) => {
      try {
        const { matchId, status } = data;
        console.log(`🔄 Nhận yêu cầu cập nhật status ${matchId}: ${status}`);

        await matchManager.updateMatchStatus(matchId, status);

        callback({
          success: true,
          message: `Đã cập nhật status thành ${status}`
        });

      } catch (error) {
        console.error('❌ Lỗi khi cập nhật status:', error);
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
    // Lấy dung lượng đã sử dụng trong folder storage
    const used = await getDirectorySize(STORAGE_PATH);

    // Lấy thông tin ổ đĩa thực tế
    const diskSpace = await checkDiskSpace(STORAGE_PATH);

    return {
      used,
      total: diskSpace.size,
      available: diskSpace.free,
      path: STORAGE_PATH,
      diskInfo: {
        diskPath: diskSpace.diskPath || STORAGE_PATH,
        size: diskSpace.size,
        free: diskSpace.free
      }
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
  // Support both old and new format
  const fileName = data.fileName;
  const fileBuffer = data.fileBuffer || data.fileData; // Support both names
  const mimeType = data.mimeType || data.fileType;
  const folder = data.folder || '';

  if (!fileName) {
    throw new Error('Thiếu tên file');
  }

  if (!fileBuffer) {
    throw new Error('Thiếu dữ liệu file');
  }

  // Validate file format
  if (!isSupportedFile(fileName)) {
    throw new Error(`Định dạng file không được hỗ trợ: ${path.extname(fileName)}`);
  }

  // Tạo thư mục
  let targetDir = STORAGE_PATH;
  if (folder) {
    targetDir = path.join(STORAGE_PATH, folder);
  }
  await fs.mkdir(targetDir, { recursive: true });

  // Tạo tên file unique
  const timestamp = Date.now();
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  const uniqueFileName = `${baseName}_${timestamp}${ext}`;

  const filePath = path.join(targetDir, uniqueFileName);

  // Lưu file
  const buffer = Buffer.from(fileBuffer, 'base64');
  await fs.writeFile(filePath, buffer);

  // Detect MIME type và file type
  const detectedMimeType = mimeType || mime.lookup(fileName) || 'application/octet-stream';
  const detectedFileType = getFileType(fileName);

  const fileSize = buffer.length;
  console.log(`✅ Đã lưu file: ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB) - Type: ${detectedFileType}`);

  // Tạo stream URL - Sử dụng HOST thay vì localhost để có thể access từ bên ngoài
  const relativePath = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;
  const streamUrl = `http://${HOST}:${PORT}/stream/${relativePath}`;

  return {
    filePath: filePath,
    streamUrl: streamUrl,
    storagePath: relativePath,
    fileSize: fileSize,
    mimeType: detectedMimeType,
    fileType: detectedFileType
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
 * Health check - Basic
 */
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    nodeId: nodeId,
    isConnected: isConnected,
    storage: STORAGE_PATH,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health
 * Health check - Detailed
 */
app.get('/health', async (req, res) => {
  try {
    const storageInfo = await getStorageInfo();

    res.json({
      status: 'healthy',
      node: {
        id: nodeId,
        port: PORT,
        host: HOST,
        connected_to_main_server: isConnected
      },
      storage: {
        path: STORAGE_PATH,
        used: storageInfo.used,
        total: storageInfo.total,
        available: storageInfo.available,
        usage_percent: storageInfo.total > 0 ? ((storageInfo.used / storageInfo.total) * 100).toFixed(2) : 0
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/info
 * Node information
 */
app.get('/api/info', async (req, res) => {
  try {
    const storageInfo = await getStorageInfo();

    res.json({
      success: true,
      data: {
        nodeId: nodeId,
        port: PORT,
        host: HOST,
        isConnected: isConnected,
        storage: {
          path: STORAGE_PATH,
          used: storageInfo.used,
          total: storageInfo.total,
          available: storageInfo.available
        },
        uptime: process.uptime(),
        version: '2.0.0'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /stream/:matchId/:fileName
 * Stream file với MIME type detection
 */
app.get('/stream/:matchId/:fileName', async (req, res) => {
  try {
    const { matchId, fileName } = req.params;
    const filePath = path.join(STORAGE_PATH, matchId, fileName);

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File không tồn tại' });
    }

    // Detect MIME type
    const mimeType = mime.lookup(filePath);

    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }

    // Set CORS headers để cho phép access từ browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // Set cache headers cho performance
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year

    // Hỗ trợ range requests cho video streaming
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      // Read file stream
      const fileStream = (await import('fs')).createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType || 'application/octet-stream'
      });

      fileStream.pipe(res);
    } else {
      // No range, send full file
      res.setHeader('Content-Length', fileSize);
      res.sendFile(filePath);
    }

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

  // Kiểm tra xem có cấu hình sẵn trong .env không
  const mainServerHost = process.env.MAIN_SERVER_HOST;
  const mainServerPort = process.env.MAIN_SERVER_PORT;
  const nodeName = process.env.NODE_NAME;

  if (mainServerHost && mainServerPort && nodeName) {
    // Tự động kết nối nếu có cấu hình
    console.log(`🔌 Tự động kết nối tới server chính...`);
    console.log(`   Host: ${mainServerHost}`);
    console.log(`   Port: ${mainServerPort}`);
    console.log(`   Name: ${nodeName}`);

    connectToMainServer(mainServerHost, mainServerPort, nodeName).catch(error => {
      console.error('❌ Không thể kết nối tới server chính:', error);
      console.log('💡 Thử kết nối lại sau 5 giây...');
      setTimeout(() => {
        connectToMainServer(mainServerHost, mainServerPort, nodeName).catch(err => {
          console.error('❌ Vẫn không thể kết nối:', err);
        });
      }, 5000);
    });
  } else {
    // Prompt user để nhập thông tin kết nối
    console.log('⚠️  Không tìm thấy cấu hình MAIN_SERVER_HOST, MAIN_SERVER_PORT, NODE_NAME trong .env');
    promptConnection();
  }
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

