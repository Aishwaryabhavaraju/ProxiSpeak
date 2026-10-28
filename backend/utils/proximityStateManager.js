const EARSHOT_RADIUS = 100;

class ProximityStateManager {
  constructor(radius = EARSHOT_RADIUS) {
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("Radius must be positive.");
    }

    this.radius = radius;
    this.positions = new Map();
    this.activePairs = new Map();
  }

  pairKey(userA, userB) {
    return JSON.stringify([userA, userB].sort());
  }

  getPairKey(userA, userB) {
    return this.pairKey(userA, userB);
  }

  updatePosition(userId, position) {
    if (
      !userId ||
      !Array.isArray(position) ||
      position.length !== 2 ||
      !position.every(Number.isFinite) ||
      position.some((value) => value < 0)
    ) {
      throw new Error("Valid userId and non-negative [x, y] required.");
    }

    this.positions.set(userId, [...position]);

    const events = [];

    for (const [peerId, peerPosition] of this.positions) {
      if (peerId === userId) continue;

      const distance = Math.hypot(
        position[0] - peerPosition[0],
        position[1] - peerPosition[1]
      );

      const key = this.pairKey(userId, peerId);
      const wasNearby = this.activePairs.has(key);
      const isNearby = distance <= this.radius;

      // Outside -> inside: emit one enter event.
      if (isNearby && !wasNearby) {
        const pair = {
          userA: [userId, peerId].sort()[0],
          userB: [userId, peerId].sort()[1],
          distance: Number(distance.toFixed(2)),
        };

        this.activePairs.set(key, pair);
        events.push({ type: "enter", ...pair });
      }

      // Inside -> outside: emit one exit event.
      if (!isNearby && wasNearby) {
        const pair = this.activePairs.get(key);
        this.activePairs.delete(key);

        events.push({
          type: "exit",
          userA: pair.userA,
          userB: pair.userB,
          distance: Number(distance.toFixed(2)),
        });
      }

      // Remain inside: update distance without another enter event.
      if (isNearby && wasNearby) {
        const pair = this.activePairs.get(key);
        pair.distance = Number(distance.toFixed(2));
      }
    }

    return events;
  }

  updateUser(userId, position, nearbyUsers) {
    return this.updatePosition(userId, position);
  }

  removeUser(userId) {
    const events = [];

    for (const [key, pair] of this.activePairs) {
      if (pair.userA !== userId && pair.userB !== userId) {
        continue;
      }

      const peerId =
        pair.userA === userId ? pair.userB : pair.userA;

      this.activePairs.delete(key);

      events.push({
        type: "exit",
        userA: pair.userA,
        userB: pair.userB,
        peerId,
        reason: "user_disconnected",
      });
    }

    this.positions.delete(userId);
    return events;
  }

  isNearby(userA, userB) {
    return this.activePairs.has(this.pairKey(userA, userB));
  }

  getActivePairs() {
    return [...this.activePairs.values()];
  }
}

module.exports = {
  ProximityStateManager,
  EARSHOT_RADIUS,
};
