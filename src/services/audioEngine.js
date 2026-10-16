import { calculateVolume, calculatePan } from "../utils/audioCalculations";

/**
 * Manages the Web Audio API graph for each remote peer:
 * MediaStreamAudioSourceNode -> GainNode -> StereoPannerNode -> AudioDestinationNode
 * Includes the Chromium muted HTMLAudioElement keep-alive workaround so remote WebRTC
 * streams never play silence in Chrome/Edge.
 */
class SpatialAudioEngine {
  constructor() {
    this.audioContext = null;
    this.peerNodes = new Map();
    this.speakerMuted = false;
  }

  ensureContext() {
    if (typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.audioContext) {
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  attachRemoteStream(peerId, mediaStream) {
    const ctx = this.ensureContext();
    if (!ctx || !mediaStream) return null;

    // If an entry already exists for this peer, replace only if the stream changed
    if (this.peerNodes.has(peerId)) {
      const existing = this.peerNodes.get(peerId);
      if (existing.stream === mediaStream) {
        return existing;
      }
      this.removePeer(peerId);
    }

    // Chrome/Chromium workaround: createMediaStreamSource on a remote WebRTC stream
    // produces silence unless the stream is also attached to a muted HTMLAudioElement.
    let keepAliveAudio = null;
    if (typeof Audio !== "undefined") {
      try {
        keepAliveAudio = new Audio();
        keepAliveAudio.srcObject = mediaStream;
        keepAliveAudio.muted = true;
        keepAliveAudio.playsInline = true;
        keepAliveAudio.play().catch(() => {});
      } catch (_) {}
    }

    const sourceNode = ctx.createMediaStreamSource(mediaStream);
    const gainNode = ctx.createGain();
    const pannerNode = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;

    gainNode.gain.value = this.speakerMuted ? 0 : 1;

    if (pannerNode) {
      pannerNode.pan.value = 0;
      sourceNode.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(ctx.destination);
    } else {
      sourceNode.connect(gainNode);
      gainNode.connect(ctx.destination);
    }

    const entry = {
      peerId,
      sourceNode,
      gainNode,
      pannerNode,
      stream: mediaStream,
      keepAliveAudio,
    };
    this.peerNodes.set(peerId, entry);
    return entry;
  }

  updatePeerSpatialParams(peerId, localUser, remoteUser, distance, audioRadius = 100) {
    const entry = this.peerNodes.get(peerId);
    const isPeerMuted = Boolean(remoteUser && remoteUser.muted);
    const targetGain =
      this.speakerMuted || isPeerMuted ? 0 : calculateVolume(distance, audioRadius);
    const targetPan = calculatePan(localUser, remoteUser, audioRadius);

    if (entry && this.audioContext) {
      const now = this.audioContext.currentTime;
      entry.gainNode.gain.setTargetAtTime(targetGain, now, 0.05);
      if (entry.pannerNode) {
        entry.pannerNode.pan.setTargetAtTime(targetPan, now, 0.05);
      }
    }

    return { gain: targetGain, pan: targetPan };
  }

  setSpeakerMuted(muted) {
    this.speakerMuted = Boolean(muted);
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    for (const entry of this.peerNodes.values()) {
      if (this.speakerMuted) {
        entry.gainNode.gain.setTargetAtTime(0, now, 0.04);
      }
    }
  }

  removePeer(peerId) {
    const entry = this.peerNodes.get(peerId);
    if (!entry) return;
    try {
      if (entry.keepAliveAudio) {
        entry.keepAliveAudio.pause();
        entry.keepAliveAudio.srcObject = null;
      }
      entry.sourceNode.disconnect();
      entry.gainNode.disconnect();
      if (entry.pannerNode) entry.pannerNode.disconnect();
    } catch (_) {}
    this.peerNodes.delete(peerId);
  }

  cleanupAll() {
    for (const peerId of Array.from(this.peerNodes.keys())) {
      this.removePeer(peerId);
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
  }
}

export const audioEngine = new SpatialAudioEngine();
