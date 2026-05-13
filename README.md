# DARK - 双端非对称协作游戏

一款网页端双人协作游戏。一人在全黑中摸索前行，另一人俯瞰地图、用语音指引方向。

---

## 快速启动

```bash
npm install
npm start
```

浏览器打开 `http://localhost:3001`，开两个窗口分别选择"盲人"和"帮助者"角色。

> 需要麦克风权限以启用实时语音通话。

---

## 项目结构

```
Dark/
├── server.js                         # 服务端入口
├── package.json
├── src/
│   ├── config/
│   │   └── GameConfig.js             # 全局配置（服务端/客户端共享常量）
│   └── game/
│       ├── GameRoom.js               # 房间管理 & 游戏状态同步
│       ├── MapGenerator.js           # 程序化迷宫地图生成
│       └── Physics.js                # 圆形-墙壁碰撞检测与修正
├── public/
│   ├── index.html                    # 大厅页（角色选择）
│   ├── blind.html                    # 盲人端页面
│   ├── helper.html                   # 帮助者端页面
│   ├── css/
│   │   └── style.css                 # 全局样式（Limbo 暗色主题）
│   └── js/
│       ├── shared/                   # 客户端共享模块
│       │   ├── Constants.js          # 客户端常量（颜色、瓦片类型等）
│       │   ├── AssetLoader.js        # 美术资源加载接口
│       │   └── SoundManager.js       # 音效管理接口
│       ├── blind/                    # 盲人端逻辑
│       │   ├── BlindInput.js         # WASD 键盘输入
│       │   ├── BlindRenderer.js      # 黑屏 + 光晕 + 粒子渲染
│       │   └── BlindGame.js          # 盲人端主控（生命周期协调）
│       ├── helper/                   # 帮助者端逻辑
│       │   ├── MapRenderer.js        # 俯视地图渲染（离屏缓存）
│       │   ├── HelperRenderer.js     # 相机 + 呼吸光点 + 受伤效果
│       │   └── HelperGame.js         # 帮助者端主控
│       └── network/                  # 网络层
│           ├── NetworkManager.js     # Socket.IO 客户端封装
│           └── VoiceChat.js          # WebRTC 点对点语音
```

---

## 架构概览

### 整体数据流

```
┌─────────────┐    Socket.IO     ┌──────────────┐    Socket.IO     ┌──────────────┐
│  盲人客户端   │ ── move ──────> │   服务端      │ ── playerUpdate > │  帮助者客户端  │
│             │                  │  GameRoom    │ ── collision   > │              │
│  (WASD输入)  │ <── playerUpdate │  (权威状态)   │                  │  (地图+光点)   │
└─────────────┘                  └──────────────┘                  └──────────────┘
      │                                │                                 │
      │            WebRTC (P2P)        │                                 │
      └───────────── 音频流直连 ──────────────────────────────────────────┘
```

### 角色分工

| 角色 | 视觉 | 交互 | 控制权 |
|------|------|------|--------|
| 盲人 | 全黑 + 微弱光晕 + 颗粒 | WASD 移动 | 有（移动） |
| 帮助者 | 俯视地图 + 呼吸光点 | 语音指引 | 无（纯观察） |

### 服务端权威模型

服务端是游戏状态的唯一权威来源：
- 盲人客户端发送**移动意图**（方向向量），不直接修改位置
- 服务端执行碰撞检测，更新权威位置
- 服务端以 ~30fps 广播位置给两个客户端
- 撞墙事件由服务端判定后广播，帮助者端播放受伤效果

---

## 核心模块说明

### 1. 地图生成 (`MapGenerator.js`)

**算法**: 递归回溯迷宫生成

```
1. 创建 NxN 迷宫格子 (默认 8x8)
2. 每个格子扩展为 MxM 瓦片 (默认 5x5)
3. 从 (0,0) 开始递归：
   - 标记当前格子为已访问
   - 将格子对应区域设为通道 (FLOOR)
   - 随机选一个未访问的邻居，打通之间的墙壁
   - 递归访问邻居
4. 最终输出 (N*M+1) x (N*M+1) 的瓦片网格
```

