const OfficeLayout = require("../models/OfficeLayout");

const DEFAULT_EARSHOT_RADIUS = 100;

/**
 * Check whether a line segment intersects a rectangle.
 * Uses the Liang-Barsky clipping algorithm.
 */
function lineIntersectsRectangle(start, end, rect) {
  const minX = rect.x;
  const minY = rect.y;
  const maxX = rect.x + rect.width;
  const maxY = rect.y + rect.height;

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let tMin = 0;
  let tMax = 1;

  const p = [-dx, dx, -dy, dy];
  const q = [
    start.x - minX,
    maxX - start.x,
    start.y - minY,
    maxY - start.y,
  ];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }

    const t = q[i] / p[i];

    if (p[i] < 0) {
      tMin = Math.max(tMin, t);
    } else {
      tMax = Math.min(tMax, t);
    }

    if (tMin > tMax) return false;
  }

  return true;
}

/**
 * Find furniture obstacles intersecting the audio path.
 */
function getAudioObstructions(start, end, furniture = []) {
  return furniture
    .filter((item) => item.blocksAudio === true)
    .filter((item) =>
      lineIntersectsRectangle(start, end, item)
    )
    .map((item) => ({
      furnitureId: item._id,
      name: item.name,
      type: item.type,
      obstacleType: item.obstacleType,
    }));
}

/**
 * Determine audio path visibility between two avatars.
 */
async function checkSoundObstruction(roomId, avatarA, avatarB) {
  const layout = await OfficeLayout.findOne({ roomId })
    .select("furniture")
    .lean();

  if (!layout) {
    throw new Error(`Office layout not found: ${roomId}`);
  }

  const start = {
    x: avatarA.x !== undefined ? avatarA.x : avatarA.position?.[0],
    y: avatarA.y !== undefined ? avatarA.y : avatarA.position?.[1],
  };

  const end = {
    x: avatarB.x !== undefined ? avatarB.x : avatarB.position?.[0],
    y: avatarB.y !== undefined ? avatarB.y : avatarB.position?.[1],
  };

  const obstructions = getAudioObstructions(
    start,
    end,
    layout.furniture
  );

  return {
    isObstructed: obstructions.length > 0,
    hasLineOfSight: obstructions.length === 0,
    obstructions,
  };
}

module.exports = {
  lineIntersectsRectangle,
  getAudioObstructions,
  checkSoundObstruction,
  DEFAULT_EARSHOT_RADIUS,
};

