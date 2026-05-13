/**
 * ============================================================================
 * DARK 游戏服务端入口
 * ============================================================================
 *
 * 职责：
 * 1. Express 静态文件服务 & 页面路由
 * 2. Socket.IO 连接管理、房间配对、游戏事件中转
 * 3. WebRTC 信令转发（offer / answer / ice-candidate）
 *
 * 数据流：
 *   盲人客户端 --[move]--> 服务端 --[playerUpdate/collision]--> 双方客户端
 *   帮助者客户端 --[rtc*]--> 服务端 --[rtc*]--> 盲人客户端
 *
 * 服务端是游戏状态的权威来源，客户端只负责渲染。
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./src/game/GameRoom');
const GameConfig = require('./src/config/GameConfig');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// ──────────────────────────────────────────────
// 静态文件 & 页面路由
// ──────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/blind', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blind.html'));
});
app.get('/helper', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'helper.html'));
});

// ──────────────────────────────────────────────
// 房间管理
// ──────────────────────────────────────────────

/** @type {Map<string, GameRoom>} 所有活跃房间 */
const rooms = new Map();

/** @type {GameRoom|null} 当前等待配对的房间（只有一个盲人等待时存在） */
let waitingRoom = null;

/**
 * 获取或创建房间
 * @param {string} roomId
 * @returns {GameRoom}
 */
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new GameRoom(roomId));
  }
  return rooms.get(roomId);
}

// ──────────────────────────────────────────────
// Socket.IO 事件处理
// ──────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);

  /**
   * 加入游戏
   * 客户端连接后发送 { role: 'blind' | 'helper' }
   * 服务端将玩家分配到等待中的房间或创建新房间
   */
  socket.on('joinGame', ({ role }) => {
    let room;

    // 如果有等待中的房间且未满员，加入；否则创建新房间
    if (waitingRoom && Object.keys(waitingRoom.players).length < GameConfig.room.maxPlayers) {
      room = waitingRoom;
    } else {
      const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      room = getOrCreateRoom(roomId);
      waitingRoom = room;
    }

    room.addPlayer(socket, role);

    // 在 socket 上挂载房间和角色信息，方便后续事件使用
    socket.gameRoomId = room.id;
    socket.gameRole = role;

    console.log(`[加入] ${socket.id} 以 ${role} 身份加入房间 ${room.id}`);

    // 通知加入者和房间内其他玩家
    socket.emit('joined', { roomId: room.id, role });
    socket.to(room.id).emit('playerJoined', { role });

    // 房间满员后清除等待状态
    if (Object.keys(room.players).length >= GameConfig.room.maxPlayers) {
      if (waitingRoom === room) waitingRoom = null;
    }
  });

  /**
   * 移动输入（仅盲人端发送）
   * 数据格式: { dx: number, dy: number } - 归一化方向向量
   * 服务端在此处做碰撞检测和位置修正，不依赖客户端的位置数据
   */
  socket.on('move', (input) => {
    const room = rooms.get(socket.gameRoomId);
    if (room) {
      room.handleMove(socket.id, input);
    }
  });

  // ──────────────────────────────────────────────
  // WebRTC 信令转发
  // 服务端只做中转，不解析 SDP 内容
  // ──────────────────────────────────────────────

  /** SDP Offer 转发 */
  socket.on('rtcOffer', ({ offer, targetId }) => {
    io.to(targetId).emit('rtcOffer', { offer, senderId: socket.id });
  });

  /** SDP Answer 转发 */
  socket.on('rtcAnswer', ({ answer, targetId }) => {
    io.to(targetId).emit('rtcAnswer', { answer, senderId: socket.id });
  });

  /** ICE Candidate 转发 */
  socket.on('rtcIceCandidate', ({ candidate, targetId }) => {
    io.to(targetId).emit('rtcIceCandidate', { candidate, senderId: socket.id });
  });

  /**
   * 语音就绪
   * 当一方准备好麦克风后通知服务端，服务端协调双方建立 WebRTC 连接
   * 帮助者端作为发起方（创建 Offer），盲人端作为接收方
   */
  socket.on('voiceReady', () => {
    const room = rooms.get(socket.gameRoomId);
    if (!room) return;

    // 通知对端
    socket.to(room.id).emit('voicePeerReady', { peerId: socket.id });

    // 帮助者端主动发起 Offer
    if (socket.gameRole === GameConfig.room.roles.HELPER) {
      const peers = room.getPlayers().filter(p => p.id !== socket.id);
      if (peers.length > 0) {
        socket.emit('createOffer', { targetId: peers[0].id });
      }
    }
  });

  /**
   * 断开连接
   * 清理房间中的玩家，通知对端，空房间自动销毁
   */
  socket.on('disconnect', () => {
    console.log(`[断开] ${socket.id}`);

    const room = rooms.get(socket.gameRoomId);
    if (room) {
      room.removePlayer(socket.id);
      socket.to(room.id).emit('playerLeft', { role: socket.gameRole });

      // 空房间清理
      if (Object.keys(room.players).length === 0) {
        rooms.delete(room.id);
        if (waitingRoom === room) waitingRoom = null;
      }
    }
  });
});

// ──────────────────────────────────────────────
// 启动服务器
// ──────────────────────────────────────────────

const PORT = GameConfig.server.port;
server.listen(PORT, () => {
  console.log(`\n  🎮 Dark 游戏服务器已启动`);
  console.log(`  📍 http://localhost:${PORT}`);
  console.log(`  📍 盲人端: http://localhost:${PORT}/blind`);
  console.log(`  📍 帮助者端: http://localhost:${PORT}/helper\n`);
});
