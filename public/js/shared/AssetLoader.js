/**
 * ============================================================================
 * AssetLoader - 美术资源加载与配置管理
 * ============================================================================
 *
 * 职责：
 * 1. 管理所有可配置的视觉效果参数（光晕、粒子、受伤效果等）
 * 2. 提供图片纹理的异步加载接口
 * 3. 运行时可通过 updateConfig() 动态调整效果参数
 *
 * 扩展方式：
 * - 替换纹理：调用 loadTexture('wall', 'assets/images/wall.png')
 * - 调整效果：调用 updateConfig('glow', { radius: 200 })
 * - 所有渲染器通过 AssetLoader.glow / AssetLoader.particles 等读取配置
 *
 * 设计意图：
 *   将视觉参数从渲染逻辑中解耦，美术/策划可以只修改此文件来调整效果，
 *   无需理解渲染器的内部实现。
 */
const AssetLoader = {
  // ──────────────────────────────────────────────
  // 纹理资源（后期替换为 Limbo 风格素材）
  // ──────────────────────────────────────────────
  textures: {
    wall: null,       // Image 对象 - 墙壁纹理
    floor: null,      // Image 对象 - 地板纹理
    wallEdge: null,   // Image 对象 - 墙壁边缘装饰
  },

  // ──────────────────────────────────────────────
  // 粒子效果配置（盲人端环境颗粒）
  // ──────────────────────────────────────────────
  particles: {
    count: 80,            // 粒子总数
    minSize: 1,           // 最小半径 (px)
    maxSize: 3,           // 最大半径 (px)
    minOpacity: 0.01,     // 最低透明度
    maxOpacity: 0.06,     // 最高透明度
    speed: 0.3,           // 漂移速度系数
    color: [255, 255, 255], // RGB 颜色（白色）
  },

  // ──────────────────────────────────────────────
  // 光晕配置（盲人端中央光圈）
  // ──────────────────────────────────────────────
  glow: {
    radius: 180,            // 外层光晕半径 (px)
    intensity: 0.12,        // 外层光晕强度 (0-1)
    coreRadius: 40,         // 核心光圈半径 (px)
    coreIntensity: 0.2,     // 核心光圈强度 (0-1)
    pulseSpeed: 0.015,      // 脉动速度 (rad/帧)，越大越快
    pulseAmount: 0.15,      // 脉动幅度 (0-1)，控制明暗变化范围
    breathingSpeed: 0.008,  // 呼吸速度 (rad/帧)，缓慢的大小变化
  },

  // ──────────────────────────────────────────────
  // 受伤效果配置（帮助者端撞墙反馈）
  // ──────────────────────────────────────────────
  hurtEffect: {
    color: [180, 20, 20],   // 叠加层 RGB 颜色（暗红）
    maxAlpha: 0.35,         // 最大透明度
    fadeIn: 50,             // 淡入时长 (ms)
    hold: 150,              // 保持时长 (ms)
    fadeOut: 300,           // 淡出时长 (ms)
    shakeIntensity: 6,      // 画面抖动强度 (px)
    shakeDuration: 200,     // 抖动持续时长 (ms)
  },

  // ──────────────────────────────────────────────
  // 呼吸光点配置（帮助者端盲人角色显示）
  // ──────────────────────────────────────────────
  breathingLight: {
    minRadius: 8,             // 呼吸最小时半径 (px)
    maxRadius: 14,            // 呼吸最大时半径 (px)
    speed: 0.03,              // 呼吸速度 (rad/帧)
    glowRadius: 50,           // 外发光范围 (px)
    coreColor: [255, 255, 255], // 核心 RGB（白色）
    glowColor: [255, 255, 255], // 外发光 RGB
  },

  /**
   * 加载单张图片纹理
   * @param {string} key - textures 中的键名（如 'wall'）
   * @param {string} src - 图片路径
   * @returns {Promise<Image>}
   */
  async loadTexture(key, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.textures[key] = img;
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  },

  /**
   * 批量加载图片纹理
   * @param {Object} manifest - { key: src } 映射，如 { wall: 'a.png', floor: 'b.png' }
   * @returns {Promise<Image[]>}
   */
  async loadAll(manifest) {
    const promises = Object.entries(manifest).map(
      ([key, src]) => this.loadTexture(key, src)
    );
    return Promise.all(promises);
  },

  /**
   * 运行时更新配置
   * 可用于动画效果、难度调整等场景
   *
   * @param {string} section - 配置区域名（如 'glow', 'particles', 'hurtEffect'）
   * @param {Object} values - 要覆盖的键值对
   *
   * @example
   *   AssetLoader.updateConfig('glow', { radius: 250, intensity: 0.2 });
   *   AssetLoader.updateConfig('particles', { count: 120, color: [200, 200, 255] });
   */
  updateConfig(section, values) {
    if (this[section]) {
      Object.assign(this[section], values);
    }
  },
};
