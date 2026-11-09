const assert = require("node:assert/strict");
const test = require("node:test");
const Avatar = require("../models/Avatar");
const {
  createAudioRoutingService,
  EARSHOT_RADIUS,
  previousPeers,
  calculateDistance,
} = require("../services/audioRoutingService");

test("Audio Routing Service - calculateDistance", () => {
  assert.equal(calculateDistance([0, 0], [3, 4]), 5);
  assert.equal(calculateDistance([100, 100], [100, 100]), 0);
  assert.equal(Number(calculateDistance([0, 0], [100, 100]).toFixed(2)), 141.42);
});

test("Audio Routing Service - Day 20 Integration Workflow", async () => {
  previousPeers.clear();

  // Mock Socket.IO instance
  const emittedEvents = [];
  const mockIo = {
    to(targetRoom) {
      return {
        emit(event, payload) {
          emittedEvents.push({ targetRoom, event, payload });
        },
      };
    },
  };

  const audioRouter = createAudioRoutingService(mockIo);

  // Mock Avatar.find
  let mockOnlineAvatars = [];
  const originalFind = Avatar.find;
  Avatar.find = function (filter) {
    return {
      select() {
        return {
          limit() {
            return {
              async lean() {
                const center = filter.position.$near;
                const maxDist = filter.position.$maxDistance;
                const requester = filter.userId.$ne;

                return mockOnlineAvatars.filter((av) => {
                  if (av.userId === requester) return false;
                  if (!av.isOnline) return false;
                  const dist = calculateDistance(center, av.position);
                  return dist <= maxDist;
                });
              },
            };
          },
        };
      },
    };
  };

  try {
    // ---------------------------------------------------------
    // Scenario 1: Two users within 100px -> Both receive peer-entered events
    // ---------------------------------------------------------
    mockOnlineAvatars = [
      { userId: "user_B", username: "Bob", position: [140, 100], isOnline: true },
    ];

    emittedEvents.length = 0;
    const result1 = await audioRouter.updateNearbyPeers("user_A", [100, 100]);

    assert.equal(result1.nearbyPeers.length, 1);
    assert.equal(result1.nearbyPeers[0].peerId, "user_B");
    assert.equal(result1.nearbyPeers[0].distance, 40);
    assert.equal(result1.enteredPeers.length, 1);
    assert.equal(result1.leftPeerIds.length, 0);

    // Verify proximity:peers:update emitted to user_A
    const peersUpdateEvent = emittedEvents.find(
      (e) => e.targetRoom === "user_A" && e.event === "proximity:peers:update"
    );
    assert.ok(peersUpdateEvent, "Must emit proximity:peers:update to user_A");
    assert.equal(peersUpdateEvent.payload.peers[0].peerId, "user_B");

    // Verify proximity:peer:entered emitted to user_A and user_B
    const enteredForA = emittedEvents.find(
      (e) => e.targetRoom === "user_A" && e.event === "proximity:peer:entered"
    );
    assert.ok(enteredForA, "Must emit proximity:peer:entered to user_A");
    assert.equal(enteredForA.payload.peerId, "user_B");
    assert.equal(enteredForA.payload.distance, 40);

    const enteredForB = emittedEvents.find(
      (e) => e.targetRoom === "user_B" && e.event === "proximity:peer:entered"
    );
    assert.ok(enteredForB, "Must emit proximity:peer:entered to user_B");
    assert.equal(enteredForB.payload.peerId, "user_A");
    assert.equal(enteredForB.payload.distance, 40);

    // ---------------------------------------------------------
    // Scenario 2: User moves closer -> Updated distance received, no new enter event
    // ---------------------------------------------------------
    mockOnlineAvatars = [
      { userId: "user_B", username: "Bob", position: [120, 100], isOnline: true },
    ];

    emittedEvents.length = 0;
    const result2 = await audioRouter.updateNearbyPeers("user_A", [100, 100]);

    assert.equal(result2.nearbyPeers.length, 1);
    assert.equal(result2.nearbyPeers[0].distance, 20);
    assert.equal(result2.enteredPeers.length, 0, "No new enter event when already in earshot");
    assert.equal(result2.leftPeerIds.length, 0);

    const update2 = emittedEvents.find(
      (e) => e.targetRoom === "user_A" && e.event === "proximity:peers:update"
    );
    assert.ok(update2);
    assert.equal(update2.payload.peers[0].distance, 20);

    // ---------------------------------------------------------
    // Scenario 3: User moves beyond 100px -> Both receive peer-left events
    // ---------------------------------------------------------
    mockOnlineAvatars = [
      { userId: "user_B", username: "Bob", position: [250, 100], isOnline: true }, // distance 150 > 100
    ];

    emittedEvents.length = 0;
    const result3 = await audioRouter.updateNearbyPeers("user_A", [100, 100]);

    assert.equal(result3.nearbyPeers.length, 0);
    assert.equal(result3.leftPeerIds.length, 1);
    assert.equal(result3.leftPeerIds[0], "user_B");

    const leftForA = emittedEvents.find(
      (e) => e.targetRoom === "user_A" && e.event === "proximity:peer:left"
    );
    assert.ok(leftForA, "Must emit proximity:peer:left to user_A");
    assert.equal(leftForA.payload.peerId, "user_B");
    assert.equal(leftForA.payload.reason, "out_of_earshot");

    const leftForB = emittedEvents.find(
      (e) => e.targetRoom === "user_B" && e.event === "proximity:peer:left"
    );
    assert.ok(leftForB, "Must emit proximity:peer:left to user_B");
    assert.equal(leftForB.payload.peerId, "user_A");
    assert.equal(leftForB.payload.reason, "out_of_earshot");

    // ---------------------------------------------------------
    // Scenario 4: User returns within 100px -> New enter event generated
    // ---------------------------------------------------------
    mockOnlineAvatars = [
      { userId: "user_B", username: "Bob", position: [150, 100], isOnline: true }, // distance 50 <= 100
    ];

    emittedEvents.length = 0;
    const result4 = await audioRouter.updateNearbyPeers("user_A", [100, 100]);

    assert.equal(result4.enteredPeers.length, 1);
    assert.equal(result4.enteredPeers[0].peerId, "user_B");
    assert.equal(result4.enteredPeers[0].distance, 50);

    // ---------------------------------------------------------
    // Scenario 5: User disconnects -> Remaining peers receive exit notification
    // ---------------------------------------------------------
    emittedEvents.length = 0;
    await audioRouter.removeUser("user_A");

    const disconnectLeftForB = emittedEvents.find(
      (e) => e.targetRoom === "user_B" && e.event === "proximity:peer:left"
    );
    assert.ok(disconnectLeftForB, "Must emit proximity:peer:left to user_B on disconnect");
    assert.equal(disconnectLeftForB.payload.peerId, "user_A");
    assert.equal(disconnectLeftForB.payload.reason, "user_disconnected");
    assert.equal(previousPeers.has("user_A"), false);
  } finally {
    Avatar.find = originalFind;
  }
});

