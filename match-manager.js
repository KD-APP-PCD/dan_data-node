/**
 * Match Manager for Data Node
 * Quản lý match.json và media files
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export class MatchManager {
  constructor(storagePath, port, host = 'localhost') {
    this.storagePath = storagePath;
    this.port = port;
    this.host = host;

    // Queue để xử lý concurrent writes
    // Key: matchId, Value: Promise chain
    this.writeQueues = new Map();
  }

  /**
   * Thực thi operation với queue để tránh race condition
   * @param {string} matchId - ID của match
   * @param {Function} operation - Async function cần thực thi
   * @returns {Promise} - Kết quả của operation
   */
  async queueOperation(matchId, operation) {
    // Lấy queue hiện tại cho matchId này
    const currentQueue = this.writeQueues.get(matchId) || Promise.resolve();

    // Tạo promise mới chain vào queue
    const newQueue = currentQueue
      .then(() => operation())
      .catch((error) => {
        // Log error nhưng không break chain
        console.error(`❌ Error in queued operation for ${matchId}:`, error);
        throw error;
      });

    // Lưu queue mới
    this.writeQueues.set(matchId, newQueue);

    // Cleanup queue sau khi hoàn thành
    newQueue.finally(() => {
      if (this.writeQueues.get(matchId) === newQueue) {
        this.writeQueues.delete(matchId);
      }
    });

    return newQueue;
  }

  /**
   * Tạo trận đấu mới
   */
  async createMatch(matchData) {
    const { matchId, name, code, dataNodeId, dataNodeName, createdBy } = matchData;
    
    const matchFolder = path.join(this.storagePath, matchId);
    
    // Tạo folder
    await fs.mkdir(matchFolder, { recursive: true });
    
    // Tạo match.json template
    const matchJson = {
      match: {
        id: matchId,
        code: code,
        name: name,
        created_at: new Date().toISOString(),
        status: 'draft',
        max_players: 4,
        data_node_id: dataNodeId,
        data_node_name: dataNodeName
      },
      sections: {
        khoi_dong_rieng: {
          title: 'Khởi Động Riêng',
          total_questions: 24,
          questions_per_player: 6,
          time_limit_per_question: 10,
          points_per_question: 10,
          players: []
        },
        khoi_dong_chung: {
          title: 'Khởi Động Chung',
          total_questions: 12,
          wait_time: 3,
          questions: []
        },
        vcnv: {
          title: 'Vượt Chướng Ngại Vật',
          total_questions: 6,
          questions: []
        },
        tang_toc: {
          title: 'Tăng Tốc',
          total_questions: 4,
          questions: []
        },
        ve_dich: {
          title: 'Về Đích',
          total_questions: 12,
          questions_per_player: 3,
          players: []
        }
      },
      statistics: {
        total_questions: 0,
        total_media_files: 0,
        total_size_bytes: 0,
        created_by: createdBy || 'admin',
        last_updated: new Date().toISOString()
      }
    };
    
    await this.saveMatchJson(matchId, matchJson);
    
    console.log(`✅ Đã tạo trận đấu: ${matchId}`);
    
    return matchJson;
  }

  /**
   * Kiểm tra trận đấu có tồn tại không
   */
  async matchExists(matchId) {
    const jsonPath = path.join(this.storagePath, matchId, 'match.json');
    return existsSync(jsonPath);
  }

  /**
   * Đọc match.json
   */
  async getMatch(matchId) {
    const jsonPath = path.join(this.storagePath, matchId, 'match.json');
    
    if (!existsSync(jsonPath)) {
      throw new Error(`Trận đấu không tồn tại: ${matchId}`);
    }
    
    const content = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Lưu match.json
   */
  async saveMatchJson(matchId, matchData) {
    const jsonPath = path.join(this.storagePath, matchId, 'match.json');
    await fs.writeFile(jsonPath, JSON.stringify(matchData, null, 2), 'utf-8');
  }

  /**
   * Thêm câu hỏi vào match.json
   * SỬ DỤNG QUEUE để tránh race condition khi concurrent writes
   */
  async addQuestion(matchId, questionData) {
    return this.queueOperation(matchId, async () => {
      console.log(`🔒 [QUEUE] Acquiring lock for addQuestion: ${matchId}`);

      const match = await this.getMatch(matchId);

      const {
        section,
        playerIndex,
        order,
        type,
        questionText,
        mediaFile,
        mediaSize,
        answer,
        points,
        timeLimit
      } = questionData;

      // Tạo question object
      const question = {
        order: parseInt(order),
        type: type,
        question_text: questionText || null,
        answer: answer,
        points: points || 10,
        time_limit: timeLimit || null
      };

      // Nếu có media file
      if (mediaFile) {
        question.media_file = mediaFile;
        question.media_url = this.generateStreamUrl(matchId, mediaFile);
        question.media_size = mediaSize || 0;
      }

      // Thêm vào section tương ứng
      if (section === 'khoi_dong_rieng' || section === 've_dich') {
        // Sections có player_index
        const playerIdx = parseInt(playerIndex);
        let player = match.sections[section].players.find(p => p.player_index === playerIdx);

        if (!player) {
          player = {
            player_index: playerIdx,
            questions: []
          };
          match.sections[section].players.push(player);
          // Sort players by index
          match.sections[section].players.sort((a, b) => a.player_index - b.player_index);
        }

        player.questions.push(question);
        // Sort questions by order
        player.questions.sort((a, b) => a.order - b.order);

      } else {
        // Sections không có player_index
        match.sections[section].questions.push(question);
        // Sort questions by order
        match.sections[section].questions.sort((a, b) => a.order - b.order);
      }

      // Cập nhật statistics
      match.statistics.total_questions++;
      if (mediaFile) {
        match.statistics.total_media_files++;
        match.statistics.total_size_bytes += (mediaSize || 0);
      }
      match.statistics.last_updated = new Date().toISOString();

      await this.saveMatchJson(matchId, match);

      console.log(`✅ [QUEUE] Đã thêm câu hỏi vào ${matchId}/${section}`);
      console.log(`🔓 [QUEUE] Released lock for addQuestion: ${matchId}`);

      return question;
    });
  }

  /**
   * Xóa câu hỏi
   * SỬ DỤNG QUEUE để tránh race condition
   */
  async deleteQuestion(matchId, section, playerIndex, order) {
    return this.queueOperation(matchId, async () => {
      console.log(`🔒 [QUEUE] Acquiring lock for deleteQuestion: ${matchId}`);
      console.log(`   Params:`, { section, playerIndex, order });

      const match = await this.getMatch(matchId);

      if (section === 'khoi_dong_rieng' || section === 've_dich') {
        // Tìm player theo player_index (có thể là null)
        let player;
        if (playerIndex === null || playerIndex === undefined) {
          // Tìm player đầu tiên có player_index === null
          player = match.sections[section].players.find(p => p.player_index === null);
        } else {
          // Tìm player theo player_index cụ thể
          player = match.sections[section].players.find(p => p.player_index === parseInt(playerIndex));
        }

        if (player) {
          const questionIndex = player.questions.findIndex(q => q.order === parseInt(order));
          if (questionIndex !== -1) {
            const question = player.questions[questionIndex];

            // Xóa media file nếu có
            if (question.media_file) {
              await this.deleteMediaFile(matchId, question.media_file);
              match.statistics.total_media_files--;
              match.statistics.total_size_bytes -= (question.media_size || 0);
            }

            player.questions.splice(questionIndex, 1);
            match.statistics.total_questions--;
            console.log(`   ✅ Đã xóa câu hỏi order=${order} từ player_index=${playerIndex}`);
          } else {
            console.log(`   ⚠️  Không tìm thấy câu hỏi order=${order}`);
          }
        } else {
          console.log(`   ⚠️  Không tìm thấy player với player_index=${playerIndex}`);
        }
      } else {
        const questionIndex = match.sections[section].questions.findIndex(q => q.order === parseInt(order));
        if (questionIndex !== -1) {
          const question = match.sections[section].questions[questionIndex];

          // Xóa media file nếu có
          if (question.media_file) {
            await this.deleteMediaFile(matchId, question.media_file);
            match.statistics.total_media_files--;
            match.statistics.total_size_bytes -= (question.media_size || 0);
          }

          match.sections[section].questions.splice(questionIndex, 1);
          match.statistics.total_questions--;
        }
      }

      match.statistics.last_updated = new Date().toISOString();
      await this.saveMatchJson(matchId, match);

      console.log(`✅ [QUEUE] Đã xóa câu hỏi từ ${matchId}/${section}`);
      console.log(`🔓 [QUEUE] Released lock for deleteQuestion: ${matchId}`);
    });
  }

  /**
   * Gán câu hỏi cho thí sinh khác
   * SỬ DỤNG QUEUE để tránh race condition
   */
  async assignQuestionToPlayer(matchId, section, currentPlayerIndex, questionOrder, newPlayerIndex) {
    return this.queueOperation(matchId, async () => {
      console.log(`🔒 [QUEUE] Acquiring lock for assignQuestionToPlayer: ${matchId}`);
      console.log(`   Params:`, { section, currentPlayerIndex, questionOrder, newPlayerIndex });

      const match = await this.getMatch(matchId);

      if (section !== 'khoi_dong_rieng' && section !== 've_dich') {
        throw new Error('Chỉ có thể gán thí sinh cho Khởi Động Riêng và Về Đích');
      }

      // Tìm player hiện tại
      let currentPlayer;
      if (currentPlayerIndex === null || currentPlayerIndex === undefined) {
        currentPlayer = match.sections[section].players.find(p => p.player_index === null);
      } else {
        currentPlayer = match.sections[section].players.find(p => p.player_index === parseInt(currentPlayerIndex));
      }

      if (!currentPlayer) {
        throw new Error(`Không tìm thấy player hiện tại với player_index=${currentPlayerIndex}`);
      }

      // Tìm câu hỏi
      const questionIndex = currentPlayer.questions.findIndex(q => q.order === parseInt(questionOrder));
      if (questionIndex === -1) {
        throw new Error(`Không tìm thấy câu hỏi order=${questionOrder}`);
      }

      const question = currentPlayer.questions[questionIndex];

      // Xóa câu hỏi khỏi player hiện tại
      currentPlayer.questions.splice(questionIndex, 1);

      // Tìm hoặc tạo player mới
      let newPlayer = match.sections[section].players.find(p => p.player_index === parseInt(newPlayerIndex));
      if (!newPlayer) {
        newPlayer = {
          player_index: parseInt(newPlayerIndex),
          questions: []
        };
        match.sections[section].players.push(newPlayer);
        match.sections[section].players.sort((a, b) => a.player_index - b.player_index);
      }

      // Thêm câu hỏi vào player mới
      newPlayer.questions.push(question);
      newPlayer.questions.sort((a, b) => a.order - b.order);

      // Cập nhật last_updated
      match.statistics.last_updated = new Date().toISOString();
      await this.saveMatchJson(matchId, match);

      console.log(`✅ [QUEUE] Đã gán câu hỏi order=${questionOrder} từ player ${currentPlayerIndex} sang player ${newPlayerIndex}`);
      console.log(`🔓 [QUEUE] Released lock for assignQuestionToPlayer: ${matchId}`);

      return question;
    });
  }

  /**
   * Xóa media file
   */
  async deleteMediaFile(matchId, fileName) {
    const filePath = path.join(this.storagePath, matchId, fileName);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
      console.log(`🗑️  Đã xóa file: ${fileName}`);
    }
  }

  /**
   * Xóa toàn bộ trận đấu
   */
  async deleteMatch(matchId) {
    const matchFolder = path.join(this.storagePath, matchId);
    
    if (existsSync(matchFolder)) {
      await fs.rm(matchFolder, { recursive: true, force: true });
      console.log(`🗑️  Đã xóa trận đấu: ${matchId}`);
      return true;
    }
    
    return false;
  }

  /**
   * Lấy danh sách tất cả trận đấu
   */
  async getAllMatches() {
    const folders = await fs.readdir(this.storagePath, { withFileTypes: true });
    const matches = [];
    
    for (const folder of folders) {
      if (folder.isDirectory()) {
        const jsonPath = path.join(this.storagePath, folder.name, 'match.json');
        if (existsSync(jsonPath)) {
          try {
            const match = await this.getMatch(folder.name);
            matches.push({
              id: match.match.id,
              code: match.match.code,
              name: match.match.name,
              status: match.match.status,
              created_at: match.match.created_at,
              total_questions: match.statistics.total_questions,
              total_media_files: match.statistics.total_media_files,
              total_size_bytes: match.statistics.total_size_bytes
            });
          } catch (error) {
            console.error(`❌ Lỗi đọc match ${folder.name}:`, error.message);
          }
        }
      }
    }
    
    return matches;
  }

  /**
   * Generate stream URL
   */
  generateStreamUrl(matchId, fileName) {
    return `http://${this.host}:${this.port}/stream/${matchId}/${fileName}`;
  }

  /**
   * Cập nhật trạng thái trận đấu
   * SỬ DỤNG QUEUE để tránh race condition
   */
  async updateMatchStatus(matchId, status) {
    return this.queueOperation(matchId, async () => {
      console.log(`🔒 [QUEUE] Acquiring lock for updateMatchStatus: ${matchId}`);

      const match = await this.getMatch(matchId);
      match.match.status = status;
      match.statistics.last_updated = new Date().toISOString();
      await this.saveMatchJson(matchId, match);

      console.log(`✅ [QUEUE] Đã cập nhật status ${matchId}: ${status}`);
      console.log(`🔓 [QUEUE] Released lock for updateMatchStatus: ${matchId}`);
    });
  }
}

