const EARSHOT_RADIUS = 100;
const MAX_NEARBY_USERS = 100;

async function findNearbyUsers(
  Avatar,
  userId,
  position,
  radius = EARSHOT_RADIUS,
  limit = MAX_NEARBY_USERS
) {
  if (
    !Array.isArray(position) ||
    position.length !== 2 ||
    !position.every(
      (value) => Number.isFinite(value) && value >= 0
    )
  ) {
    throw new Error("Position must be a valid [X, Y] array.");
  }

  if (!Number.isFinite(radius) || radius <= 0 || radius > 1000) {
    throw new Error("Radius must be between 0 and 1000.");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Limit must be an integer between 1 and 100.");
  }

  const startTime = process.hrtime.bigint();

  // MongoDB uses the existing 2d geospatial index.
  const nearbyUsers = await Avatar.find({
    userId: { $ne: userId },
    isOnline: true,
    position: {
      $near: position,
      $maxDistance: radius,
    },
  })
    .select("userId username position")
    .limit(limit)
    .lean();

  const queryTimeMs =
    Number(process.hrtime.bigint() - startTime) / 1_000_000;

  // Calculate exact Euclidean distances for the returned users.
  const users = nearbyUsers.map((user) => {
    const distance = Math.hypot(
      user.position[0] - position[0],
      user.position[1] - position[1]
    );

    return {
      userId: user.userId,
      username: user.username,
      position: user.position,
      distance: Number(distance.toFixed(2)),
      canHear: distance <= radius,
    };
  });

  return {
    radius,
    count: users.length,
    queryTimeMs: Number(queryTimeMs.toFixed(3)),
    users,
  };
}

module.exports = {
  findNearbyUsers,
  EARSHOT_RADIUS,
  MAX_NEARBY_USERS,
};
