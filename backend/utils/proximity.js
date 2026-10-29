
const calculateDistance = (positionA, positionB) => {
    const [x1, y1] = positionA;
    const [x2, y2] = positionB;

    return Math.hypot(x2 - x1, y2 - y1);
};

module.exports = { calculateDistance };
