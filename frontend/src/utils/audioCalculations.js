/**
 * Linear volume attenuation based on distance and configurable audio radius.
 * Formula: gain = max(0, 1 - distance / maxDistance)
 */
export function calculateVolume(distance, maxDistance = 100) {
  if (typeof distance !== "number" || Number.isNaN(distance) || maxDistance <= 0) {
    return 0;
  }
  if (distance >= maxDistance) {
    return 0;
  }
  const rawGain = 1 - distance / maxDistance;
  return Math.max(0, Math.min(1, rawGain));
}

/**
 * Horizontal stereo panning between -1 (left ear) and +1 (right ear).
 */
export function calculatePan(localUser, remoteUser, maxDistance = 100) {
  if (
    !localUser ||
    !remoteUser ||
    typeof localUser.x !== "number" ||
    typeof remoteUser.x !== "number" ||
    maxDistance <= 0
  ) {
    return 0;
  }
  const dx = remoteUser.x - localUser.x;
  return Math.max(-1, Math.min(1, dx / maxDistance));
}

/**
 * Hysteresis check for proximity WebRTC connection management.
 * Prevents connection flapping when avatars hover near the boundary.
 */
export function isWithinProximityWithHysteresis(
  distance,
  currentlyConnected,
  entryRadius = 100,
  exitRadius = 118
) {
  if (currentlyConnected) {
    return distance <= exitRadius;
  }
  return distance <= entryRadius;
}
