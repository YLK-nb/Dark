/**
 * ============================================================================
 * SoundManager - 音效管理接口
 * ============================================================================
 *
 * 职责：
 * 1. 提供所有游戏音效的播放接口
 * 2. 管理音量分轨控制（master / sfx / ambient / voice）
 * 3. 延迟初始化 AudioContext（浏览器要求用户交互后才能创建）
 *
 * 当前状态：
 *   Demo 阶段所有播放方法为空实现（静音）。
 *   后期只需：
 *     1. 调用 loadAudio() 加载音频文件
 *     2. 补全各 play* 方法中的实际播放逻辑（已用 TODO 标注）
 *
 * 扩展方式：
 *   SoundManager.loadAudio('footstep', 'assets/sounds/footstep.mp3');
 *   // 之后 playFootstep() 自动生效
 */
const SoundManager = {
  /** @type {AudioContext|null} 音频上下文，首次用户交互后创建 */
  ctx: null,

  /** 各频道音量 (0-1) */
  volumes: {
    master: 1.0,    // 主音量（影响所有）
    sfx: 0.8,       // 音效（脚步、撞墙等）
    ambient: 0.5,   // 环境音
    voice: 1.0,     // 语音通话音量
  },

  /**
   * 音频资源路径
   * 加载后值变为实际的 src 字符串，未加载时为 null
   * 播放方法会检查是否已加载，未加载则静音跳过
   */
  assets: {
    footstep: null,    // 脚步声
    wallHit: null,     // 撞墙声
    ambient: null,     // 环境音（循环）
    breathing: null,   // 呼吸声（循环）
  },

  /** @type {Object.<string, AudioBufferSourceNode>} 当前播放的循环音效 */
  _loops: {},

  /**
   * 初始化音频上下文
   * 必须在用户交互事件（click/keydown）中调用，否则浏览器会阻止
   */
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },

  /**
   * 设置指定频道的音量
   * @param {string} channel - 'master' | 'sfx' | 'ambient' | 'voice'
   * @param {number} vol - 音量值，会被 clamp 到 [0, 1]
   */
  setVolume(channel, vol) {
    if (this.volumes.hasOwnProperty(channel)) {
      this.volumes[channel] = Math.max(0, Math.min(1, vol));
    }
  },

  /**
   * 播放脚步声（单次触发）
   * @param {number} speed - 移动速度系数，影响音量/频率
   */
  playFootstep(speed = 1) {
    if (!this.assets.footstep) return; // 未加载时静音
    // TODO: 实际播放逻辑
    // const volume = this.volumes.master * this.volumes.sfx * (0.5 + speed * 0.5);
    // this._playOnce(this.assets.footstep, volume);
  },

  /**
   * 播放撞墙声（单次触发）
   */
  playWallHit() {
    if (!this.assets.wallHit) return;
    // TODO: 实际播放逻辑
    // const volume = this.volumes.master * this.volumes.sfx;
    // this._playOnce(this.assets.wallHit, volume);
  },

  /**
   * 播放环境音（循环）
   * 调用后持续播放，直到调用 stopAmbient()
   */
  playAmbient() {
    if (!this.assets.ambient || this._loops.ambient) return;
    // TODO: 实际循环播放逻辑
    // this._loops.ambient = this._playLoop(this.assets.ambient, this.volumes.master * this.volumes.ambient);
  },

  /**
   * 停止环境音
   */
  stopAmbient() {
    if (this._loops.ambient) {
      // this._loops.ambient.stop();
      this._loops.ambient = null;
    }
  },

  /**
   * 播放呼吸声（循环，盲人端使用）
   */
  playBreathing() {
    if (!this.assets.breathing || this._loops.breathing) return;
    // TODO: 实际循环播放逻辑
    // this._loops.breathing = this._playLoop(this.assets.breathing, this.volumes.master * this.volumes.sfx * 0.3);
  },

  /**
   * 停止所有音效
   */
  stopAll() {
    Object.values(this._loops).forEach(source => {
      if (source) source.stop();
    });
    this._loops = {};
  },

  /**
   * 加载音频资源
   * @param {string} key - assets 中的键名（如 'footstep'）
   * @param {string} src - 音频文件路径
   */
  async loadAudio(key, src) {
    // TODO: 实际加载逻辑（fetch + decodeAudioData）
    this.assets[key] = src;
  },
};
