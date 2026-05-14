/**
 * ============================================================================
 * BlindRenderer - 盲人端渲染器
 * ============================================================================
 *
 * 视觉效果（从下到上）：
 *   1. 纯黑背景 (#000000)
 *   2. 外层光晕 - 屏幕中央径向渐变，正弦脉动
 *   3. 核心光圈 - 更亮的中心区域
 *   4. 环境颗粒 - 80 个微弱白色粒子，仅在光晕范围内可见
 *   5. 撞墙闪烁 - 撞墙时短暂白色闪现，快速衰减
 *
 * 动画系统：
 * - glowPhase: 脉动相位，控制光晕明暗变化（~0.015 rad/帧）
 * - breathPhase: 呼吸相位，控制缓慢的大小变化（~0.008 rad/帧）
 * - hitFlash: 撞墙闪烁强度 (0-1)，每帧衰减 15%
 *
 * 所有视觉参数通过 AssetLoader.glow / AssetLoader.particles 读取，
 * 可在运行时通过 AssetLoader.updateConfig() 动态调整。
 */
class BlindRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - 游戏画布
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;

    // 动画相位
    this.glowPhase = 0;
    this.breathPhase = 0;

    /** @type {Array} 粒子数组 */
    this.particles = [];
    this._initParticles();

    /** @type {number} 撞墙闪烁强度 (0-1) */
    this.hitFlash = 0;

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
   * 初始化环境粒子系统
   * 每个粒子有随机的位置、大小、透明度和漂移速度
   * 位置使用 0-1 归一化坐标，渲染时转换为像素坐标
   */
  _initParticles() {
    const cfg = AssetLoader.particles;
    this.particles = [];
    for (let i = 0; i < cfg.count; i++) {
      this.particles.push({
        x: Math.random(),                           // 归一化 X (0-1)
        y: Math.random(),                           // 归一化 Y (0-1)
        size: cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize),
        opacity: cfg.minOpacity + Math.random() * (cfg.maxOpacity - cfg.minOpacity),
        vx: (Math.random() - 0.5) * cfg.speed * 0.01, // X 漂移速度
        vy: (Math.random() - 0.5) * cfg.speed * 0.01, // Y 漂移速度
        phase: Math.random() * Math.PI * 2,            // 透明度波动相位
      });
    }
  }

  /**
   * 触发撞墙闪烁效果
   * 由 BlindGame 在收到 collision 事件时调用
   */
  triggerHitFlash() {
    this.hitFlash = 1.0;
  }

  /**
   * 渲染一帧
   *
   * @param {number} playerX - 玩家世界坐标 X（盲人端实际不使用，保留接口一致性）
   * @param {number} playerY - 玩家世界坐标 Y
   *
   * 渲染顺序：
   *   1. 清除为纯黑
   *   2. 绘制外层光晕（径向渐变）
   *   3. 绘制核心光圈
   *   4. 绘制环境颗粒（使用 'lighter' 混合模式叠加）
   *   5. 绘制撞墙闪烁
   */
  render(playerX, playerY) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cfg = AssetLoader.glow;
    const particleCfg = AssetLoader.particles;

    // ── 更新动画相位 ──
    this.glowPhase += cfg.pulseSpeed;
    this.breathPhase += cfg.breathingSpeed;

    // 脉动因子：1 ± pulseAmount，控制光晕明暗
    const pulseFactor = 1 + Math.sin(this.glowPhase) * cfg.pulseAmount;
    // 呼吸因子：1 ± 0.05，控制微弱的大小变化
    const breathFactor = 1 + Math.sin(this.breathPhase) * 0.05;

    // ── 1. 清除为纯黑 ──
    ctx.fillStyle = CONSTANTS.COLORS.blindBg;
    ctx.fillRect(0, 0, w, h);

    // ── 2. 绘制边缘泛光 ──
    // 从四条边向内渐变，中心保持纯黑
    const edgeDepth = cfg.radius * pulseFactor * breathFactor; // 光晕向内渗透深度
    const alpha = cfg.intensity * pulseFactor;

    // 上边缘：从上往下渐变
    const topGrad = ctx.createLinearGradient(0, 0, 0, edgeDepth);
    topGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    topGrad.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.3})`);
    topGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, edgeDepth);

    // 下边缘：从下往上渐变
    const botGrad = ctx.createLinearGradient(0, h, 0, h - edgeDepth);
    botGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    botGrad.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.3})`);
    botGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, h - edgeDepth, w, edgeDepth);

    // 左边缘：从左往右渐变
    const leftGrad = ctx.createLinearGradient(0, 0, edgeDepth, 0);
    leftGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    leftGrad.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.3})`);
    leftGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, edgeDepth, h);

    // 右边缘：从右往左渐变
    const rightGrad = ctx.createLinearGradient(w, 0, w - edgeDepth, 0);
    rightGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    rightGrad.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.3})`);
    rightGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(w - edgeDepth, 0, edgeDepth, h);

    // 四角额外加亮（线性渐变叠加后角部会偏暗，补一下）
    const cornerSize = edgeDepth * 0.8;
    const cornerAlpha = alpha * 0.5;
    const cornerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, cornerSize);
    cornerGrad.addColorStop(0, `rgba(255,255,255,${cornerAlpha})`);
    cornerGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cornerGrad;
    ctx.fillRect(0, 0, cornerSize, cornerSize);

    const cornerGrad2 = ctx.createRadialGradient(w, 0, 0, w, 0, cornerSize);
    cornerGrad2.addColorStop(0, `rgba(255,255,255,${cornerAlpha})`);
    cornerGrad2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cornerGrad2;
    ctx.fillRect(w - cornerSize, 0, cornerSize, cornerSize);

    const cornerGrad3 = ctx.createRadialGradient(0, h, 0, 0, h, cornerSize);
    cornerGrad3.addColorStop(0, `rgba(255,255,255,${cornerAlpha})`);
    cornerGrad3.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cornerGrad3;
    ctx.fillRect(0, h - cornerSize, cornerSize, cornerSize);

    const cornerGrad4 = ctx.createRadialGradient(w, h, 0, w, h, cornerSize);
    cornerGrad4.addColorStop(0, `rgba(255,255,255,${cornerAlpha})`);
    cornerGrad4.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cornerGrad4;
    ctx.fillRect(w - cornerSize, h - cornerSize, cornerSize, cornerSize);

    // ── 4. 绘制环境颗粒 ──
    // 'lighter' 混合模式：粒子叠加后更亮，模拟微光效果
    // 粒子在边缘泛光范围内可见，离边缘越近越亮
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      // 更新位置（漂移）
      p.x += p.vx;
      p.y += p.vy;
      p.phase += 0.01;

      // 循环边界：超出屏幕后从另一侧出现
      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1;
      if (p.y > 1) p.y -= 1;

      // 透明度随相位波动
      const opacity = p.opacity * (0.5 + 0.5 * Math.sin(p.phase));

      // 计算粒子到最近边缘的距离（归一化 0-1）
      const px = p.x * w;
      const py = p.y * h;
      const distToLeft = p.x;
      const distToRight = 1 - p.x;
      const distToTop = p.y;
      const distToBottom = 1 - p.y;
      const edgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

      // 只在边缘泛光范围内绘制（离边缘 < edgeDepth 的区域）
      const edgeThreshold = edgeDepth / Math.max(w, h);
      if (edgeDist < edgeThreshold * 1.2) {
        const fadeByDist = 1 - edgeDist / (edgeThreshold * 1.2);
        const [r, g, b] = particleCfg.color;
        ctx.fillStyle = `rgba(${r},${g},${b},${opacity * fadeByDist})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over'; // 恢复默认混合模式

    // ── 5. 撞墙闪烁效果 ──
    if (this.hitFlash > 0) {
      // 白色半透明覆盖层
      ctx.fillStyle = `rgba(255, 255, 255, ${this.hitFlash * 0.15})`;
      ctx.fillRect(0, 0, w, h);
      // 每帧衰减 15%
      this.hitFlash *= 0.85;
      if (this.hitFlash < 0.01) this.hitFlash = 0;
    }
  }
}
