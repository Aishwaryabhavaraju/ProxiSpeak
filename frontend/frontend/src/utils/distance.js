/**
 * Euclidean distance calculation between two points/avatars in the 2D office coordinate space.
 * Formula: d = sqrt((x2 - x1)^2 + (y2 - y1)^2)
 */
export function calculateDistance(userA, userB) {
  if (
    !userA ||
    !userB ||
    typeof userA.x !== "number" ||
    typeof userA.y !== "number" ||
    typeof userB.x !== "number" ||
    typeof userB.y !== "number" ||
    Number.isNaN(userA.x) ||
    Number.isNaN(userA.y) ||
    Number.isNaN(userB.x) ||
    Number.isNaN(userB.y)
  ) {
    return Infinity;
  }
  const dx = userB.x - userA.x;
  const dy = userB.y - userA.y;
  return Math.sqrt(dx * dx + dy * dy);
}
