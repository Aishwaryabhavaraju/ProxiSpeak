const SPEED = 180; // pixels per second

export function moveAvatar(position, keys, deltaTime, bounds) {
  let dx = 0;
  let dy = 0;

  if (keys.ArrowLeft || keys.a || keys.A) dx -= 1;
  if (keys.ArrowRight || keys.d || keys.D) dx += 1;
  if (keys.ArrowUp || keys.w || keys.W) dy -= 1;
  if (keys.ArrowDown || keys.s || keys.S) dy += 1;

  // Normalize diagonal movement.
  const length = Math.hypot(dx, dy);

  if (length > 0) {
    dx /= length;
    dy /= length;
  }

  const distance = SPEED * Math.min(deltaTime, 0.05);

  return {
    x: Math.max(
      12,
      Math.min(bounds.width - 12, position.x + dx * distance)
    ),
    y: Math.max(
      12,
      Math.min(bounds.height - 12, position.y + dy * distance)
    ),
  };
}

