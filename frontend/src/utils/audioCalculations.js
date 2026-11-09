/**
 * Distance-based volume attenuation with obstruction and quadratic falloff support.
 * Linear formula: gain = max(0, 1 - distance / maxDistance) * (isObstructed ? 0.25 : 1)
 * Quadratic formula: gain = max(0, (1 - distance / maxDistance)^2) * (isObstructed ? 0.25 : 1)
 */
export function calculateVolume(
  distance,
  maxDistance = 100,
  isObstructed = false,
  useQuadratic = false
) {
  if (
    typeof distance !== "number" ||
    Number.isNaN(distance) ||
    typeof maxDistance !== "number" ||
    Number.isNaN(maxDistance) ||
    maxDistance <= 0
  ) {
    return 0;
  }
  if (distance >= maxDistance) {
    return 0;
  }
  const safeDistance = Math.max(0, distance);
  const linear = Math.max(0, 1 - safeDistance / maxDistance);
  const obstructionFactor = isObstructed ? 0.25 : 1;
  const rawGain = (useQuadratic ? Math.pow(linear, 2) : linear) * obstructionFactor;
  return Math.max(0, Math.min(1, rawGain));
}

/**
 * Direct quadratic distance attenuation for realistic acoustic falloff.
 */
export function calculateQuadraticVolume(
  distance,
  maxDistance = 100,
  isObstructed = false
) {
  return calculateVolume(distance, maxDistance, isObstructed, true);
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
    Number.isNaN(localUser.x) ||
    Number.isNaN(remoteUser.x) ||
    typeof maxDistance !== "number" ||
    Number.isNaN(maxDistance) ||
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
