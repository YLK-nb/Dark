/**
 * ============================================================================
 * HelperRenderer - 帮助者端渲染器
 * ============================================================================
 *
 * 视觉效果（从下到上）：
 *   1. 暗色背景 (#050505)
 *   2. 俯视地图（MapRenderer 离屏缓存）
 *   3. 呼吸白色光点（盲人角色，正弦呼吸动画 + 外发光）
 *   4. 受伤叠加层（撞墙时全屏红色半透明，淡入→保持→淡出）
 *   5. 画面抖动（撞墙时随机偏移，强度随时间衰减）
 *
 * 相机系统：
 * - 始终跟随盲人角色居中
 * - 限制不超出地图边界
 * - 地图小于视口时居中显示
 *
 * 所有视觉参数通过 AssetLoader 读取，可运行时调整。
 */
class HelperRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - 游戏画布
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;

    /** @type {MapRenderer} 地图渲染器实例 */
    this.mapRenderer = new MapRenderer(this.ctx);

    /** @type {{x: number, y: number}} 相机偏移（视口左上角在地图中的坐标） */
    this.camera = { x: 0, y: 0 };

    /** @type {number} 呼吸动画相位 */
    this.breathPhase = 0;

    // ── 受伤效果状态 ──
    /** @type {number} 受伤叠加层透明度 (0-1) */
    this.hurtAlpha = 0;
    /** @type {number} 淡入方向: 1=淡入, -1=淡出, 0=无 */
    this.hurtFadeDir = 0;
    /** @type {{x: number, y: number}} 画面抖动偏移 */
    this.shakeOffset = { x: 0, y: 0 };
    /** @type {number} 抖动结束时间戳 */
    this.shakeEndTime = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** 根据窗口大小调整 canvas 尺寸 */
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  /**
   * 设置地图数据
   * @param {Object} mapData - 地图数据对象
   */
  setMap(mapData) {
    this.mapRenderer.setMap(mapData);
  }

  /**
   * 触发受伤效果
   * 由 HelperGame 在收到 collision 事件时调用
   * 同时启动：红色叠加层淡入 + 画面抖动
   */
  triggerHurt() {
    const cfg = AssetLoader.hurtEffect;
    this.hurtAlpha = 0;
    this.hurtFadeDir = 1; // 开始淡入
    this.shakeEndTime = Date.now() + cfg.shakeDuration;
  }

  /**
   * 更新相机位置（跟随玩家居中）
   *
   * @param {number} playerX - 玩家世界坐标 X
   * @param {number} playerY - 玩家世界坐标 Y
   */
  _updateCamera(playerX, playerY) {
    const mapSize = this.mapRenderer.getPixelSize();

    // 相机目标：玩家居中
    let cx = playerX - this.width / 2;
    let cy = playerY - this.height / 2;

    // 限制相机不超出地图边界（防止看到地图外的黑色区域）
    cx = Math.max(0, Math.min(cx, mapSize.w - this.width));
    cy = Math.max(0, Math.min(cy, mapSize.h - this.height));

    // 如果地图比视口小，居中显示
    if (mapSize.w < this.width) cx = -(this.width - mapSize.w) / 2;
    if (mapSize.h < this.height) cy = -(this.height - mapSize.h) / 2;

    this.camera.x = cx;
    this.camera.y = cy;
  }

  /**
   * 更新画面抖动效果
   * 抖动强度随时间线性衰减到 0
   */
  _updateShake() {
    const cfg = AssetLoader.hurtEffect;
    const now = Date.now();

    if (now < this.shakeEndTime) {
      // 剩余时间比例 → 抖动强度
      const progress = (this.shakeEndTime - now) / cfg.shakeDuration;
      const intensity = cfg.shakeIntensity * progress;
      // 随机偏移
      this.shakeOffset.x = (Math.random() - 0.5) * intensity * 2;
      this.shakeOffset.y = (Math.random() - 0.5) * intensity * 2;
    } else {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
    }
  }

  /**
   * 更新受伤叠加层透明度
   * 状态机：无 → 淡入(fadeIn) → 保持(hold) → 淡出(fadeOut) → 无
   *
   * 假设 60fps (16.67ms/帧) 计算每帧透明度增量
   */
  _updateHurt() {
    const cfg = AssetLoader.hurtEffect;

    if (this.hurtFadeDir === 1) {
      // 淡入阶段
      this.hurtAlpha += 1 / (cfg.fadeIn / 16.67);
      if (this.hurtAlpha >= cfg.maxAlpha) {
        this.hurtAlpha = cfg.maxAlpha;
        this.hurtFadeDir = 0; // 暂停，等待 hold 时间
        setTimeout(() => {
          this.hurtFadeDir = -1; // 开始淡出
        }, cfg.hold);
      }
    } else if (this.hurtFadeDir === -1) {
      // 淡出阶段
      this.hurtAlpha -= 1 / (cfg.fadeOut / 16.67);
      if (this.hurtAlpha <= 0) {
        this.hurtAlpha = 0;
        this.hurtFadeDir = 0; // 效果结束
      }
    }
  }

  /**
   * 渲染呼吸光点（盲人在地图上的位置）
   *
   * 两层绘制：
   *   1. 外发光 - 大范围柔和光圈
   *   2. 核心 - 小而亮的光点
   *
   * 呼吸动画：光点半径在 minRadius ~ maxRadius 之间正弦变化
   *
   * @param {number} screenX - 光点屏幕坐标 X
   * @param {number} screenY - 光点屏幕坐标 Y
   */
  _renderPlayerLight(screenX, screenY) {
    const ctx = this.ctx;
    const cfg = AssetLoader.breathingLight;

    // 呼吸动画：正弦波 0~1
    this.breathPhase += cfg.speed;
    const breathFactor = 0.5 + 0.5 * Math.sin(this.breathPhase);
    const radius = cfg.minRadius + (cfg.maxRadius - cfg.minRadius) * breathFactor;

    // ── 外发光 ──
    const glowGrad = ctx.createRadialGradient(
      screenX, screenY, 0,
      screenX, screenY, cfg.glowRadius
    );
    glowGrad.addColorStop(0, `rgba(255,255,255,${0.3 * breathFactor})`);
    glowGrad.addColorStop(0.3, `rgba(255,255,255,${0.1 * breathFactor})`);
    glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(screenX, screenY, cfg.glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // ── 核心光点 ──
    const coreGrad = ctx.createRadialGradient(
      screenX, screenY, 0,
      screenX, screenY, radius
    );
    const [r, g, b] = cfg.coreColor;
    coreGrad.addColorStop(0, `rgba(${r},${g},${b},${0.9 * breathFactor + 0.1})`);
    coreGrad.addColorStop(0.6, `rgba(${r},${g},${b},${0.5 * breathFactor})`);
    coreGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 渲染受伤叠加层（全屏红色半透明）
   */
  _renderHurtOverlay() {
    if (this.hurtAlpha <= 0) return;

    const ctx = this.ctx;
    const [r, g, b] = AssetLoader.hurtEffect.color;
    ctx.fillStyle = `rgba(${r},${g},${b},${this.hurtAlpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * 渲染一帧
   *
   * @param {number} playerX - 盲人世界坐标 X
   * @param {number} playerY - 盲人世界坐标 Y
   *
   * 渲染流程：
   *   1. 更新相机、抖动、受伤效果
   *   2. 清除为背景色
   *   3. 应用抖动偏移 (ctx.save/restore)
   *   4. 绘制地图
   *   5. 绘制呼吸光点
   *   6. 恢复坐标系
   *   7. 绘制受伤叠加层（不受抖动影响）
   */
  render(playerX, playerY) {
    const ctx = this.ctx;

    // ── 更新效果状态 ──
    this._updateCamera(playerX, playerY);
    this._updateShake();
    this._updateHurt();

    // ── 清除背景 ──
    ctx.fillStyle = CONSTANTS.COLORS.helperBg;
    ctx.fillRect(0, 0, this.width, this.height);

    // ── 应用抖动偏移 ──
    // save/restore 确保抖动只影响地图和光点，不影响受伤叠加层
    ctx.save();
    ctx.translate(this.shakeOffset.x, this.shakeOffset.y);

    // ── 绘制地图（带相机裁剪）──
    this.mapRenderer.render(
      this.camera.x, this.camera.y,
      this.width, this.height
    );

    // ── 计算玩家屏幕坐标并绘制光点 ──
    const screenX = playerX - this.camera.x;
    const screenY = playerY - this.camera.y;
    this._renderPlayerLight(screenX, screenY);

    ctx.restore(); // 恢复坐标系

    // ── 绘制受伤叠加层（不受抖动影响）──
    this._renderHurtOverlay();
  }
}
