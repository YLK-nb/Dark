/**
 * ============================================================================
 * NetworkManager - Socket.IO 客户端封装
 * ============================================================================
 *
 * 职责：
 * 1. 建立和管理 Socket.IO 连接
 * 2. 将 Socket.IO 原生事件转换为自定义事件系统（on/emit 模式）
 * 3. 提供语义化的发送方法（joinGame, sendMove 等）
 *
 * 使用方式：
 *   const network = new NetworkManager();
 *   network.on('gameStart', (data) => { ... });
 *   network.connect();
 *   network.joinGame('blind');
 *
 * 事件列表参见 README.md 的 "Socket.IO 事件一览" 章节
 */
class NetworkManager {
  constructor() {
    /** @type {import('socket.io-client').Socket|null} Socket.IO 实例 */
    this.socket = null;

    /** @type {Object.<string, Function[]>} 自定义事件回调映射 */
    this.callbacks = {};
  }

  /**
   * 连接到游戏服务器
   * 连接成功后自动触发 'connected' 回调
   *
   * 内部会注册所有 Socket.IO 事件的监听器，
   * 将它们转发到自定义事件系统中
   */
  connect() {
    this.socket = io();

    // ── 连接状态事件 ──
    this.socket.on('connect', () => {
      console.log('[网络] 已连接:', this.socket.id);
      this._emit('connected', { id: this.socket.id });
    });

    this.socket.on('disconnect', () => {
      console.log('[网络] 已断开');
      this._emit('disconnected');
    });

    // ── 游戏事件转发 ──
    this.socket.on('joined', (data) => this._emit('joined', data));
    this.socket.on('playerJoined', (data) => this._emit('playerJoined', data));
    this.socket.on('playerLeft', (data) => this._emit('playerLeft', data));
    this.socket.on('gameStart', (data) => this._emit('gameStart', data));
    this.socket.on('playerUpdate', (data) => this._emit('playerUpdate', data));
    this.socket.on('collision', (data) => this._emit('collision', data));

    // ── WebRTC 信令事件转发 ──
    this.socket.on('voicePeerReady', (data) => this._emit('voicePeerReady', data));
    this.socket.on('createOffer', (data) => this._emit('createOffer', data));
    this.socket.on('rtcOffer', (data) => this._emit('rtcOffer', data));
    this.socket.on('rtcAnswer', (data) => this._emit('rtcAnswer', data));
    this.socket.on('rtcIceCandidate', (data) => this._emit('rtcIceCandidate', data));
  }

  /**
   * 注册自定义事件回调
   * 同一事件可注册多个回调，按注册顺序依次执行
   *
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  /**
   * 请求加入游戏
   * 服务端会将玩家分配到房间，完成后触发 'joined' 回调
   *
   * @param {string} role - 'blind' 或 'helper'
   */
  joinGame(role) {
    this.socket.emit('joinGame', { role });
  }

  /**
   * 发送移动输入（仅盲人端使用）
   * 服务端会做碰撞检测后更新权威位置
   *
   * @param {number} dx - X 方向 (-1 到 1)
   * @param {number} dy - Y 方向 (-1 到 1)
   */
  sendMove(dx, dy) {
    this.socket.emit('move', { dx, dy });
  }

  // ──────────────────────────────────────────────
  // WebRTC 信令发送方法
  // 服务端只做中转，不解析内容
  // ──────────────────────────────────────────────

  /** 发送 SDP Offer */
  sendRtcOffer(offer, targetId) {
    this.socket.emit('rtcOffer', { offer, targetId });
  }

  /** 发送 SDP Answer */
  sendRtcAnswer(answer, targetId) {
    this.socket.emit('rtcAnswer', { answer, targetId });
  }

  /** 发送 ICE Candidate */
  sendRtcIceCandidate(candidate, targetId) {
    this.socket.emit('rtcIceCandidate', { candidate, targetId });
  }

  /**
   * 通知服务端语音模块已就绪
   * 服务端收到后会协调双方建立 WebRTC 连接
   */
  voiceReady() {
    this.socket.emit('voiceReady');
  }

  /**
   * 获取当前 socket ID
   * @returns {string|null}
   */
  getSocketId() {
    return this.socket ? this.socket.id : null;
  }

  /**
   * 内部：触发自定义事件的所有回调
   * @param {string} event - 事件名
   * @param {*} data - 事件数据
   */
  _emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }
}
