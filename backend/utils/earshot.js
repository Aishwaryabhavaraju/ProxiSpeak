
const EARSHOT_RADIUS = 100;

/**
 * Calculate distance between two virtual-world positions.
 */
const calculateDistance = (positionA, positionB) => {
    const [x1, y1] = positionA;
    const [x2, y2] = positionB;

    return Math.hypot(x2 - x1, y2 - y1);
};

/**
 * Check whether two avatars are within earshot.
 */
const isWithinEarshot = (
    positionA,
    positionB,
    radius = EARSHOT_RADIUS
) => {
    return calculateDistance(positionA, positionB) <= radius;
};

module.exports = {
    EARSHOT_RADIUS,
    calculateDistance,
    isWithinEarshot,
};
