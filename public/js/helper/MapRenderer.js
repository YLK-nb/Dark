/**
 * ============================================================================
 * MapRenderer - 地图渲染器（帮助者端）
 * ============================================================================
 *
 * 职责：
 * 1. 将服务端下发的瓦片网格数据渲染为可视化的俯视地图
 * 2. 使用离屏 Canvas 预渲染地图为位图，提升运行时性能
 * 3. Limbo 风格暗色调：极暗墙壁、微弱边缘高光、噪点纹理
 *
 * 性能优化：
 *   地图只在 setMap() 时渲染一次到离屏 Canvas，之后每帧只需 drawImage。
 *   对于 41x41 瓦片的地图，避免每帧重复计算墙壁/地板颜色。
 *
 * 渲染风格：
 * - 墙壁: #0a0a0a（接近纯黑）
 * - 地板: #0d0d0d（极暗灰）
 * - 墙壁边缘: #1a1a1a（微弱高光，帮助辨识通道）
 * - 噪点: 像素级随机亮度偏移（±4），模拟 Limbo 的粗糙质感
 */
class MapRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx - 主画布上下文（用于最终绘制）
   */
  constructor(ctx) {
    this.ctx = ctx;

    /** @type {Object|null} 地图数据 { grid, width, height, tileSize } */
    this.mapData = null;

    /** @type {HTMLCanvasElement|null} 离屏 Canvas 缓存 */
    this.mapImage = null;
  }

  /**
   * 设置地图数据并触发预渲染
   * @param {Object} mapData - { grid: number[][], width: number, height: number, tileSize: number }
   */
  setMap(mapData) {
    this.mapData = mapData;
    this._prerenderMap();
  }

  /**
   * 预渲染地图到离屏 Canvas
   *
   * 步骤：
   *   1. 填充地板底色
   *   2. 绘制地板细节纹理（基于坐标的伪随机图案）
   *   3. 绘制墙壁（含相邻通道的边缘高光）
   *   4. 添加像素级噪点纹理
   */
  _prerenderMap() {
    const { grid, width, height, tileSize } = this.mapData;

    // 创建离屏 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width * tileSize;
    canvas.height = height * tileSize;
    const ctx = canvas.getContext('2d');

    // ── 1. 填充地板底色 ──
    ctx.fillStyle = CONSTANTS.COLORS.floor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── 2. 地板细节纹理 ──
    // 使用确定性哈希而非 Math.random()，保证每次渲染结果一致
    ctx.fillStyle = CONSTANTS.COLORS.floorDetail;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === CONSTANTS.FLOOR) {
          // 基于坐标的伪随机：约 20% 的地板瓦片有细节
          const hash = (x * 7 + y * 13) % 5;
          if (hash === 0) {
            ctx.fillStyle = CONSTANTS.COLORS.floorDetail;
            ctx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
          }
        }
      }
    }

    // ── 3. 绘制墙壁 ──
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === CONSTANTS.WALL) {
          const px = x * tileSize;
          const py = y * tileSize;

          // 墙壁主体（纯黑）
          ctx.fillStyle = CONSTANTS.COLORS.wall;
          ctx.fillRect(px, py, tileSize, tileSize);

          // 墙壁边缘高光
          // 只在墙壁与通道相邻的边绘制，形成微弱的轮廓感
          ctx.fillStyle = CONSTANTS.COLORS.wallEdge;

          // 下方是通道 → 底边高光
          if (y + 1 < height && grid[y + 1][x] === CONSTANTS.FLOOR) {
            ctx.fillRect(px, py + tileSize - 2, tileSize, 2);
          }
          // 右侧是通道 → 右边高光
          if (x + 1 < width && grid[y][x + 1] === CONSTANTS.FLOOR) {
            ctx.fillRect(px + tileSize - 2, py, 2, tileSize);
          }
          // 上方是通道 → 顶边高光
          if (y - 1 >= 0 && grid[y - 1][x] === CONSTANTS.FLOOR) {
            ctx.fillRect(px, py, tileSize, 2);
          }
          // 左侧是通道 → 左边高光
          if (x - 1 >= 0 && grid[y][x - 1] === CONSTANTS.FLOOR) {
            ctx.fillRect(px, py, 2, tileSize);
          }
        }
      }
    }

    // ── 4. 像素级噪点纹理 ──
    // 对每个像素的 RGB 值加减微小随机偏移，模拟 Limbo 的粗糙质感
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data; // Uint8ClampedArray [R, G, B, A, R, G, B, A, ...]
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 8; // ±4 亮度偏移
      data[i] = Math.max(0, Math.min(255, data[i] + noise));       // R
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // G
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // B
      // A 通道不变
    }
    ctx.putImageData(imageData, 0, 0);

    this.mapImage = canvas;
  }

  /**
   * 将预渲染的地图绘制到主画布
   * 只绘制视口范围内的部分（相机裁剪）
   *
   * @param {number} offsetX - 视口左上角在地图中的 X 偏移
   * @param {number} offsetY - 视口左上角在地图中的 Y 偏移
   * @param {number} viewW - 视口宽度
   * @param {number} viewH - 视口高度
   */
  render(offsetX, offsetY, viewW, viewH) {
    if (!this.mapImage) return;

    // drawImage(image, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH)
    this.ctx.drawImage(
      this.mapImage,
      offsetX, offsetY, viewW, viewH,  // 源区域（从离屏 Canvas 裁剪）
      0, 0, viewW, viewH               // 目标区域（主画布）
    );
  }

  /**
   * 获取地图总像素尺寸
   * @returns {{ w: number, h: number }}
   */
  getPixelSize() {
    if (!this.mapData) return { w: 0, h: 0 };
    return {
      w: this.mapData.width * this.mapData.tileSize,
      h: this.mapData.height * this.mapData.tileSize,
    };
  }
}