**瓦片值**: `0` = 地板, `1` = 墙壁

**起始位置**: 迷宫 (0,0) 格子的像素中心

### 2. 碰撞检测 (`Physics.js`)

**算法**: 圆形-AABB 碰撞检测

```
checkWallCollision(x, y, grid, tileSize):
  1. 计算玩家圆形覆盖的瓦片范围
  2. 遍历范围内每个瓦片
  3. 如果是墙壁：找到瓦片矩形上离圆心最近的点
  4. 如果该点到圆心的距离 < 半径 → 碰撞
  5. 返回碰撞法线方向（用于推出去）

resolveCollision(x, y, grid, tileSize):
  1. 循环检测碰撞
  2. 沿法线方向每帧推出 2 像素
  3. 最多迭代 10 次防止卡住
  4. 返回修正后的位置和是否撞墙
```

### 3. 房间管理 (`GameRoom.js`)

**生命周期**: 创建 → 等待玩家 → 游戏中 → 玩家离开 → 销毁

- 每个房间最多 2 个玩家（1 盲人 + 1 帮助者）
- 玩家配对后自动生成地图并开始游戏
- 服务端以 `setTimeout` 循环广播位置（间隔 33ms ≈ 30fps）
- 撞墙事件有 200ms 防抖，避免重复触发

### 4. WebRTC 语音 (`VoiceChat.js`)

**信令流程** (通过 Socket.IO 中转):

```
帮助者 (发起方)           服务端                  盲人 (接收方)
    │                      │                        │
    │──── voiceReady ─────>│<──── voiceReady ────────│
    │<─── createOffer ─────│                        │
    │                      │                        │
    │ 创建 RTCPeerConnection                        │
    │ 创建 Offer (SDP)     │                        │
    │──── offer ──────────>│──── offer ────────────>│
    │                      │                        │ 创建 RTCPeerConnection
    │                      │                        │ 设置 RemoteDescription
    │                      │                        │ 创建 Answer (SDP)
    │<── answer ───────────│<──── answer ───────────│
    │ 设置 RemoteDescription                        │
    │                      │                        │
    │── iceCandidate ─────>│── iceCandidate ───────>│
    │<─ iceCandidate ──────│<─ iceCandidate ────────│
    │                      │                        │
    │<════════════ 音频流双向传输 (P2P) ════════════>│
```

- 使用 Google 公共 STUN 服务器获取 NAT 穿透
- 局域网/本机测试无需 TURN 服务器

### 5. 盲人端渲染 (`BlindRenderer.js`)

**渲染层次** (从下到上):

1. **纯黑背景** - `#000000`
2. **外层光晕** - 屏幕中央径向渐变，半径 180px，正弦脉动
3. **核心光圈** - 更亮的中心区域，半径 40px
4. **环境颗粒** - 80 个微弱白色粒子，随机漂移，仅在光晕范围内可见
5. **撞墙闪烁** - 撞墙时短暂白色闪现，快速衰减

**动画系统**:
- `glowPhase` 控制脉动（`pulseSpeed = 0.015 rad/frame`）
- `breathPhase` 控制呼吸（`breathingSpeed = 0.008 rad/frame`）
- 两个相位叠加产生自然的明暗变化

### 6. 帮助者端渲染 (`HelperRenderer.js`)

**渲染层次**:

1. **暗色背景** - `#050505`
2. **地图** - 离屏 Canvas 预渲染，带墙壁边缘高光和噪点纹理
3. **呼吸光点** - 盲人在地图上的位置，正弦呼吸动画 + 外发光
4. **受伤叠加** - 撞墙时全屏红色半透明层，淡入→保持→淡出
5. **抖动** - 撞墙时整个画面随机偏移，强度随时间衰减

