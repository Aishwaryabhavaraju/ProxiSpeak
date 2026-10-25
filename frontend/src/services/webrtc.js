import { audioEngine } from "./audioEngine";

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Manages RTCPeerConnection lifecycle, deterministic offer initiation,
 * mid-session track renegotiation (`onnegotiationneeded`), and ICE candidate queuing.
 */
class WebRTCManager {
  constructor() {
    this.peers = new Map();
    this.makingOffer = new Map();
    this.pendingCandidates = new Map();
    this.localStream = null;
    this.socket = null;
    this.onPeerStateChange = null;
  }

  initialize(socketInstance, onPeerStateChange) {
    this.socket = socketInstance;
    this.onPeerStateChange = onPeerStateChange;
  }

  setLocalStream(stream) {
    this.localStream = stream;
    for (const [peerId, pc] of this.peers.entries()) {
      const senders = pc.getSenders();
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          const existing = senders.find((s) => s.track && s.track.kind === "audio");
          if (existing) {
            existing.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
            // Adding a track triggers pc.onnegotiationneeded automatically,
            // or we explicitly renegotiate if already stable.
            if (pc.signalingState === "stable") {
              this.initiateOffer(peerId, pc);
            }
          }
        }
      }
    }
  }

  createPeerConnection(peerId, isInitiator = false) {
    if (!peerId) return null;
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId);
    }
    if (typeof window === "undefined" || !window.RTCPeerConnection) {
      return null;
    }

    const pc = new window.RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
    this.peers.set(peerId, pc);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // Renegotiation handler when tracks are added after connection is open
    pc.onnegotiationneeded = async () => {
      if (!isInitiator && pc.remoteDescription === null) return;
      await this.initiateOffer(peerId, pc);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.socket.connected) {
        this.socket.emit("webrtc-ice-candidate", {
          targetId: peerId,
          fromId: this.socket.id,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream =
        (event.streams && event.streams[0]) || new MediaStream([event.track]);
      audioEngine.attachRemoteStream(peerId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (this.onPeerStateChange) {
        this.onPeerStateChange(peerId, pc.connectionState);
      }
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        audioEngine.removePeer(peerId);
      }
    };

    if (isInitiator) {
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
      await pc.setLocalDescription(offer);
      if (this.socket && this.socket.connected) {
        this.socket.emit("webrtc-offer", {
          targetId: peerId,
          fromId: this.socket.id,
          sdp: pc.localDescription,
        });
      }
    } catch (err) {
      console.error("Failed to create WebRTC offer:", err);
    } finally {
      this.makingOffer.set(peerId, false);
    }
  }

  async handleIncomingOffer({ fromId, sdp }) {
    if (!fromId || !sdp) return;
    const pc = this.createPeerConnection(fromId, false);
    if (!pc) return;
    try {
      const offerCollision =
        this.makingOffer.get(fromId) || pc.signalingState !== "stable";
      const polite = String(this.socket?.id || "") > String(fromId);
      if (offerCollision && !polite) {
        return;
      }
      await pc.setRemoteDescription(new window.RTCSessionDescription(sdp));
      await this.flushPendingCandidates(fromId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (this.socket && this.socket.connected) {
        this.socket.emit("webrtc-answer", {
          targetId: fromId,
          fromId: this.socket.id,
          sdp: pc.localDescription,
        });
      }
    } catch (err) {
      console.error("Error handling incoming WebRTC offer:", err);
    }
  }

  async handleIncomingAnswer({ fromId, sdp }) {
    const pc = this.peers.get(fromId);
    if (!pc || !sdp) return;
    try {
      await pc.setRemoteDescription(new window.RTCSessionDescription(sdp));
      await this.flushPendingCandidates(fromId, pc);
    } catch (err) {
      console.error("Error handling WebRTC answer:", err);
    }
  }

  async handleIncomingIceCandidate({ fromId, candidate }) {
    if (!fromId || !candidate) return;
    const pc = this.peers.get(fromId);
    if (!pc || !pc.remoteDescription) {
      const queue = this.pendingCandidates.get(fromId) || [];
      queue.push(candidate);
      this.pendingCandidates.set(fromId, queue);
      return;
    }
    try {
      await pc.addIceCandidate(new window.RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
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

  closePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (_) {}
      this.peers.delete(peerId);
    }
    this.makingOffer.delete(peerId);
    this.pendingCandidates.delete(peerId);
    audioEngine.removePeer(peerId);
  }

  closeAll() {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
  }
}

export const webrtcManager = new WebRTCManager();
