/**
 * ============================================================================
 * MapGenerator - 程序化迷宫地图生成
 * ============================================================================
 *
 * 算法：递归回溯 (Recursive Backtracking)
 *
 * 步骤：
 *   1. 创建 mazeSize x mazeSize 的迷宫格子网格
 *   2. 每个格子扩展为 cellSize x cellSize 的瓦片区域
 *   3. 从 (0,0) 格子开始，随机选择未访问的邻居，打通墙壁
 *   4. 递归直到所有格子都被访问（保证迷宫连通）
 *   5. 输出 (mazeSize*cellSize+1) x (mazeSize*cellSize+1) 的瓦片网格
 *
 * 输出格式：
 *   - grid[y][x]: 0=地板, 1=墙壁
 *   - startPos: { x, y } 玩家起始像素坐标
 *
 * 示例 (mazeSize=2, cellSize=3, 简化):
 *   ████████
 *   █      █
 *   █      █
 *   █      █
 *   ████   █
 *   █      █
 *   █      █
 *   ████████
 */

const GameConfig = require('../config/GameConfig');

class MapGenerator {
  /**
   * 生成迷宫地图
   * @returns {{
   *   grid: number[][],      // 瓦片网格 [y][x], 0=地板 1=墙壁
   *   startPos: {x: number, y: number},  // 起始像素坐标
   *   width: number,         // 网格宽度 (瓦片数)
   *   height: number,        // 网格高度 (瓦片数)
   *   tileSize: number       // 瓦片像素大小
   * }}
   */
  static generate() {
    const { mazeSize, cellSize, WALL, FLOOR } = GameConfig.map;

    // 网格尺寸 = 格子数 * 每格瓦片数 + 1（外围墙壁）
    const gridW = mazeSize * cellSize + 1;
    const gridH = mazeSize * cellSize + 1;

    // ── 初始化全墙壁 ──
    const grid = [];
    for (let y = 0; y < gridH; y++) {
      grid[y] = [];
      for (let x = 0; x < gridW; x++) {
        grid[y][x] = WALL;
      }
    }

    // ── 迷宫格子访问标记 ──
    const visited = [];
    for (let y = 0; y < mazeSize; y++) {
      visited[y] = [];
      for (let x = 0; x < mazeSize; x++) {
        visited[y][x] = false;
      }
    }

    // 四个方向：上、右、下、左
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
    ];

    /**
     * Fisher-Yates 洗牌算法
     * @param {Array} arr
     * @returns {Array} 打乱后的数组（原地修改）
     */
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    /**
     * 递归回溯：雕刻当前格子并继续探索邻居
     * @param {number} cx - 当前格子 X 坐标 (0 ~ mazeSize-1)
     * @param {number} cy - 当前格子 Y 坐标 (0 ~ mazeSize-1)
     */
    function carve(cx, cy) {
      visited[cy][cx] = true;

      // 将当前格子对应的瓦片区域设为地板
      // 格子 (cx,cy) 对应瓦片范围: [(cx*cellSize+1) ~ (cx*cellSize+cellSize-1)]
      const startX = cx * cellSize + 1;
      const startY = cy * cellSize + 1;
      for (let dy = 0; dy < cellSize - 1; dy++) {
        for (let dx = 0; dx < cellSize - 1; dx++) {
          grid[startY + dy][startX + dx] = FLOOR;
        }
      }

      // 随机顺序尝试四个方向
      const dirs = shuffle([...directions]);
      for (const { dx, dy } of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;

        // 边界检查 + 未访问检查
        if (nx >= 0 && nx < mazeSize && ny >= 0 && ny < mazeSize && !visited[ny][nx]) {
          // 打通当前格子与邻居之间的墙壁
          // 墙壁位于两格交界处，打通 cellSize-1 个瓦片宽度的通道
          if (dx !== 0) {
            // 水平方向打通 (向右或向左)
            const wallX = cx * cellSize + (dx === 1 ? cellSize : 0);
            const midY = cy * cellSize + 1;
            for (let i = 0; i < cellSize - 1; i++) {
              grid[midY + i][wallX] = FLOOR;
            }
          } else {
            // 垂直方向打通 (向下或向上)
            const wallY = cy * cellSize + (dy === 1 ? cellSize : 0);
            const midX = cx * cellSize + 1;
            for (let i = 0; i < cellSize - 1; i++) {
              grid[wallY][midX + i] = FLOOR;
            }
          }

          // 递归访问邻居
          carve(nx, ny);
        }
      }
    }

    // ── 从 (0,0) 开始生成迷宫 ──
    carve(0, 0);

    // ── 计算起始像素坐标：第一个格子的中心 ──
    const startPos = {
      x: Math.floor(cellSize / 2) * GameConfig.map.tileSize + GameConfig.map.tileSize / 2,
      y: Math.floor(cellSize / 2) * GameConfig.map.tileSize + GameConfig.map.tileSize / 2,
    };

    return {
      grid,
      startPos,
      width: gridW,
      height: gridH,
      tileSize: GameConfig.map.tileSize,
    };
  }
}

module.exports = MapGenerator;
