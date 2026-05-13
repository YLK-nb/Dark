/**
 * ============================================================================
 * BlindInput - 盲人端键盘输入处理
 * ============================================================================
 *
 * 职责：
 * 1. 监听 WASD 键盘事件
 * 2. 维护按键状态（支持多键同时按下）
 * 3. 输出归一化的移动方向向量
 *
 * 设计要点：
 * - 对角线移动需要归一化，否则斜向速度会是正向的 √2 倍
 * - 只在按键按下时 preventDefault，避免阻止其他快捷键
 * - start()/stop() 可动态启停输入监听
 */
class BlindInput {
  constructor() {
    /** @type {Object.<string, boolean>} 当前按键状态 */
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
    };

    /** @type {boolean} 输入监听是否激活 */
    this.active = false;

    // 预绑定事件处理函数（方便 add/removeEventListener）
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  /** 开始监听键盘事件 */
  start() {
    this.active = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /** 停止监听键盘事件 */
  stop() {
    this.active = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  /**
   * 键盘按下事件处理
   * 只处理 WASD 四个键，其他键忽略
   */
  _onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (this.keys.hasOwnProperty(key)) {
      this.keys[key] = true;
      e.preventDefault(); // 阻止浏览器默认行为（如页面滚动）
    }
  }

  /**
   * 键盘抬起事件处理
   */
  _onKeyUp(e) {
    const key = e.key.toLowerCase();
    if (this.keys.hasOwnProperty(key)) {
      this.keys[key] = false;
    }
  }

  /**
   * 获取当前移动方向
   * 返回归一化的方向向量，对角线长度为 1
   *
   * @returns {{ dx: number, dy: number }}
   *   - dx: X 方向 (-1, 0, 1)，右为正
   *   - dy: Y 方向 (-1, 0, 1)，下为正
   */
  getDirection() {
    let dx = 0;
    let dy = 0;

    if (this.keys.w) dy -= 1; // 上
    if (this.keys.s) dy += 1; // 下
    if (this.keys.a) dx -= 1; // 左
    if (this.keys.d) dx += 1; // 右

    // 对角线归一化：使斜向速度与正向一致
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    return { dx, dy };
  }

  /**
   * 是否有任意移动键按下
   * @returns {boolean}
   */
  isMoving() {
    return this.keys.w || this.keys.a || this.keys.s || this.keys.d;
  }
}
