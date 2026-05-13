/**
 * ============================================================================
 * Physics - 碰撞检测与位置修正
 * ============================================================================
 *
 * 算法：圆形-AABB 碰撞检测
 *
 * 玩家用圆形表示 (圆心=位置, 半径=player.radius)
 * 墙壁用轴对齐矩形 (瓦片) 表示
 *
 * 核心思路：
 *   1. 找到瓦片矩形上离圆心最近的点
 *   2. 如果最近点到圆心的距离 < 圆半径 → 碰撞
 *   3. 碰撞法线 = 圆心指向最近点的方向
 *   4. 沿法线推出直到不重叠
 *
 * 参考：https://learnopengl.com/In-Practice/2D-Game/Collisions/Collision-Detection
 */

const GameConfig = require('../config/GameConfig');

class Physics {
  /**
   * 检测圆形与墙壁瓦片的碰撞
   *
   * @param {number} x - 圆心 X 坐标 (像素)
   * @param {number} y - 圆心 Y 坐标 (像素)
   * @param {number[][]} grid - 地图瓦片网格 [y][x]
   * @param {number} tileSize - 瓦片像素大小
   * @returns {{ collided: boolean, normal: {x: number, y: number} | null }}
   *   - collided: 是否发生碰撞
   *   - normal: 碰撞法线方向（从墙壁指向圆心），用于推出方向
   */
  static checkWallCollision(x, y, grid, tileSize) {
    const radius = GameConfig.player.radius;

    // ── 计算玩家圆形可能覆盖的瓦片范围 ──
    // 圆的 AABB 包围盒所在的瓦片坐标
    const minTX = Math.floor((x - radius) / tileSize);
    const maxTX = Math.floor((x + radius) / tileSize);
    const minTY = Math.floor((y - radius) / tileSize);
    const maxTY = Math.floor((y + radius) / tileSize);

    let closestDist = Infinity;
    let normal = { x: 0, y: 0 };
    let collided = false;

    // ── 遍历范围内每个瓦片 ──
    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {

        // 边界外视为墙壁
        if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) {
          collided = true;
          const cx = tx * tileSize + tileSize / 2;
          const cy = ty * tileSize + tileSize / 2;
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < closestDist) {
            closestDist = dist;
            normal = { x: dx / (dist || 1), y: dy / (dist || 1) };
          }
          continue;
        }

        // 只处理墙壁瓦片
        if (grid[ty][tx] === GameConfig.map.WALL) {
          // ── 找到瓦片矩形上离圆心最近的点 ──
          // clamp 圆心到瓦片矩形范围内
          const closestX = Math.max(tx * tileSize, Math.min(x, (tx + 1) * tileSize));
          const closestY = Math.max(ty * tileSize, Math.min(y, (ty + 1) * tileSize));

          // 最近点到圆心的距离
          const dx = x - closestX;
          const dy = y - closestY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // 距离 < 半径 → 碰撞
          if (dist < radius) {
            collided = true;
            if (dist < closestDist) {
              closestDist = dist;
              if (dist > 0) {
                // 法线 = 圆心指向最近点的方向（推出方向）
                normal = { x: dx / dist, y: dy / dist };
              } else {
                // 圆心恰好在瓦片边缘上，默认向上推
                normal = { x: 0, y: -1 };
              }
            }
          }
        }
      }
    }

    return { collided, normal: collided ? normal : null };
  }

  /**
   * 修正位置使其不与墙壁重叠
   *
   * 通过迭代沿法线方向推出，直到没有碰撞。
   * 每次推出 2 像素，最多迭代 10 次防止极端情况卡死。
   *
   * @param {number} x - 当前 X 坐标
   * @param {number} y - 当前 Y 坐标
   * @param {number[][]} grid - 地图瓦片网格
   * @param {number} tileSize - 瓦片像素大小
   * @returns {{ x: number, y: number, hitWall: boolean }}
   *   - x, y: 修正后的坐标
   *   - hitWall: 是否发生了碰撞（用于触发受伤效果）
   */
  static resolveCollision(x, y, grid, tileSize) {
    let resolved = false;
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      const result = this.checkWallCollision(x, y, grid, tileSize);
      if (!result.collided) break;

      resolved = true;
      // 沿法线方向每帧推出 2 像素，确保脱出重叠
      x += result.normal.x * 2;
      y += result.normal.y * 2;
      iterations++;
    }

    return { x, y, hitWall: resolved };
  }
}

module.exports = Physics;
