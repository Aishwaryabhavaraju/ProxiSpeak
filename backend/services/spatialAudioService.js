const {
  getAudioObstructions,
  DEFAULT_EARSHOT_RADIUS,
} = require("./soundObstructionService");

const EARSHOT_RADIUS = DEFAULT_EARSHOT_RADIUS;

// Keep values within the supported audio range.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateSpatialData(
  listener,
  peer,
  furniture = [],
  radius = EARSHOT_RADIUS,
  options = {}
) {
  const dx = peer.x - listener.x;
  const dy = peer.y - listener.y;

  const distance = Math.hypot(dx, dy);

  const obstructions = getAudioObstructions(
    listener,
    peer,
    furniture
  );

  const isObstructed = obstructions.length > 0;

  // Linear and Quadratic distance attenuation
  const linearFactor = clamp(1 - distance / radius, 0, 1);
  const obstructionFactor = isObstructed ? 0.25 : 1;
  const linearGain = Number((linearFactor * obstructionFactor).toFixed(3));
  const quadraticGain = Number((Math.pow(linearFactor, 2) * obstructionFactor).toFixed(3));

  const gain = (options && options.quadratic) ? quadraticGain : linearGain;

  // Negative = left, positive = right.
  const pan = Number(
    clamp(dx / radius, -1, 1).toFixed(3)
  );

  return {
    peerId: peer.userId,
    relativePosition: {
      x: dx,
      y: dy,
    },
    distance: Number(distance.toFixed(2)),
    hasLineOfSight: !isObstructed,
    isObstructed,
    obstructions,
    gain,
    linearGain,
    quadraticGain,
    pan,
  };
}

function createSpatialAudioService(io) {
  /**
   * nearbyPeers must come from your existing geospatial query.
   * Each peer must contain: userId, x, y (or position: [x, y]).
   * furniture must come from the saved OfficeLayout.
   */
  function updateSpatialAudio({
    userId,
    roomId,
    position,
    nearbyPeers,
    furniture,
  }) {
    if (!userId || !roomId || !position) {
      throw new Error("userId, roomId and position are required");
    }

    const posX = position.x !== undefined ? position.x : position[0];
    const posY = position.y !== undefined ? position.y : position[1];

    const listener = {
      userId,
      x: Number(posX),
      y: Number(posY),
    };

    if (
      !Number.isFinite(listener.x) ||
      !Number.isFinite(listener.y)
    ) {
      throw new Error("Invalid avatar position");
    }

    const peers = (nearbyPeers || []).filter(
      (peer) =>
        peer &&
        peer.userId !== userId &&
        Number.isFinite(Number(peer.x !== undefined ? peer.x : peer.position?.[0])) &&
        Number.isFinite(Number(peer.y !== undefined ? peer.y : peer.position?.[1]))
    );

    const normalizedPeers = peers.map((peer) => ({
      ...peer,
      userId: peer.userId,
      x: Number(peer.x !== undefined ? peer.x : peer.position[0]),
      y: Number(peer.y !== undefined ? peer.y : peer.position[1]),
    }));

    const spatialPeers = normalizedPeers
      .filter((peer) => {
        return (
          Math.hypot(
            peer.x - listener.x,
            peer.y - listener.y
          ) <= EARSHOT_RADIUS
        );
      })
      .map((peer) =>
        calculateSpatialData(
          listener,
          peer,
          furniture,
          EARSHOT_RADIUS
        )
      );

    // Send listener-relative spatial information to Member 1.
    io.to(userId).emit("spatial:audio:update", {
      roomId,
      userId,
      radius: EARSHOT_RADIUS,
      peers: spatialPeers,
      timestamp: Date.now(),
    });

    // Send the reverse perspective to each nearby peer.
    for (const peer of normalizedPeers) {
      const peerSpatialData = spatialPeers.find(
        (item) => item.peerId === peer.userId
      );

      if (!peerSpatialData) continue;

      const reverseData = calculateSpatialData(
        { userId: peer.userId, x: peer.x, y: peer.y },
        listener,
        furniture,
        EARSHOT_RADIUS
      );

      io.to(peer.userId).emit("spatial:audio:update", {
        roomId,
        userId: peer.userId,
        radius: EARSHOT_RADIUS,
        peers: [
          {
            ...reverseData,
            peerId: userId,
          },
        ],
        timestamp: Date.now(),
      });
    }

    return spatialPeers;
  }

  return {
    updateSpatialAudio,
  };
}

module.exports = {
  createSpatialAudioService,
  calculateSpatialData,
  EARSHOT_RADIUS,
};

