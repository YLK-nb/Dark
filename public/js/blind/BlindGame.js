/**
 * ============================================================================
 * BlindGame - 盲人端主控
 * ============================================================================
 *
 * 职责：
 * 1. 初始化所有子模块（渲染器、输入、网络、语音）
 * 2. 注册网络事件回调
 * 3. 运行游戏主循环（输入 → 网络发送 → 渲染）
 *
 * 生命周期：
 *   init() → 连接服务器 → 加入房间 → 等待帮助者 → gameStart → 主循环运行中
 *
 * 数据流：
 *   BlindInput → [方向向量] → NetworkManager.sendMove()
 *   NetworkManager [playerUpdate] → BlindRenderer.render()
 *   NetworkManager [collision] → BlindRenderer.triggerHitFlash()
 */
class BlindGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new BlindRenderer(this.canvas);
    this.input = new BlindInput();
    this.network = new NetworkManager();
    this.voiceChat = null;

    /** @type {{x: number, y: number}} 玩家当前位置（由服务端权威更新） */
    this.playerPos = { x: 0, y: 0 };

    /** @type {boolean} 游戏是否已开始（收到 gameStart 事件） */
    this.gameStarted = false;

    /** @type {boolean} 游戏是否正在运行 */
    this.running = false;

    this.voiceStatusEl = document.getElementById('voiceStatus');
  }

  /**
   * 初始化游戏
   * 按顺序：音效系统 → 网络事件 → 语音 → 键盘输入 → 渲染循环
   */
  async init() {
    // 初始化音效系统（需要用户交互后才能实际播放）
    SoundManager.init();

    // ── 注册网络事件回调 ──

    this.network.on('connected', () => {
      // 连接成功后自动以盲人身份加入游戏
      this.network.joinGame(CONSTANTS.ROLES.BLIND);
    });

    this.network.on('joined', ({ roomId }) => {
      console.log('[盲人端] 已加入房间:', roomId);
      this._updateStatus('等待帮助者加入...');
    });

    this.network.on('playerJoined', () => {
      this._updateStatus('帮助者已加入，游戏准备中...');
    });

    this.network.on('gameStart', (data) => {
      this._onGameStart(data);
    });

    // 服务端广播的位置更新
    this.network.on('playerUpdate', (data) => {
      this.playerPos.x = data.x;
      this.playerPos.y = data.y;
    });

    // 撞墙事件：触发视觉闪烁 + 撞墙音效
    this.network.on('collision', () => {
      this.renderer.triggerHitFlash();
      SoundManager.playWallHit();
    });

    this.network.on('playerLeft', () => {
      this._updateStatus('帮助者已离开');
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

    // ── 开始键盘输入监听 ──
    this.input.start();

    // ── 开始渲染循环 ──
    this._gameLoop();
  }

  /**
   * 游戏开始回调
   * 收到服务端 gameStart 事件后调用
   *
   * @param {Object} data - 服务端下发的数据
   * @param {{x: number, y: number}} data.startPos - 起始位置
   */
  _onGameStart(data) {
    this.gameStarted = true;
    this.running = true;
    this.playerPos = { ...data.startPos };
    this._hideStatus();

    // 加入语音频道
    this.voiceChat.joinVoice();
  }

  /**
   * 游戏主循环
   * 每帧执行：
   *   1. 读取输入方向
   *   2. 发送移动意图到服务端
   *   3. 渲染当前帧
   */
  _gameLoop() {
    if (this.running && this.gameStarted) {
      const dir = this.input.getDirection();
      if (dir.dx !== 0 || dir.dy !== 0) {
        this.network.sendMove(dir.dx, dir.dy);
        SoundManager.playFootstep(1);
      }
    }

    // 渲染（始终执行，保持光晕动画）
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
const game = new BlindGame();
game.init();
