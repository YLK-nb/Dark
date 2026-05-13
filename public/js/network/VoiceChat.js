/**
 * ============================================================================
 * VoiceChat - WebRTC 点对点语音通话
 * ============================================================================
 *
 * 职责：
 * 1. 通过 getUserMedia 获取麦克风音频流
 * 2. 创建 RTCPeerConnection 建立 P2P 连接
 * 3. 通过 Socket.IO 交换 SDP Offer/Answer 和 ICE Candidate（信令）
 * 4. 双向传输音频流
 *
 * 连接流程：
 *   1. 双方各自调用 joinVoice() → 获取麦克风 → 通知服务端 voiceReady
 *   2. 服务端指示帮助者端创建 Offer
 *   3. 帮助者端 → [offer] → 服务端 → 盲人端
 *   4. 盲人端 → [answer] → 服务端 → 帮助者端
 *   5. 双方交换 ICE Candidate（网络地址信息）
 *   6. P2P 连接建立，音频流双向传输
 *
 * 依赖：
 * - NetworkManager（提供 Socket.IO 信令通道）
 * - 浏览器 WebRTC API（RTCPeerConnection, getUserMedia）
 */
class VoiceChat {
  /**
   * @param {NetworkManager} networkManager - 网络管理器实例
   */
  constructor(networkManager) {
    /** @type {NetworkManager} Socket.IO 信令通道 */
    this.network = networkManager;

    /** @type {RTCPeerConnection|null} WebRTC 连接实例 */
    this.peerConnection = null;

    /** @type {MediaStream|null} 本地麦克风音频流 */
    this.localStream = null;

    /** @type {MediaStream|null} 远端音频流 */
    this.remoteStream = null;

    /** @type {HTMLAudioElement|null} 播放远端音频的 <audio> 元素 */
    this.remoteAudio = null;

    /** @type {string|null} 对端 socket ID */
    this.targetId = null;

    /** @type {boolean} 是否为发起方（创建 Offer 的一方） */
    this.isInitiator = false;

    /** @type {Function|null} 状态变化回调，由外部设置 */
    this.onStatusChange = null;

    /**
     * WebRTC 配置
     * STUN 服务器用于获取公网 IP（NAT 穿透）
     * 局域网/本机测试无需 TURN 服务器
     */
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    // 注册信令事件监听
    this._setupSignaling();
  }

  /**
   * 初始化麦克风
   * 会弹出浏览器权限请求对话框
   * @returns {Promise<boolean>} 是否成功获取麦克风
   */
  async init() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this._updateStatus('mic-ready');
      return true;
    } catch (err) {
      console.error('[语音] 获取麦克风失败:', err);
      this._updateStatus('mic-error');
      return false;
    }
  }

  /**
   * 加入语音频道
   * 获取麦克风后通知服务端，等待对端就绪
   */
  async joinVoice() {
    if (!this.localStream) {
      const ok = await this.init();
      if (!ok) return;
    }

    // 通知服务端语音就绪
    this.network.voiceReady();
    this._updateStatus('waiting');
  }

  /**
   * 创建 RTCPeerConnection 并添加本地音频轨道
   * @param {string} targetId - 对端 socket ID
   */
  _createPeerConnection(targetId) {
    this.targetId = targetId;
    this.peerConnection = new RTCPeerConnection(this.config);

    // ── 添加本地音频轨道到连接 ──
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // ── 接收远端音频流 ──
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this._playRemoteAudio();
      this._updateStatus('connected');
    };

    // ── ICE Candidate 事件 ──
    // 每发现一个网络路径就发送给对端
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.network.sendRtcIceCandidate(event.candidate, this.targetId);
      }
    };

    // ── 连接状态变化 ──
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[语音] 连接状态:', state);
      if (state === 'connected') {
        this._updateStatus('connected');
      } else if (state === 'disconnected' || state === 'failed') {
        this._updateStatus('disconnected');
      }
    };
  }

  /**
   * 发起通话（创建 SDP Offer）
   * 由帮助者端在双方都 voiceReady 后调用
   *
   * @param {string} targetId - 对端 socket ID
   */
  async createOffer(targetId) {
    this._createPeerConnection(targetId);
    this.isInitiator = true;

    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      // 通过 Socket.IO 将 Offer 发送给对端
      this.network.sendRtcOffer(offer, targetId);
      this._updateStatus('calling');
    } catch (err) {
      console.error('[语音] 创建 Offer 失败:', err);
    }
  }

  /**
   * 处理收到的 SDP Offer（盲人端）
   * 设置远端描述，创建 Answer 并发回
   *
   * @param {RTCSessionDescriptionInit} offer
   * @param {string} senderId - 发送者 socket ID
   */
  async handleOffer(offer, senderId) {
    this._createPeerConnection(senderId);
    this.isInitiator = false;

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.network.sendRtcAnswer(answer, senderId);
    } catch (err) {
      console.error('[语音] 处理 Offer 失败:', err);
    }
  }

  /**
   * 处理收到的 SDP Answer（帮助者端）
   * @param {RTCSessionDescriptionInit} answer
   */
  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('[语音] 处理 Answer 失败:', err);
    }
  }

  /**
   * 处理收到的 ICE Candidate
   * @param {RTCIceCandidateInit} candidate
   */
  async handleIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[语音] 添加 ICE Candidate 失败:', err);
    }
  }

  /**
   * 播放远端音频
   * 创建一个隐藏的 <audio> 元素，绑定远端音频流
   */
  _playRemoteAudio() {
    if (!this.remoteAudio) {
      this.remoteAudio = document.createElement('audio');
      this.remoteAudio.autoplay = true;
      document.body.appendChild(this.remoteAudio);
    }
    this.remoteAudio.srcObject = this.remoteStream;
  }

  /**
   * 注册 Socket.IO 信令事件监听
   * 将信令事件路由到对应的 WebRTC 处理方法
   */
  _setupSignaling() {
    // 对端语音模块就绪（仅日志记录）
    this.network.on('voicePeerReady', ({ peerId }) => {
      console.log('[语音] 对端就绪:', peerId);
    });

    // 服务端指示创建 Offer（帮助者端收到）
    this.network.on('createOffer', ({ targetId }) => {
      this.createOffer(targetId);
    });

    // 收到对端的 Offer（盲人端收到）
    this.network.on('rtcOffer', ({ offer, senderId }) => {
      this.handleOffer(offer, senderId);
    });

    // 收到对端的 Answer（帮助者端收到）
    this.network.on('rtcAnswer', ({ answer }) => {
      this.handleAnswer(answer);
    });

    // 收到对端的 ICE Candidate
    this.network.on('rtcIceCandidate', ({ candidate }) => {
      this.handleIceCandidate(candidate);
    });
  }

  /**
   * 通知外部状态变化
   * @param {string} status - 状态标识
   */
  _updateStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * 关闭语音通话
   * 释放所有资源（PeerConnection、音频流、DOM 元素）
   */
  close() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.remoteAudio) {
      this.remoteAudio.remove();
      this.remoteAudio = null;
    }
    this._updateStatus('closed');
  }
}
