import { calculateVolume, calculatePan } from "../utils/audioCalculations";
import { calculateDistance } from "../utils/distance";

/**
 * High-Fidelity 3D Spatial Audio Engine using the Web Audio API.
 *
 * Audio Pipeline per remote participant:
 *   MediaStreamTrack -> MediaStreamAudioSourceNode -> GainNode -> PannerNode (HRTF) -> AudioDestinationNode
 *
 * Spatial Model:
 *   - AudioListener positioned at local avatar coordinates (localUser.x, 0, localUser.y).
 *   - Remote PannerNode positioned at (remoteUser.x, 0, remoteUser.y).
 *   - HRTF (Head-Related Transfer Function) panning model for realistic 3D binaural audio.
 *   - Inverse distance model with smooth GainNode attenuation and hard cutoff beyond audioRadius.
 *   - Chromium keep-alive element prevents RTP stream throttling without duplicate playback.
 */
class SpatialAudioEngine {
  constructor() {
    this.audioContext = null;
    this.peerNodes = new Map();
    this.speakerMuted = false;
    this.keepAliveContainer = null;
    this.unlocked = false;
  }

  /**
   * Initializes or returns the shared AudioContext singleton.
   * Uses balanced latency to prevent underruns on Windows WASAPI and macOS CoreAudio.
   */
  ensureContext() {
    if (typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.audioContext || this.audioContext.state === "closed") {
      try {
        this.audioContext = new AudioCtx({ latencyHint: "interactive" });
      } catch (_) {
        this.audioContext = new AudioCtx();
      }
      this.audioContext.onstatechange = () => {
        if (this.audioContext && this.audioContext.state === "suspended" && this.unlocked) {
          this.audioContext.resume().catch(() => {});
        }
      };
      this.bindUserGestureResume();
    }

    if (this.audioContext.state === "suspended") {
      this.resumeContext();
    }

    return this.audioContext;
  }

  /**
   * Unlocks the browser AudioContext on user interaction (autoplay policy compliant).
   */
  bindUserGestureResume() {
    if (typeof window === "undefined" || this.unlocked) return;

    const resumeHandler = () => {
      this.resumeContext();
    };

    window.addEventListener("click", resumeHandler, { passive: true });
    window.addEventListener("keydown", resumeHandler, { passive: true });
    window.addEventListener("touchstart", resumeHandler, { passive: true });
    window.addEventListener("mousedown", resumeHandler, { passive: true });
  }

