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
        const inEarshot = isWithinProximityWithHysteresis(
          distance,
          wasConnected,
          audioRadius,
          audioRadius + 18
        );

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

        if (inEarshot && !wasConnected) {
          activePeersRef.current.add(remote.id);
          if (connectionState === "connected" && micEnabled) {
            const isInitiator = String(localUser.id) < String(remote.id);
            webrtcManager.createPeerConnection(remote.id, isInitiator);
          }
        } else if (inEarshot && wasConnected && connectionState === "connected" && micEnabled) {
          // Ensure peer connection is created once micEnabled turns true while already in earshot
          if (!webrtcManager.peers.has(remote.id)) {
            const isInitiator = String(localUser.id) < String(remote.id);
            webrtcManager.createPeerConnection(remote.id, isInitiator);
          }
        } else if (!inEarshot && wasConnected) {
          activePeersRef.current.delete(remote.id);
          if (connectionState === "connected") {
            webrtcManager.closePeer(remote.id);
          }
        }

        nextMetrics[remote.id] = {
          distance: Math.round(distance),
          gain: Number(gain.toFixed(2)),
          pan: Number(pan.toFixed(2)),
          inEarshot,
        };
      }

      // Clean up any peer that left the office entirely
      for (const peerId of Array.from(activePeersRef.current)) {
        if (!currentIds.has(peerId)) {
          activePeersRef.current.delete(peerId);
          webrtcManager.closePeer(peerId);
        }
      }

      setSpatialMetrics(nextMetrics);
    }, 100); // 10 Hz throttled UI & proximity check

    return () => clearInterval(intervalId);
  }, [worldRef, audioRadius, speakerMuted, connectionState, micEnabled]);

  return { spatialMetrics };
}
