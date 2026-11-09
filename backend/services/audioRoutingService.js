const Avatar = require("../models/Avatar");

const EARSHOT_RADIUS = 100;

// Stores the previous nearby peer IDs for each user.
const previousPeers = new Map();

function calculateDistance(positionA, positionB) {
  const dx = positionA[0] - positionB[0];
  const dy = positionA[1] - positionB[1];

  return Math.sqrt(dx * dx + dy * dy);
}

function createAudioRoutingService(io) {
  /**
   * Find nearby users and route proximity events.
   */
  async function updateNearbyPeers(userId, position) {
    try {
      const [x, y] = position;

      // Find online avatars within the earshot radius.
      const nearbyAvatars = await Avatar.find({
        userId: { $ne: userId },
        isOnline: true,
        position: {
          $near: [x, y],
          $maxDistance: EARSHOT_RADIUS,
        },
      })
        .select("userId username position")
        .limit(100)
        .lean();

      // Prepare peer details with their exact distances.
      const currentPeers = nearbyAvatars.map((avatar) => ({
        peerId: avatar.userId,
        username: avatar.username,
        distance: Number(
          calculateDistance(position, avatar.position).toFixed(2)
        ),
      }));

      const currentPeerIds = new Set(
        currentPeers.map((peer) => peer.peerId)
      );

      const previousPeerIds = previousPeers.get(userId) || new Set();

      // Identify users who entered earshot.
      const enteredPeers = currentPeers.filter(
        (peer) => !previousPeerIds.has(peer.peerId)
      );

      // Identify users who left earshot.
      const leftPeerIds = [...previousPeerIds].filter(
        (peerId) => !currentPeerIds.has(peerId)
      );

      // Send the complete nearby-peer list to this user.
      io.to(userId).emit("proximity:peers:update", {
        userId,
        radius: EARSHOT_RADIUS,
        peers: currentPeers,
        timestamp: Date.now(),
      });

      // Notify both users when a peer enters earshot.
      for (const peer of enteredPeers) {
        io.to(userId).emit("proximity:peer:entered", {
          peerId: peer.peerId,
          distance: peer.distance,
          radius: EARSHOT_RADIUS,
        });

        io.to(peer.peerId).emit("proximity:peer:entered", {
          peerId: userId,
          distance: peer.distance,
          radius: EARSHOT_RADIUS,
        });
      }

      // Notify both users when a peer leaves earshot.
      for (const peerId of leftPeerIds) {
        io.to(userId).emit("proximity:peer:left", {
          peerId,
          reason: "out_of_earshot",
        });

        io.to(peerId).emit("proximity:peer:left", {
          peerId: userId,
          reason: "out_of_earshot",
        });
      }

      // Save the current state for the next movement update.
      previousPeers.set(userId, currentPeerIds);

      return {
        userId,
        nearbyPeers: currentPeers,
        enteredPeers,
        leftPeerIds,
      };
    } catch (error) {
      console.error("Audio routing error:", error);
      throw error;
    }
  }

  /**
   * Clean up when a user disconnects or leaves the office.
   */
  async function removeUser(userId) {
    const peers = previousPeers.get(userId) || new Set();

    for (const peerId of peers) {
      io.to(peerId).emit("proximity:peer:left", {
        peerId: userId,
        reason: "user_disconnected",
      });
    }

    previousPeers.delete(userId);
  }

  return {
    updateNearbyPeers,
    removeUser,
  };
}

module.exports = {
  createAudioRoutingService,
  EARSHOT_RADIUS,
  previousPeers,
  calculateDistance,
};

