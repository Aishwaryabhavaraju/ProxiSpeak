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

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setPermissionState("unavailable");
      setMicError("Browser microphone API is unavailable in this environment.");
      return false;
    }

    try {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }

      // Professional speech constraints: echo cancellation, native noise suppression,
      // and automatic gain control with 48kHz mono sampling for optimal Opus performance.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 48000 },
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
      const name = err && err.name ? err.name : "";
      let message = "Could not access a microphone device.";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        message =
          "Microphone access was denied. Please allow microphone permissions in your browser.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        message = "No microphone hardware detected on this device.";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        message =
          "Microphone is already in use by another application or hardware error occurred.";
      } else if (name === "OverconstrainedError") {
        message =
          "Requested microphone audio settings are not supported by your hardware.";
      } else if (name === "SecurityError") {
        message =
          "Microphone access blocked. Media capture requires HTTPS or localhost.";
      }
      setMicError(message);
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
    webrtcManager.setLocalMuted(nextMuted);
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
    if (onMuteChanged) onMuteChanged(true);
  }, [onMuteChanged]);

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
