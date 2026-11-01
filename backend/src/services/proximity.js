function buildNearbyFilter(userId, x, y, radius) {
  return {
    userId: { $ne: userId },
    location: { $near: [x, y], $maxDistance: radius },
  };
}

function buildWithinFilter(x, y, radius) {
  return {
    location: { $geoWithin: { $center: [[x, y], radius] } },
  };
}

module.exports = { buildNearbyFilter, buildWithinFilter };