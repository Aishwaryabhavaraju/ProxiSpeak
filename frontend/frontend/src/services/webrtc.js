import { audioEngine } from "./audioEngine";

function getIceServers() {
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_ICE_SERVERS
  ) {
    try {
      return JSON.parse(import.meta.env.VITE_ICE_SERVERS);
    } catch (_) {}
  }
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];
}

/**
 * Injects Opus In-Band Forward Error Correction (FEC), optimal packet time,
 * and high-fidelity speech bitrate to eliminate voice breaking under jitter.
 */
function optimizeOpusSdp(sdp) {
  if (!sdp || typeof sdp !== "string") return sdp;

  const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!opusMatch) return sdp;

  const payloadType = opusMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${payloadType}\\s+(.*)`, "i");
  const desiredParams =
    "minptime=10;ptime=20;useinbandfec=1;maxaveragebitrate=64000;stereo=0;sprop-stereo=0;cbr=0;usedtx=0";

  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_, existingParams) => {
      const paramMap = new Map();
      existingParams.split(";").forEach((pair) => {
        const [k, v] = pair.trim().split("=");
        if (k) paramMap.set(k.toLowerCase(), v);
      });
      desiredParams.split(";").forEach((pair) => {
        const [k, v] = pair.trim().split("=");
        if (k) paramMap.set(k.toLowerCase(), v);
      });
      const merged = Array.from(paramMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(";");
      return `a=fmtp:${payloadType} ${merged}`;
    });
  }

  return sdp.replace(
    new RegExp(`(a=rtpmap:${payloadType}\\s+opus\\/48000[^\\r\\n]*[\\r\\n]+)`, "i"),
    `$1a=fmtp:${payloadType} ${desiredParams}\r\n`
  );
}

/**
 * Enterprise Multi-User WebRTC Manager implementing:
 * - W3C Perfect Negotiation Pattern (deterministic polite/impolite glare handling)
 * - Immediate trickle ICE candidate dispatch & pre-remoteDescription queuing
 * - Dynamic audio track addition & transceiver direction switching
 * - In-Band FEC Opus SDP transformation
 * - Real-time RTCPeerConnection getStats() performance telemetry
 */
class WebRTCManager {
  constructor() {
    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.makingOffer = new Map(); // peerId -> boolean
    this.ignoreOffer = new Map(); // peerId -> boolean
    this.isSettingRemoteAnswerPending = new Map(); // peerId -> boolean
    this.pendingCandidates = new Map(); // peerId -> Array<RTCIceCandidateInit>
    this.peerStatsCache = new Map(); // peerId -> { prevBytes, prevTimestamp, stats }
    this.localStream = null;
    this.localUserId = null;
    this.socket = null;
    this.onPeerStateChange = null;
  }

  initialize(socketInstance, localUserId, onPeerStateChange) {
    this.socket = socketInstance;
    this.localUserId = localUserId || (socketInstance ? socketInstance.id : null);
    this.onPeerStateChange = onPeerStateChange;
  }

  setLocalUserId(userId) {
    if (userId) {
      this.localUserId = userId;
    }
  }

  /**
   * Sets or replaces the local microphone stream across all active peer connections.
   * If peer connections already have audio senders, replaces track with 0ms renegotiation delay!
   */
  setLocalStream(stream) {
    this.localStream = stream;
    const audioTrack = stream ? stream.getAudioTracks()[0] : null;

    for (const [peerId, pc] of this.peers.entries()) {
      if (!pc || pc.connectionState === "closed") continue;

      const senders = pc.getSenders();
      const existingSender = senders.find(
        (s) => s.track && s.track.kind === "audio"
      );

      if (audioTrack) {
        if (existingSender) {
          // Instant track swap with 0ms renegotiation overhead
          existingSender.replaceTrack(audioTrack).catch((err) => {
            console.warn(`[WebRTC] replaceTrack error for ${peerId}:`, err);
          });
        } else {
          // Look for an existing transceiver in recvonly mode
          const transceivers = pc.getTransceivers();
          const audioTransceiver = transceivers.find(
            (t) => t.receiver && t.receiver.track && t.receiver.track.kind === "audio"
          );

          if (audioTransceiver) {
            audioTransceiver.direction = "sendrecv";
            audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
          } else {
            pc.addTrack(audioTrack, stream);
          }
        }
      } else {
        // Microphone stopped
        if (existingSender) {
          existingSender.replaceTrack(null).catch(() => {});
        }
      }
    }
  }

  /**
   * Mutes or unmutes all outgoing audio tracks without renegotiating.
   */
  setLocalMuted(muted) {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  /**
   * Creates or returns an RTCPeerConnection for the given peerId.
   * Employs W3C Perfect Negotiation for offer/answer management.
   */
  createPeerConnection(peerId, isInitiator = false) {
    if (!peerId || peerId === this.localUserId) return null;

    if (this.peers.has(peerId)) {
      const existing = this.peers.get(peerId);
      if (
        existing &&
        existing.connectionState !== "closed" &&
        existing.connectionState !== "failed"
      ) {
        return existing;
      }
      this.closePeer(peerId);
    }

    if (typeof window === "undefined" || !window.RTCPeerConnection) {
      return null;
    }

    const pc = new window.RTCPeerConnection({ iceServers: getIceServers() });
    this.peers.set(peerId, pc);
    this.makingOffer.set(peerId, false);
    this.ignoreOffer.set(peerId, false);
    this.isSettingRemoteAnswerPending.set(peerId, false);

    // Deterministic polite assignment: exactly one peer is polite per peer pair!
    const polite = String(this.localUserId || "") < String(peerId);

    // 1. Add local track if mic enabled, or add recvonly transceiver so incoming audio is always negotiated
    if (this.localStream && this.localStream.getAudioTracks().length > 0) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    // 2. W3C Perfect Negotiation onnegotiationneeded handler
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer.set(peerId, true);
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        if (pc.signalingState !== "stable") return;

        // Apply Opus In-Band FEC & audio bitrate optimizations
        const optimizedSdp = optimizeOpusSdp(offer.sdp);
        await pc.setLocalDescription({ type: offer.type, sdp: optimizedSdp });

        if (this.socket && this.socket.connected) {
          this.socket.emit("webrtc-offer", {
            targetUserId: peerId,
            targetId: peerId,
            fromId: this.localUserId,
            fromUserId: this.localUserId,
            sdp: pc.localDescription,
          });
        }
      } catch (err) {
        console.error(`[WebRTC] Error during negotiation with ${peerId}:`, err);
      } finally {
        this.makingOffer.set(peerId, false);
      }
    };

    // 3. Trickle ICE candidate emission
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.socket.connected) {
        this.socket.emit("webrtc-ice-candidate", {
          targetUserId: peerId,
          targetId: peerId,
          fromId: this.localUserId,
          fromUserId: this.localUserId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    // 4. Remote track received -> Route directly to 3D Spatial Audio Engine
    pc.ontrack = (event) => {
      const remoteStream =
        (event.streams && event.streams[0]) || new MediaStream([event.track]);
      audioEngine.attachRemoteStream(peerId, remoteStream);

      // Handle track lifecycle events for robust audio continuity
      event.track.onmute = () => {
        // Track temporarily muted (e.g. transient network pause) — Web Audio graph remains attached
        console.log(`[WebRTC] Track muted for ${peerId}`);
      };
      event.track.onunmute = () => {
        // Track unmuted — Web Audio MediaStreamAudioSourceNode outputs sound automatically without re-attaching
        console.log(`[WebRTC] Track unmuted for ${peerId}`);
      };
      event.track.onended = () => {
        console.log(`[WebRTC] Track ended for ${peerId}`);
        audioEngine.removePeer(peerId);
      };
    };

    // 5. Connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (this.onPeerStateChange) {
        this.onPeerStateChange(peerId, state);
      }
      if (state === "failed") {
        console.warn(`[WebRTC] Connection failed with ${peerId}, scheduling ICE restart...`);
        // 2s backoff prevents rapid restart loops on persistent network issues
        setTimeout(() => {
          if (pc.connectionState === "failed") {
            pc.restartIce?.();
          }
        }, 2000);
      } else if (state === "closed") {
        audioEngine.removePeer(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        setTimeout(() => {
          if (pc.iceConnectionState === "failed") {
            pc.restartIce?.();
          }
        }, 2000);
      }
    };

    // If explicit initiator and currently stable, negotiationneeded will trigger,
    // or manual trigger if signaling state permits
    if (isInitiator && pc.signalingState === "stable") {
      this.initiateOffer(peerId, pc);
    }

    return pc;
  }

  async initiateOffer(peerId, pc) {
    if (this.makingOffer.get(peerId)) return;
    if (pc.signalingState !== "stable") return;

    try {
      this.makingOffer.set(peerId, true);
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      if (pc.signalingState !== "stable") return;

      const optimizedSdp = optimizeOpusSdp(offer.sdp);
      await pc.setLocalDescription({ type: offer.type, sdp: optimizedSdp });

      if (this.socket && this.socket.connected) {
        this.socket.emit("webrtc-offer", {
          targetUserId: peerId,
          targetId: peerId,
          fromId: this.localUserId,
          fromUserId: this.localUserId,
          sdp: pc.localDescription,
        });
      }
    } catch (err) {
      console.error(`[WebRTC] Failed to initiate offer for ${peerId}:`, err);
    } finally {
      this.makingOffer.set(peerId, false);
    }
  }

  /**
   * Handles incoming SDP offer with W3C Perfect Negotiation Glare Resolution.
   */
  async handleIncomingOffer({ fromId, fromUserId, senderUserId, sdp }) {
    const peerId = fromUserId || senderUserId || fromId;
    if (!peerId || !sdp || peerId === this.localUserId) return;

    const pc = this.createPeerConnection(peerId, false);
    if (!pc) return;

    const polite = String(this.localUserId || "") < String(peerId);

    try {
      const isOffer = sdp.type === "offer";
      const readyForOffer =
        !this.makingOffer.get(peerId) &&
        (pc.signalingState === "stable" ||
          this.isSettingRemoteAnswerPending.get(peerId));
      const offerCollision = isOffer && !readyForOffer;

      this.ignoreOffer.set(peerId, !polite && offerCollision);
      if (this.ignoreOffer.get(peerId)) {
        console.warn(
          `[WebRTC] Impolite peer ignoring offer collision from ${peerId}`
        );
        return;
      }

      const description = new window.RTCSessionDescription({
        type: sdp.type,
        sdp: optimizeOpusSdp(sdp.sdp),
      });

      if (offerCollision) {
        await Promise.all([
          pc.setLocalDescription({ type: "rollback" }),
          pc.setRemoteDescription(description),
        ]);
      } else {
        await pc.setRemoteDescription(description);
      }
      await this.flushPendingCandidates(peerId, pc);

      if (isOffer) {
        const answer = await pc.createAnswer();
        const optimizedAnswerSdp = optimizeOpusSdp(answer.sdp);
        await pc.setLocalDescription({
          type: answer.type,
          sdp: optimizedAnswerSdp,
        });

        if (this.socket && this.socket.connected) {
          this.socket.emit("webrtc-answer", {
            targetUserId: peerId,
            targetId: peerId,
            fromId: this.localUserId,
            fromUserId: this.localUserId,
            sdp: pc.localDescription,
          });
        }
      }
    } catch (err) {
      console.error(`[WebRTC] Error handling incoming offer from ${peerId}:`, err);
    }
  }

  /**
   * Handles incoming SDP answer.
   */
  async handleIncomingAnswer({ fromId, fromUserId, senderUserId, sdp }) {
    const peerId = fromUserId || senderUserId || fromId;
    const pc = this.peers.get(peerId);
    if (!pc || !sdp) return;

    try {
      this.isSettingRemoteAnswerPending.set(peerId, true);
      const description = new window.RTCSessionDescription({
        type: sdp.type,
        sdp: optimizeOpusSdp(sdp.sdp),
      });

      await pc.setRemoteDescription(description);
      this.isSettingRemoteAnswerPending.set(peerId, false);
      await this.flushPendingCandidates(peerId, pc);
    } catch (err) {
      console.error(`[WebRTC] Error handling incoming answer from ${peerId}:`, err);
    } finally {
      this.isSettingRemoteAnswerPending.set(peerId, false);
    }
  }

  /**
   * Handles incoming trickle ICE candidates. Queues candidate if remote description is not set yet.
   */
  async handleIncomingIceCandidate({ fromId, fromUserId, senderUserId, candidate }) {
    const peerId = fromUserId || senderUserId || fromId;
    if (!peerId || !candidate) return;

    const pc = this.peers.get(peerId);
    if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
      const queue = this.pendingCandidates.get(peerId) || [];
      queue.push(candidate);
      this.pendingCandidates.set(peerId, queue);
      return;
    }

    try {
      await pc.addIceCandidate(new window.RTCIceCandidate(candidate));
    } catch (err) {
      if (!this.ignoreOffer.get(peerId)) {
        // Duplicate or discarded candidate warnings can be safely ignored
      }
    }
  }

  async flushPendingCandidates(peerId, pc) {
    const queue = this.pendingCandidates.get(peerId) || [];
    this.pendingCandidates.delete(peerId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new window.RTCIceCandidate(candidate));
      } catch (_) {}
    }
  }

  /**
   * Disposes an individual peer connection and cleans up all related resources.
   */
  closePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      try {
        pc.close();
      } catch (_) {}
      this.peers.delete(peerId);
    }

    this.makingOffer.delete(peerId);
    this.ignoreOffer.delete(peerId);
    this.isSettingRemoteAnswerPending.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.peerStatsCache.delete(peerId);

    audioEngine.removePeer(peerId);

    if (this.onPeerStateChange) {
      this.onPeerStateChange(peerId, "closed");
    }
  }

  closeAll() {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
  }

  /**
   * Phase 7 Telemetry: Queries real WebRTC stats from RTCPeerConnection.getStats().
   */
  async getPeerStats(peerId) {
    const pc = this.peers.get(peerId);
    if (!pc || pc.connectionState === "closed") return null;

    try {
      const statsReport = await pc.getStats();
      let inboundAudio = null;
      let candidatePair = null;
      let remoteCandidate = null;
      let localCandidate = null;
      let codecInfo = null;

      for (const report of statsReport.values()) {
        if (report.type === "inbound-rtp" && report.kind === "audio") {
          inboundAudio = report;
        } else if (
          report.type === "candidate-pair" &&
          (report.state === "succeeded" || report.nominated)
        ) {
          candidatePair = report;
        } else if (report.type === "codec" && report.mimeType?.includes("opus")) {
          codecInfo = report;
        }
      }

      if (candidatePair) {
        localCandidate = statsReport.get(candidatePair.localCandidateId);
        remoteCandidate = statsReport.get(candidatePair.remoteCandidateId);
      }

      // Bitrate calculation
      const cache = this.peerStatsCache.get(peerId) || {
        prevBytes: 0,
        prevTimestamp: 0,
      };
      const now = inboundAudio?.timestamp || performance.now();
      let bitrateKbps = 0;
      if (inboundAudio && cache.prevBytes > 0 && now > cache.prevTimestamp) {
        const deltaBytes = inboundAudio.bytesReceived - cache.prevBytes;
        const deltaTime = (now - cache.prevTimestamp) / 1000;
        bitrateKbps = Number(((deltaBytes * 8) / (deltaTime * 1000)).toFixed(1));
      }

      if (inboundAudio) {
        this.peerStatsCache.set(peerId, {
          prevBytes: inboundAudio.bytesReceived || 0,
          prevTimestamp: now,
        });
      }

      // Candidate type evaluation (host / srflx = Direct, relay = TURN)
      const candType =
        remoteCandidate?.candidateType || localCandidate?.candidateType || "host";
      const connectionType = candType === "relay" ? "TURN Relay" : "Direct (P2P/STUN)";

      // Jitter buffer delay in ms
      let jitterBufferDelayMs = 0;
      if (
        inboundAudio &&
        typeof inboundAudio.jitterBufferDelay === "number" &&
        inboundAudio.jitterBufferEmittedCount > 0
      ) {
        jitterBufferDelayMs = Number(
          (
            (inboundAudio.jitterBufferDelay /
              inboundAudio.jitterBufferEmittedCount) *
            1000
          ).toFixed(1)
        );
      }

      const spatialInfo = audioEngine.getPeerSpatialInfo(peerId);

      return {
        peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        connectionType,
        codec: codecInfo ? `${codecInfo.mimeType} (${codecInfo.clockRate}Hz)` : "Opus 48kHz",
        rtt: candidatePair?.currentRoundTripTime
          ? Number((candidatePair.currentRoundTripTime * 1000).toFixed(1))
          : 0,
        jitter: inboundAudio?.jitter
          ? Number((inboundAudio.jitter * 1000).toFixed(1))
          : 0,
        packetsLost: inboundAudio?.packetsLost || 0,
        jitterBufferDelay: jitterBufferDelayMs,
        bitrate: bitrateKbps,
        audioTrackState: inboundAudio ? "receiving" : "waiting",
        spatialInfo,
      };
    } catch (err) {
      console.warn(`[WebRTC] Failed to get stats for ${peerId}:`, err);
      return null;
    }
  }

  async getAllPeerStats() {
    const results = [];
    for (const peerId of this.peers.keys()) {
      const stats = await this.getPeerStats(peerId);
      if (stats) results.push(stats);
    }
    return results;
  }
}

export const webrtcManager = new WebRTCManager();
