/**
 * ============================================================================
 * GameRoom - 游戏房间管理
 * ============================================================================
 *
 * 每个房间对应一局游戏，包含：
 * - 两个玩家（盲人 + 帮助者）
 * - 一份地图数据
 * - 盲人的权威位置
 *
 * 生命周期：
 *   创建 → 等待玩家 → 两人到齐 → 生成地图、开始游戏 → 玩家离开 → 房间销毁
 *
 * 服务端权威模型：
 *   - 盲人发送移动意图 { dx, dy }，服务端计算新位置并做碰撞检测
 *   - 服务端以 ~30fps 广播权威位置给双方客户端
 *   - 碰撞事件由服务端判定后广播，帮助者端播放受伤视觉效果
 */

const MapGenerator = require('./MapGenerator');
const Physics = require('./Physics');
const GameConfig = require('../config/GameConfig');

class GameRoom {
  /**
   * @param {string} id - 房间唯一标识
   */
  constructor(id) {
    this.id = id;

    /** @type {Object.<string, {role: string, socket: import('socket.io').Socket}>} 玩家映射 */
    this.players = {};

    /** @type {Object|null} 地图数据（由 MapGenerator 生成） */
    this.mapData = null;

    /** @type {{x: number, y: number}} 盲人的权威像素坐标 */
    this.playerPos = { x: 0, y: 0 };

    /** @type {number} 上次碰撞事件的时间戳（用于防抖） */
    this.lastCollision = 0;

    /** @type {boolean} 游戏是否正在运行 */
    this.running = false;
  }

  /**
   * 添加玩家到房间
   * 当两个玩家都加入后自动开始游戏
   *
   * @param {import('socket.io').Socket} socket
   * @param {string} role - 'blind' 或 'helper'
   */
  addPlayer(socket, role) {
    this.players[socket.id] = { role, socket };
    socket.join(this.id);  // 加入 Socket.IO 房间（用于广播）

    // 两人到齐，开始游戏
    if (Object.keys(this.players).length === GameConfig.room.maxPlayers) {
      this.startGame();
    }
  }

  /**
   * 从房间移除玩家
   * @param {string} socketId
   */
  removePlayer(socketId) {
    delete this.players[socketId];
    if (Object.keys(this.players).length === 0) {
      this.running = false;
    }
  }

  /**
   * 开始游戏
   * 生成地图，设置起始位置，广播 gameStart 事件，启动同步循环
   */
  startGame() {
    // 生成新地图
    this.mapData = MapGenerator.generate();
    this.playerPos = { ...this.mapData.startPos };
    this.running = true;

    // 向所有玩家广播游戏开始事件（包含完整地图数据）
    this.broadcast('gameStart', {
      map: {
        grid: this.mapData.grid,
        width: this.mapData.width,
        height: this.mapData.height,
        tileSize: this.mapData.tileSize,
      },
      startPos: this.mapData.startPos,
    });

    // 启动位置同步循环
    this.syncLoop();
  }

  /**
   * 处理盲人的移动输入
   *
   * 流程：
   *   1. 验证发送者是否为盲人角色
   *   2. 根据方向向量计算新位置
   *   3. 调用 Physics 做碰撞检测和位置修正
   *   4. 如果撞墙，广播碰撞事件（带 200ms 防抖）
   *
   * @param {string} socketId - 发送者的 socket ID
   * @param {{dx: number, dy: number}} input - 归一化方向向量
   */
  handleMove(socketId, input) {
    if (!this.running) return;

    // 只接受盲人角色的输入
    const player = this.players[socketId];
    if (!player || player.role !== GameConfig.room.roles.BLIND) return;

    // 计算新位置（当前位置 + 方向 * 速度）
    const speed = GameConfig.player.speed;
    let newX = this.playerPos.x + input.dx * speed;
    let newY = this.playerPos.y + input.dy * speed;

    // 碰撞检测与位置修正
    const resolved = Physics.resolveCollision(
      newX, newY,
      this.mapData.grid,
      this.mapData.tileSize
    );

    // 更新权威位置
    this.playerPos.x = resolved.x;
    this.playerPos.y = resolved.y;

    // 撞墙事件广播（200ms 防抖，避免碰撞抖动过于频繁）
    if (resolved.hitWall) {
      const now = Date.now();
      if (now - this.lastCollision > 200) {
        this.lastCollision = now;
        this.broadcast('collision', {
          x: this.playerPos.x,
          y: this.playerPos.y,
          timestamp: now,
        });
      }
    }
  }

  /**
   * 位置同步循环
   * 以 syncInterval 毫秒间隔向所有玩家广播盲人的当前位置
   * 使用 setTimeout 而非 setInterval，方便在游戏结束时停止
   */
  syncLoop() {
    if (!this.running) return;

    this.broadcast('playerUpdate', {
      x: this.playerPos.x,
      y: this.playerPos.y,
    });

    setTimeout(() => this.syncLoop(), GameConfig.syncInterval);
  }

  /**
   * 向房间内所有玩家广播事件
   * @param {string} event - 事件名
   * @param {*} data - 事件数据
   */
  broadcast(event, data) {
    for (const { socket } of Object.values(this.players)) {
      socket.emit(event, data);
    }
  }

  /**
   * 获取房间内玩家列表
   * @returns {{id: string, role: string}[]}
   */
  getPlayers() {
    return Object.entries(this.players).map(([id, p]) => ({
      id,
      role: p.role,
    }));
  }
}

module.exports = GameRoom;
