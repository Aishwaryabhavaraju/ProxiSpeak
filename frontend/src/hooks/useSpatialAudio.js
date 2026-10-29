import { useEffect, useRef, useState } from "react";
import { calculateDistance } from "../utils/distance";
import {
  calculateVolume,
  calculatePan,
  isWithinProximityWithHysteresis,
} from "../utils/audioCalculations";
import { audioEngine } from "../services/audioEngine";
import { webrtcManager } from "../services/webrtc";

/**
 * Computes spatial audio parameters & manages proximity WebRTC connections.
 * - Updates Web Audio API GainNode/StereoPannerNode immediately via refs (zero 60fps React rerenders).
 * - Only creates RTCPeerConnections when connectionState === "connected" (never for mock bots).
 * - Uses deterministic offer initiation: `String(localUser.id) < String(remote.id)`.
 * - Throttles UI state updates (`spatialMetrics`) to 10 Hz (100ms).
 */
export function useSpatialAudio(
  worldRef,
  audioRadius = 100,
  speakerMuted = false,
  connectionState = "simulation",
  micEnabled = false
) {
  const [spatialMetrics, setSpatialMetrics] = useState({});
  const activePeersRef = useRef(new Set());

  useEffect(() => {
    const intervalId = setInterval(() => {
      const { localUser, remoteUsers } = worldRef.current || {};
      if (!localUser || !Array.isArray(remoteUsers)) return;

      const nextMetrics = {};
      const currentIds = new Set();

      for (const remote of remoteUsers) {
        currentIds.add(remote.id);
        const distance = calculateDistance(localUser, remote);
        const wasConnected = activePeersRef.current.has(remote.id);
        const inEarshot = distance <= audioRadius;
        const gain =
          speakerMuted || remote.muted ? 0 : calculateVolume(distance, audioRadius);
        const pan = calculatePan(localUser, remote, audioRadius);

        audioEngine.updatePeerSpatialParams(
          remote.id,
          localUser,
          remote,
          distance,
          audioRadius
        );

        // Ensure WebRTC peer connection exists for connected peers in the office
        if (connectionState === "connected" && !remote.isBot) {
          if (!webrtcManager.peers.has(remote.id)) {
            const isInitiator = String(localUser.id) < String(remote.id);
            webrtcManager.createPeerConnection(remote.id, isInitiator);
          }
        }

        nextMetrics[remote.id] = {
          distance: Math.round(distance),
          gain: Number(gain.toFixed(2)),
          pan: Number(pan.toFixed(2)),
          inEarshot,
        };
      }

      setSpatialMetrics(nextMetrics);
    }, 100); // 10 Hz throttled UI & proximity check

    return () => clearInterval(intervalId);
  }, [worldRef, audioRadius, speakerMuted, connectionState, micEnabled]);

  return { spatialMetrics };
}
