/**
 * ============================================================================
 * HelperGame - 帮助者端主控
 * ============================================================================
 *
 * 职责：
 * 1. 初始化所有子模块（渲染器、网络、语音）
 * 2. 注册网络事件回调
 * 3. 运行渲染循环（帮助者端无输入，只渲染）
 *
 * 与 BlindGame 的区别：
 * - 没有输入模块（帮助者无法操控角色）
 * - 收到 collision 事件时播放受伤视觉效果（抖动 + 泛红）
 * - 需要接收地图数据（gameStart 事件中的 map 字段）
 *
 * 数据流：
 *   NetworkManager [gameStart] → HelperRenderer.setMap()
 *   NetworkManager [playerUpdate] → HelperRenderer.render()
 *   NetworkManager [collision] → HelperRenderer.triggerHurt()
 */
class HelperGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new HelperRenderer(this.canvas);
    this.network = new NetworkManager();
    this.voiceChat = null;

    /** @type {{x: number, y: number}} 盲人当前位置（由服务端权威更新） */
    this.playerPos = { x: 0, y: 0 };

    /** @type {boolean} 游戏是否已开始 */
    this.gameStarted = false;

    /** @type {boolean} 游戏是否正在运行 */
    this.running = false;

    this.voiceStatusEl = document.getElementById('voiceStatus');
  }

  /**
   * 初始化游戏
   * 按顺序：网络事件 → 语音 → 渲染循环
   */
  async init() {
    // ── 注册网络事件回调 ──

    this.network.on('connected', () => {
      // 连接成功后自动以帮助者身份加入游戏
      this.network.joinGame(CONSTANTS.ROLES.HELPER);
    });

    this.network.on('joined', ({ roomId }) => {
      console.log('[帮助者端] 已加入房间:', roomId);
      this._updateStatus('等待盲人加入...');
    });

    this.network.on('playerJoined', () => {
      this._updateStatus('盲人已加入，游戏准备中...');
    });

    this.network.on('gameStart', (data) => {
      this._onGameStart(data);
    });

    // 服务端广播的位置更新
    this.network.on('playerUpdate', (data) => {
      this.playerPos.x = data.x;
      this.playerPos.y = data.y;
    });

    // 撞墙事件：触发受伤视觉效果 + 撞墙音效
    this.network.on('collision', (data) => {
      this.renderer.triggerHurt();
      SoundManager.playWallHit();
    });

    this.network.on('playerLeft', () => {
      this._updateStatus('盲人已离开');
      this.running = false;
    });

    // ── 连接服务器 ──
    this.network.connect();

    // ── 初始化语音 ──
    this.voiceChat = new VoiceChat(this.network);
    this.voiceChat.onStatusChange = (status) => {
      this._updateVoiceStatus(status);
    };

    // 用户点击页面后初始化麦克风（浏览器要求用户交互）
    document.addEventListener('click', async () => {
      if (!this.voiceChat.localStream) {
        await this.voiceChat.joinVoice();
      }
    }, { once: true });

    // ── 开始渲染循环 ──
    this._gameLoop();
  }

  /**
   * 游戏开始回调
   * 收到服务端 gameStart 事件后调用
   *
   * @param {Object} data - 服务端下发的数据
   * @param {Object} data.map - 地图数据 { grid, width, height, tileSize }
   * @param {{x: number, y: number}} data.startPos - 起始位置
   */
  _onGameStart(data) {
    this.gameStarted = true;
    this.running = true;
    this.playerPos = { ...data.startPos };

    // 将地图数据传给渲染器（触发离屏预渲染）
    this.renderer.setMap(data.map);

    this._hideStatus();

    // 加入语音频道
    this.voiceChat.joinVoice();
  }

  /**
   * 渲染循环
   * 帮助者端没有输入，只需持续渲染
   */
  _gameLoop() {
    this.renderer.render(this.playerPos.x, this.playerPos.y);
    requestAnimationFrame(() => this._gameLoop());
  }

  /** 更新状态文字 */
  _updateStatus(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
  }

  /** 隐藏状态文字（游戏开始后调用） */
  _hideStatus() {
    const el = document.getElementById('status');
    if (el) el.style.display = 'none';
  }

  /**
   * 更新语音状态显示
   * @param {string} status - 状态标识符
   */
  _updateVoiceStatus(status) {
    const statusMap = {
      'mic-ready': '麦克风就绪',
      'mic-error': '麦克风权限被拒绝',
      'waiting': '等待语音连接...',
      'calling': '正在连接语音...',
      'connected': '语音已连接',
      'disconnected': '语音已断开',
      'closed': '语音已关闭',
    };
    if (this.voiceStatusEl) {
      this.voiceStatusEl.textContent = statusMap[status] || status;
      this.voiceStatusEl.className = `voice-status ${status}`;
    }
  }
}

// ── 启动 ──
const game = new HelperGame();
game.init();