  resumeContext() {
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext
        .resume()
        .then(() => {
          this.unlocked = true;
        })
        .catch(() => {});
    }
  }

  getAudioContextState() {
    if (!this.audioContext) return "uninitialized";
    return this.audioContext.state;
  }

  getAudioContextInfo() {
    if (!this.audioContext) {
      return {
        state: "uninitialized",
        sampleRate: 0,
        baseLatency: 0,
        outputLatency: 0,
      };
    }
    return {
      state: this.audioContext.state,
      sampleRate: this.audioContext.sampleRate,
      baseLatency: Number(((this.audioContext.baseLatency || 0) * 1000).toFixed(1)),
      outputLatency: Number(((this.audioContext.outputLatency || 0) * 1000).toFixed(1)),
    };
  }

  /**
   * Updates AudioListener position & orientation to match the local avatar.
   */
  updateListenerPosition(localUser) {
    const ctx = this.ensureContext();
    if (!ctx || !localUser || !ctx.listener) return;

    const x = typeof localUser.x === "number" ? localUser.x : 0;
    const z = typeof localUser.y === "number" ? localUser.y : 0;
    const angle = typeof localUser.direction === "number" ? localUser.direction : -Math.PI / 2;

    // Avoid churning Web Audio automation queue if listener position and angle are unchanged
    if (
      this.lastListenerX !== undefined &&
      Math.abs(this.lastListenerX - x) < 0.25 &&
      Math.abs(this.lastListenerZ - z) < 0.25 &&
      Math.abs(this.lastListenerAngle - angle) < 0.01
    ) {
      return;
    }
    this.lastListenerX = x;
    this.lastListenerZ = z;
    this.lastListenerAngle = angle;

    const now = ctx.currentTime;
    const timeConstant = 0.04;

    const listener = ctx.listener;

    // Position (X = horizontal, Y = 0 elevation, Z = depth)
    if (listener.positionX && listener.positionX.setTargetAtTime) {
      listener.positionX.setTargetAtTime(x, now, timeConstant);
      listener.positionY.setTargetAtTime(0, now, timeConstant);
      listener.positionZ.setTargetAtTime(z, now, timeConstant);
    } else if (listener.setPosition) {
      listener.setPosition(x, 0, z);
    }

    // Forward orientation: default forward is -Z (towards top of canvas)
    // Map angle to forward unit vector (cos(a), 0, sin(a))
    const fwdX = Math.cos(angle);
    const fwdZ = Math.sin(angle);

    if (listener.forwardX && listener.forwardX.setTargetAtTime) {
      listener.forwardX.setTargetAtTime(fwdX, now, timeConstant);
      listener.forwardY.setTargetAtTime(0, now, timeConstant);
      listener.forwardZ.setTargetAtTime(fwdZ, now, timeConstant);
      listener.upX.setTargetAtTime(0, now, timeConstant);
      listener.upY.setTargetAtTime(1, now, timeConstant);
      listener.upZ.setTargetAtTime(0, now, timeConstant);
    } else if (listener.setOrientation) {
      listener.setOrientation(fwdX, 0, fwdZ, 0, 1, 0);
    }
  }

  /**
   * Attaches a remote WebRTC MediaStream into an independent 3D Web Audio graph for this peer.
   * Prevents duplicate node creation if the track or stream is already attached.
   */
  attachRemoteStream(peerId, mediaStream) {
    if (!peerId || !mediaStream) return null;
    const ctx = this.ensureContext();
    if (!ctx) return null;

    const audioTracks = mediaStream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) return null;

    const trackId = audioTracks[0].id;

    // If already active with the same track, avoid reconstructing the graph
    if (this.peerNodes.has(peerId)) {
      const existing = this.peerNodes.get(peerId);
      if (existing.trackId === trackId && existing.stream === mediaStream) {
        return existing;
      }
      this.removePeer(peerId);
    }

    // Chromium keep-alive audio element:
    // Guarantees Chromium WebRTC audio decoding pipeline remains active without playing silence.
    let keepAliveAudio = null;
    if (typeof document !== "undefined") {
      try {
        if (!this.keepAliveContainer) {
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
          this.keepAliveContainer = container;
        }

        keepAliveAudio = document.createElement("audio");
        keepAliveAudio.srcObject = mediaStream;
        keepAliveAudio.muted = true; // temporarily muted; set false after play() per Chromium requirement
        keepAliveAudio.playsInline = true;
        keepAliveAudio.autoplay = true;
        this.keepAliveContainer.appendChild(keepAliveAudio);
        // Chromium requires muted=false after play() to keep the RTP audio decoder pipeline active.
        // volume=0 prevents audible double-playback while satisfying the decoder activation requirement.
        keepAliveAudio.play().then(() => {
          if (keepAliveAudio) {
            keepAliveAudio.muted = false;
            keepAliveAudio.volume = 0;
          }
        }).catch(() => {});
      } catch (_) {}
    }

    // 1. MediaStreamAudioSourceNode
    const sourceNode = ctx.createMediaStreamSource(mediaStream);

    // 2. Individual GainNode for proximity volume and muting.
    // Initial gain is set to a safe non-zero value so audio is audible immediately on connection.
    // The spatial RAF loop will correct it within the first frame (~16ms).
    const gainNode = ctx.createGain();
    gainNode.gain.value = this.speakerMuted ? 0 : 0.8; // Safe default until spatial loop sets exact distance-based gain

    // 3. 3D PannerNode with HRTF (Head-Related Transfer Function) for spatial positioning only.
    // Distance attenuation is handled exclusively by the GainNode above to avoid double-attenuation.
    const pannerNode = ctx.createPanner();
    pannerNode.panningModel = "HRTF";
    pannerNode.distanceModel = "linear";
    pannerNode.refDistance = 1;
    pannerNode.maxDistance = 10000; // effectively disabled — GainNode controls attenuation
    pannerNode.rolloffFactor = 0;   // zero rolloff: PannerNode adds spatial position only, not gain
    pannerNode.coneInnerAngle = 360;
    pannerNode.coneOuterAngle = 360;
    pannerNode.coneOuterGain = 0;

    // Connect pipeline: source -> gain -> panner -> destination
    sourceNode.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(ctx.destination);

    const entry = {
      peerId,
      trackId,
      stream: mediaStream,
      sourceNode,
      gainNode,
      pannerNode,
      keepAliveAudio,
      currentGain: 0,
      currentPan: 0,
      distance: Infinity,
      posX: 0,
      posZ: 0,
    };

    this.peerNodes.set(peerId, entry);
    return entry;
  }

  /**
   * Updates genuine 3D spatial audio parameters for an individual remote peer.
   * Guarantees that updating one peer has ZERO effect on any other peer.
   */
  updatePeerSpatialParams(peerId, localUser, remoteUser, audioRadius = 100) {
    const entry = this.peerNodes.get(peerId);
    const ctx = this.audioContext;
    if (!entry || !ctx || !localUser || !remoteUser) {
      return { gain: 0, distance: Infinity, inEarshot: false };
    }

    const distance = calculateDistance(localUser, remoteUser);
    const isPeerMuted = Boolean(remoteUser.muted);
    const inEarshot = distance <= audioRadius;

    // Target gain: 0 if speaker is deafened, peer is muted, or outside audio radius
    const targetGain =
      this.speakerMuted || isPeerMuted || !inEarshot
        ? 0
        : calculateVolume(distance, audioRadius);

    const now = ctx.currentTime;
    const timeConstant = 0.04; // 40ms exponential smoothing prevents clicks and pops

    // 1. Smoothly update individual GainNode only when targetGain changes meaningfully
    if (Math.abs(entry.currentGain - targetGain) > 0.002) {
      try {
        entry.gainNode.gain.setTargetAtTime(targetGain, now, timeConstant);
      } catch (_) {
        entry.gainNode.gain.value = targetGain;
      }
      entry.currentGain = targetGain;
    }

    // 2. Smoothly update individual 3D PannerNode position only when remote avatar moved
    const panner = entry.pannerNode;
    const remX = typeof remoteUser.x === "number" ? remoteUser.x : 0;
    const remZ = typeof remoteUser.y === "number" ? remoteUser.y : 0;

    if (Math.abs(entry.posX - remX) > 0.25 || Math.abs(entry.posZ - remZ) > 0.25) {
      if (panner.positionX && panner.positionX.setTargetAtTime) {
        try {
          panner.positionX.setTargetAtTime(remX, now, timeConstant);
          panner.positionY.setTargetAtTime(0, now, timeConstant);
          panner.positionZ.setTargetAtTime(remZ, now, timeConstant);
        } catch (_) {
          panner.positionX.value = remX;
          panner.positionY.value = 0;
          panner.positionZ.value = remZ;
        }
      } else if (panner.setPosition) {
        panner.setPosition(remX, 0, remZ);
      }
      entry.posX = remX;
      entry.posZ = remZ;
    }

    // Update maxDistance to match dynamic audioRadius slider (only relevant if rolloffFactor > 0)
    if (panner.rolloffFactor > 0 && panner.maxDistance !== audioRadius) {
      panner.maxDistance = Math.max(audioRadius, 30);
    }

    entry.distance = distance;
    entry.posX = remX;
    entry.posZ = remZ;
    entry.currentPan = calculatePan(localUser, remoteUser, audioRadius);

    return {
      gain: targetGain,
      distance: Math.round(distance),
      pan: entry.currentPan,
      inEarshot,
      posX: remX,
      posZ: remZ,
    };
  }

  /**
   * Smoothly iterates and updates all remote participants and the AudioListener.
   */
  updateAllSpatialParams(localUser, remoteUsers, audioRadius = 100) {
    if (!localUser || !Array.isArray(remoteUsers)) return;
    this.updateListenerPosition(localUser);

    for (const remote of remoteUsers) {
      if (!remote || !remote.id) continue;
      this.updatePeerSpatialParams(remote.id, localUser, remote, audioRadius);
    }
  }

  /**
   * Toggles deafen / speaker mute state.
   */
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

  /**
   * Safely dismantles and cleans up an individual peer's audio graph.
   */
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
      entry.pannerNode.disconnect();
    } catch (_) {}

    this.peerNodes.delete(peerId);
  }

  /**
   * Disposes all active audio graphs and closes the AudioContext on workspace exit.
   */
  cleanupAll() {
    for (const peerId of Array.from(this.peerNodes.keys())) {
      this.removePeer(peerId);
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.unlocked = false;
  }

  /**
   * Diagnostics inspector for developer monitoring panel.
   */
  getPeerSpatialInfo(peerId) {
    const entry = this.peerNodes.get(peerId);
    if (!entry) return null;
    return {
      peerId,
      currentGain: Number(entry.currentGain.toFixed(2)),
      currentPan: Number(entry.currentPan.toFixed(2)),
      distance: Math.round(entry.distance),
      posX: entry.posX,
      posZ: entry.posZ,
      panningModel: entry.pannerNode?.panningModel || "HRTF",
      distanceModel: entry.pannerNode?.distanceModel || "inverse",
    };
  }
}

export const audioEngine = new SpatialAudioEngine();
