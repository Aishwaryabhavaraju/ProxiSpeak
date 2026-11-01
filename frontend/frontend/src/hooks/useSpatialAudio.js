import { useEffect, useState } from "react";
import { audioEngine } from "../services/audioEngine";

/**
 * High-performance 3D Spatial Audio hook.
 *
 * Runs smooth 3D spatial updates at 60 FPS directly into the Web Audio API graph
 * without triggering React component re-renders.
 * Throttles UI metrics snapshot to 10 Hz for clean dashboard / colleague list updates.
 */
export function useSpatialAudio(
  worldRef,
  audioRadius = 100,
  speakerMuted = false
) {
  const [spatialMetrics, setSpatialMetrics] = useState({});

  // 1. High-frequency 60 FPS AudioGraph parameter updater
  useEffect(() => {
    let animationId;

    function spatialTick() {
      const { localUser, remoteUsers } = worldRef.current || {};
      if (localUser && Array.isArray(remoteUsers)) {
        audioEngine.updateAllSpatialParams(localUser, remoteUsers, audioRadius);
      }
      animationId = requestAnimationFrame(spatialTick);
    }

    animationId = requestAnimationFrame(spatialTick);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [worldRef, audioRadius]);

  // 2. Throttled (10 Hz) metrics snapshot for UI state display — READ ONLY.
  // The 60 FPS RAF loop above already writes to the audio graph.
  // This interval only reads cached state from the engine to update React UI metrics.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const { remoteUsers } = worldRef.current || {};
      if (!Array.isArray(remoteUsers)) return;

      const nextMetrics = {};
      for (const remote of remoteUsers) {
        if (!remote || !remote.id) continue;
        // getPeerSpatialInfo() is read-only — no audio graph writes happen here
        const info = audioEngine.getPeerSpatialInfo(remote.id);
        if (info) {
          nextMetrics[remote.id] = {
            distance: info.distance,
            gain: info.currentGain,
            pan: info.currentPan,
            inEarshot: info.distance < audioRadius,
            posX: info.posX,
            posZ: info.posZ,
          };
        }
      }
      setSpatialMetrics(nextMetrics);
    }, 100);

    return () => clearInterval(intervalId);
  }, [worldRef, audioRadius, speakerMuted]);

  return { spatialMetrics };
}
