import { OFFICE_CONFIG, getCollisionObstacles } from "./officeLayout";

/**
 * Checks if a circular avatar at (x, y) with radius `r` collides with any rectangular obstacle
 * or extends outside the office boundaries.
 */
export function checkCollision(x, y, radius = OFFICE_CONFIG.avatarRadius, layout = OFFICE_CONFIG) {
  const margin = 12;
  if (
    x - radius < margin ||
    x + radius > layout.width - margin ||
    y - radius < margin ||
    y + radius > layout.height - margin
  ) {
    return true;
  }

  const obstacles = getCollisionObstacles(layout);
  for (const obs of obstacles) {
    const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.w));
    const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.h));
    const dx = x - closestX;
    const dy = y - closestY;
    if (dx * dx + dy * dy < (radius + 4) * (radius + 4)) {
      return true;
    }
  }
  return false;
}

/**
 * Moves from (x, y) by (dx, dy) with axis-sliding so avatars glide around desk corners
 * instead of getting stuck when walking diagonally.
 */
export function moveWithSliding(x, y, dx, dy, radius = OFFICE_CONFIG.avatarRadius, layout = OFFICE_CONFIG) {
  const fullX = x + dx;
  const fullY = y + dy;
  if (!checkCollision(fullX, fullY, radius, layout)) {
    return { x: fullX, y: fullY, blocked: false };
  }
  // Try sliding horizontally only
  if (Math.abs(dx) > 0.01 && !checkCollision(fullX, y, radius, layout)) {
    return { x: fullX, y, blocked: false };
  }
  // Try sliding vertically only
  if (Math.abs(dy) > 0.01 && !checkCollision(x, fullY, radius, layout)) {
    return { x, y: fullY, blocked: false };
  }
  // Try perpendicular detour nudge around obstacle
  const perpX = x - dy * 0.6;
  const perpY = y + dx * 0.6;
  if (!checkCollision(perpX, perpY, radius, layout)) {
    return { x: perpX, y: perpY, blocked: false };
  }
  return { x, y, blocked: true };
}

/**
 * Picks a valid collision-free destination inside the office with a bounded retry loop.
 */
export function selectValidDestination(layout = OFFICE_CONFIG, radius = OFFICE_CONFIG.avatarRadius) {
  const maxAttempts = 40;
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidateX = 35 + Math.random() * (layout.width - 70);
    const candidateY = 35 + Math.random() * (layout.height - 70);
    if (!checkCollision(candidateX, candidateY, radius, layout)) {
      return { x: Math.round(candidateX), y: Math.round(candidateY) };
    }
  }
  return { x: 300, y: 290 };
}

/**
 * Smoothly interpolates a remote user's rendered position toward their authoritative server coordinates.
 */
export function interpolateRemoteAvatar(avatar, dtSeconds, lerpSpeed = 10) {
  const safeDt = Math.min(Math.max(dtSeconds, 0.001), 0.1);
  const targetX = typeof avatar.serverX === "number" ? avatar.serverX : avatar.x;
  const targetY = typeof avatar.serverY === "number" ? avatar.serverY : avatar.y;
  const dx = targetX - avatar.x;
  const dy = targetY - avatar.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 0.5) {
    return { ...avatar, x: targetX, y: targetY, moving: false };
  }
  const t = Math.min(1, safeDt * lerpSpeed);
  return {
    ...avatar,
    x: avatar.x + dx * t,
    y: avatar.y + dy * t,
    direction: Math.atan2(dy, dx),
    moving: true,
  };
}

/**
 * Updates an autonomous avatar's position toward its target destination using elapsed delta time (seconds).
 */
export function stepAvatarMovement(avatar, dtSeconds, speedPxPerSec = 68, layout = OFFICE_CONFIG) {
  const safeDt = Math.min(Math.max(dtSeconds, 0.001), 0.1);
  let targetX = avatar.targetX;
  let targetY = avatar.targetY;

  if (typeof targetX !== "number" || typeof targetY !== "number") {
    const nextDest = selectValidDestination(layout, avatar.radius || OFFICE_CONFIG.avatarRadius);
    targetX = nextDest.x;
    targetY = nextDest.y;
  }

  const dx = targetX - avatar.x;
  const dy = targetY - avatar.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 6) {
    const nextDest = selectValidDestination(layout, avatar.radius || OFFICE_CONFIG.avatarRadius);
    return {
      ...avatar,
      targetX: nextDest.x,
      targetY: nextDest.y,
      moving: false,
    };
  }

  const step = Math.min(dist, speedPxPerSec * safeDt);
  const angle = Math.atan2(dy, dx);
  const slideResult = moveWithSliding(
    avatar.x,
    avatar.y,
    Math.cos(angle) * step,
    Math.sin(angle) * step,
    avatar.radius || OFFICE_CONFIG.avatarRadius,
    layout
  );

  if (slideResult.blocked) {
    const fallback = selectValidDestination(layout, avatar.radius || OFFICE_CONFIG.avatarRadius);
    return {
      ...avatar,
      targetX: fallback.x,
      targetY: fallback.y,
      direction: angle,
      moving: false,
    };
  }

  return {
    ...avatar,
    x: slideResult.x,
    y: slideResult.y,
    targetX,
    targetY,
    direction: angle,
    moving: true,
  };
}
