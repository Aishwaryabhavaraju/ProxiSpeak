import { useState, useCallback, useEffect, useRef } from "react";
import { webrtcManager } from "../services/webrtc";
import { audioEngine } from "../services/audioEngine";

export function useMicrophone({ onMuteChanged } = {}) {
  const [micEnabled, setMicEnabled] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [permissionState, setPermissionState] = useState("prompt");
  const [micError, setMicError] = useState("");
  const streamRef = useRef(null);

  const enableMicrophone = useCallback(async () => {
    setMicError("");
    audioEngine.ensureContext();

    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionState("unavailable");
      setMicError("Browser microphone API is unavailable in this environment.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;
      webrtcManager.setLocalStream(stream);
      setMicEnabled(true);
      setMicMuted(false);
      setPermissionState("granted");
      if (onMuteChanged) onMuteChanged(false);
      return true;
    } catch (err) {
      setPermissionState("denied");
      setMicEnabled(false);
      setMicError(
        err && err.name === "NotAllowedError"
          ? "Microphone permission was denied. Enable microphone access in browser settings."
          : "Could not access a microphone device."
      );
      return false;
    }
  }, [onMuteChanged]);

  const toggleMicMute = useCallback(() => {
    const nextMuted = !micMuted;
    if (streamRef.current) {
      for (const track of streamRef.current.getAudioTracks()) {
        track.enabled = !nextMuted;
      }
    }
    setMicMuted(nextMuted);
    if (onMuteChanged) onMuteChanged(nextMuted);
  }, [micMuted, onMuteChanged]);

  const toggleSpeakerMute = useCallback(() => {
    const next = !speakerMuted;
    setSpeakerMuted(next);
    audioEngine.setSpeakerMuted(next);
  }, [speakerMuted]);

  const stopMicrophone = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    webrtcManager.setLocalStream(null);
    setMicEnabled(false);
    setMicMuted(false);
  }, []);

  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, [stopMicrophone]);

  return {
    micEnabled,
    micMuted,
    speakerMuted,
    permissionState,
    micError,
    enableMicrophone,
    toggleMicMute,
    toggleSpeakerMute,
    stopMicrophone,
  };
}
