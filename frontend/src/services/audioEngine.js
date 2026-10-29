import { calculateVolume, calculatePan } from "../utils/audioCalculations";
import { calculateDistance } from "../utils/distance";

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
      try {
        // Use 'balanced' latency hint without forcing sampleRate so Windows WASAPI
        // avoids tiny-buffer underruns and sample rate mismatch crackling/dropouts.
        this.audioContext = new AudioCtx({ latencyHint: "balanced" });
      } catch (_) {
        this.audioContext = new AudioCtx();
      }
      this.bindUserGestureResume();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  bindUserGestureResume() {
    if (typeof window === "undefined") return;
    const resumeHandler = () => {
      if (this.audioContext && this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }
    };
    window.addEventListener("click", resumeHandler);
    window.addEventListener("keydown", resumeHandler);
    window.addEventListener("touchstart", resumeHandler);
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
    // requires an active HTMLAudioElement in the DOM so Chrome's WebRTC audio renderer
    // does not throttle or silence the stream.
    let keepAliveAudio = null;
    if (typeof document !== "undefined") {
      try {
        let container = document.getElementById("proxispeak-audio-keepalive");
        if (!container) {
          container = document.createElement("div");
          container.id = "proxispeak-audio-keepalive";
          container.style.position = "fixed";
          container.style.width = "0px";
          container.style.height = "0px";
          container.style.overflow = "hidden";
          container.style.pointerEvents = "none";
          container.setAttribute("aria-hidden", "true");
          document.body.appendChild(container);
        }
        keepAliveAudio = document.createElement("audio");
        keepAliveAudio.srcObject = mediaStream;
        keepAliveAudio.muted = true;
        keepAliveAudio.playsInline = true;
        keepAliveAudio.autoplay = true;
        container.appendChild(keepAliveAudio);
        keepAliveAudio.play().then(() => {
          // Once playing, set muted = false and volume = 0 to prevent Chrome
          // from flagging the stream as silent and deprioritizing its decoder.
          if (keepAliveAudio) {
            keepAliveAudio.muted = false;
            keepAliveAudio.volume = 0;
          }
        }).catch(() => {});
      } catch (_) {}
    }

    const sourceNode = ctx.createMediaStreamSource(mediaStream);
    const gainNode = ctx.createGain();
    const pannerNode = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;

    // Initial gain is 0; spatial update loop will smoothly set to distance attenuation
    gainNode.gain.value = 0;

    // Connect directly to destination for clean, transparent speech.
    // Avoids aggressive compression that pumps speech and breaks syllables in the middle.
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
      currentGain: 0,
      currentPan: 0,
    };
    this.peerNodes.set(peerId, entry);
    return entry;
  }

  updatePeerSpatialParams(peerId, localUser, remoteUser, distance, audioRadius = 100) {
    const entry = this.peerNodes.get(peerId);
    if (!entry || !this.audioContext) return { gain: 0, pan: 0 };

    const isPeerMuted = Boolean(remoteUser && remoteUser.muted);
    const targetGain =
      this.speakerMuted || isPeerMuted ? 0 : calculateVolume(distance, audioRadius);
    const targetPan = calculatePan(localUser, remoteUser, audioRadius);

    const now = this.audioContext.currentTime;

    // Use setTargetAtTime with exponential time constant (0.04s ~ 40ms)
    // for seamless, continuous parameter changes without clicking, zipper noise,
    // or audio buffer discontinuities at 60 FPS.
    // NEVER call cancelScheduledValues / setValueAtTime in 60 FPS loops, as that chops
    // active audio buffers and causes the voice to break in the middle!
    try {
      entry.gainNode.gain.setTargetAtTime(targetGain, now, 0.04);
      entry.currentGain = targetGain;
    } catch (_) {
      entry.gainNode.gain.value = targetGain;
    }

    if (entry.pannerNode) {
      try {
        entry.pannerNode.pan.setTargetAtTime(targetPan, now, 0.04);
        entry.currentPan = targetPan;
      } catch (_) {
        entry.pannerNode.pan.value = targetPan;
      }
    }

    return { gain: targetGain, pan: targetPan };
  }

  updateAllSpatialParams(localUser, remoteUsers, audioRadius = 100) {
    if (!localUser || !Array.isArray(remoteUsers) || this.peerNodes.size === 0) return;
    for (const remote of remoteUsers) {
      if (!remote || !remote.id) continue;
      const distance = calculateDistance(localUser, remote);
      this.updatePeerSpatialParams(remote.id, localUser, remote, distance, audioRadius);
    }
  }

  setSpeakerMuted(muted) {
    this.speakerMuted = Boolean(muted);
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    for (const entry of this.peerNodes.values()) {
      if (this.speakerMuted) {
        entry.currentGain = 0;
        try {
          entry.gainNode.gain.setTargetAtTime(0, now, 0.02);
        } catch (_) {
          entry.gainNode.gain.value = 0;
        }
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
        if (entry.keepAliveAudio.parentNode) {
          entry.keepAliveAudio.parentNode.removeChild(entry.keepAliveAudio);
        }
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