**相机系统**:
- 跟随玩家居中
- 限制不超出地图边界
- 地图小于视口时居中显示

---

## 配置与扩展接口

### 美术资源接口 (`AssetLoader.js`)

后期替换美术资源时，修改以下配置：

```js
// 纹理替换
AssetLoader.loadTexture('wall', 'assets/images/wall.png');
AssetLoader.loadTexture('floor', 'assets/images/floor.png');

// 效果参数调整
AssetLoader.updateConfig('glow', { radius: 200, intensity: 0.2 });
AssetLoader.updateConfig('particles', { count: 120, color: [200, 200, 255] });
AssetLoader.updateConfig('hurtEffect', { color: [255, 0, 0], maxAlpha: 0.5 });
AssetLoader.updateConfig('breathingLight', { minRadius: 6, maxRadius: 16 });
```

### 音效接口 (`SoundManager.js`)

后期添加音效时：

```js
// 加载音频文件
SoundManager.loadAudio('footstep', 'assets/sounds/footstep.mp3');
SoundManager.loadAudio('wallHit', 'assets/sounds/wall_hit.mp3');
SoundManager.loadAudio('ambient', 'assets/sounds/ambient.mp3');
SoundManager.loadAudio('breathing', 'assets/sounds/breathing.mp3');

// 音量控制
SoundManager.setVolume('master', 0.8);
SoundManager.setVolume('sfx', 1.0);
SoundManager.setVolume('ambient', 0.4);
```

> `SoundManager` 中的 `playFootstep()`、`playWallHit()` 等方法已有调用桩，加载资源后自动生效。

### 游戏配置 (`GameConfig.js`)

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `server.port` | 3001 | 服务端口 |
| `map.mazeSize` | 8 | 迷宫格子数 (NxN) |
| `map.cellSize` | 5 | 每格瓦片数 |
| `map.tileSize` | 40 | 瓦片像素大小 |
| `player.speed` | 3 | 移动速度 (px/帧) |
| `player.radius` | 12 | 碰撞半径 |
| `syncInterval` | 33 | 网络同步间隔 (ms) |

---

## Socket.IO 事件一览

### 游戏事件

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `joinGame` | 客户端→服务端 | `{ role }` | 加入游戏 |
| `joined` | 服务端→客户端 | `{ roomId, role }` | 确认加入 |
| `playerJoined` | 服务端→客户端 | `{ role }` | 对方加入 |
| `gameStart` | 服务端→客户端 | `{ map, startPos }` | 游戏开始 |
| `move` | 客户端→服务端 | `{ dx, dy }` | 移动输入 |
| `playerUpdate` | 服务端→客户端 | `{ x, y }` | 位置同步 |
| `collision` | 服务端→客户端 | `{ x, y, timestamp }` | 撞墙事件 |
| `playerLeft` | 服务端→客户端 | `{ role }` | 对方离开 |

### WebRTC 信令事件

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `voiceReady` | 客户端→服务端 | - | 语音就绪 |
| `voicePeerReady` | 服务端→客户端 | `{ peerId }` | 对端就绪 |
| `createOffer` | 服务端→客户端 | `{ targetId }` | 指示发起方创建 Offer |
| `rtcOffer` | 双向 | `{ offer, senderId }` | SDP Offer |
| `rtcAnswer` | 双向 | `{ answer, senderId }` | SDP Answer |
| `rtcIceCandidate` | 双向 | `{ candidate, senderId }` | ICE Candidate |

---

## 后续扩展方向

- **关卡系统**: 在 `GameRoom` 中管理多关卡进度
- **道具交互**: 帮助者放置标记点，盲人拾取道具
- **多人房间**: 扩展为 1vN 或 NvN
- **移动端适配**: 盲人端触屏虚拟摇杆
- **音效系统**: 补全 `SoundManager` 的实际播放逻辑
- **纹理替换**: 通过 `AssetLoader.loadTexture()` 替换为 Limbo 风格素材
