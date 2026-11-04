const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const OfficeLayout = require("../models/OfficeLayout");
const {
  lineIntersectsRectangle,
  getAudioObstructions,
  checkSoundObstruction,
  DEFAULT_EARSHOT_RADIUS,
} = require("../services/soundObstructionService");
const {
  createSpatialAudioService,
  calculateSpatialData,
  EARSHOT_RADIUS,
} = require("../services/spatialAudioService");

test("Day 24: lineIntersectsRectangle (Liang-Barsky Line-Rectangle Intersection)", () => {
  const obstacle = { x: 40, y: 40, width: 20, height: 20 }; // [40, 60] x [40, 60]

  // Direct hit across the obstacle
  assert.equal(
    lineIntersectsRectangle({ x: 10, y: 50 }, { x: 90, y: 50 }, obstacle),
    true
  );

  // Line segment ends before the obstacle
  assert.equal(
    lineIntersectsRectangle({ x: 10, y: 50 }, { x: 35, y: 50 }, obstacle),
    false
  );

  // Line segment starts after the obstacle
  assert.equal(
    lineIntersectsRectangle({ x: 65, y: 50 }, { x: 90, y: 50 }, obstacle),
    false
  );

  // Line passes above the obstacle
  assert.equal(
    lineIntersectsRectangle({ x: 10, y: 20 }, { x: 90, y: 20 }, obstacle),
    false
  );

  // Line passes below the obstacle
  assert.equal(
    lineIntersectsRectangle({ x: 10, y: 80 }, { x: 90, y: 80 }, obstacle),
    false
  );

  // Diagonal line cutting through corner
  assert.equal(
    lineIntersectsRectangle({ x: 30, y: 30 }, { x: 70, y: 70 }, obstacle),
    true
  );

  // Both points inside the obstacle
  assert.equal(
    lineIntersectsRectangle({ x: 45, y: 45 }, { x: 55, y: 55 }, obstacle),
    true
  );
});

test("Day 24: getAudioObstructions & checkSoundObstruction", async () => {
  const furniture = [
    {
      _id: new mongoose.Types.ObjectId(),
      name: "Glass Table",
      type: "table",
      x: 40,
      y: 40,
      width: 20,
      height: 20,
      blocksAudio: false, // does not block audio
      obstacleType: "solid",
    },
    {
      _id: new mongoose.Types.ObjectId(),
      name: "Soundproof Partition",
      type: "wall",
      x: 100,
      y: 0,
      width: 10,
      height: 100,
      blocksAudio: true, // blocks audio
      obstacleType: "solid",
    },
  ];

  // Path across Glass Table (blocksAudio: false) -> not an audio obstruction
  const obs1 = getAudioObstructions({ x: 10, y: 50 }, { x: 80, y: 50 }, furniture);
  assert.equal(obs1.length, 0);

  // Path across Soundproof Partition (blocksAudio: true) -> obstructed
  const obs2 = getAudioObstructions({ x: 50, y: 50 }, { x: 150, y: 50 }, furniture);
  assert.equal(obs2.length, 1);
  assert.equal(obs2[0].name, "Soundproof Partition");
  assert.equal(obs2[0].type, "wall");

  // Mock OfficeLayout.findOne for checkSoundObstruction
  const origFindOne = OfficeLayout.findOne;
  try {
    OfficeLayout.findOne = () => ({
      select() {
        return {
          async lean() {
            return { furniture };
          },
        };
      },
    });

    // Avatar A and B with wall between them
    const resultObstructed = await checkSoundObstruction(
      "ROOM_101",
      { x: 50, y: 50 },
      { x: 150, y: 50 }
    );
    assert.equal(resultObstructed.isObstructed, true);
    assert.equal(resultObstructed.hasLineOfSight, false);
    assert.equal(resultObstructed.obstructions.length, 1);

    // Avatar A and C with clear audio path
    const resultClear = await checkSoundObstruction(
      "ROOM_101",
      { x: 50, y: 50 },
      { x: 80, y: 50 }
    );
    assert.equal(resultClear.isObstructed, false);
    assert.equal(resultClear.hasLineOfSight, true);
    assert.equal(resultClear.obstructions.length, 0);
  } finally {
    OfficeLayout.findOne = origFindOne;
  }
});

test("Day 25: calculateSpatialData - Distance, Gain, Panning, and Obstruction", () => {
  const table = {
    _id: "tab1",
    name: "Meeting Table",
    type: "table",
    x: 40,
    y: 20,
    width: 20,
    height: 60,
    blocksAudio: true,
  };

  const listener = { x: 0, y: 50 };

  // 1. Peer on the right, unobstructed
  const peerRight = { userId: "peer_right", x: 30, y: 50 };
  const dataRight = calculateSpatialData(listener, peerRight, [], 100);
  assert.equal(dataRight.peerId, "peer_right");
  assert.equal(dataRight.distance, 30);
  assert.equal(dataRight.hasLineOfSight, true);
  assert.equal(dataRight.isObstructed, false);
  assert.equal(dataRight.relativePosition.x, 30);
  assert.equal(dataRight.relativePosition.y, 0);
  assert.equal(dataRight.pan > 0, true); // Pan positive (right)
  assert.equal(dataRight.gain, 0.7); // (1 - 30/100) * 1 = 0.700

  // 2. Peer on the left
  const peerLeft = { userId: "peer_left", x: -40, y: 50 };
  const dataLeft = calculateSpatialData(listener, peerLeft, [], 100);
  assert.equal(dataLeft.pan < 0, true); // Pan negative (left)
  assert.equal(dataLeft.distance, 40);
  assert.equal(dataLeft.gain, 0.6); // (1 - 40/100) * 1 = 0.600

  // 3. Peer behind audio-blocking table
  const peerBlocked = { userId: "peer_blocked", x: 80, y: 50 };
  const dataBlocked = calculateSpatialData(listener, peerBlocked, [table], 100);
  assert.equal(dataBlocked.isObstructed, true);
  assert.equal(dataBlocked.hasLineOfSight, false);
  assert.equal(dataBlocked.obstructions.length, 1);
  // Unobstructed gain would be (1 - 80/100) = 0.2
  // With obstruction factor 0.25: 0.2 * 0.25 = 0.05
  assert.equal(dataBlocked.gain, 0.05);

  // 4. Peer at edge of earshot radius (100px)
  const peerEdge = { userId: "peer_edge", x: 100, y: 50 };
  const dataEdge = calculateSpatialData(listener, peerEdge, [], 100);
  assert.equal(dataEdge.distance, 100);
  assert.equal(dataEdge.gain, 0);
});

test("Day 25: createSpatialAudioService - Socket.IO distribution and perspectives", () => {
  const emittedTo = new Map();
  const mockIo = {
    to(targetId) {
      return {
        emit(event, payload) {
          if (!emittedTo.has(targetId)) {
            emittedTo.set(targetId, []);
          }
          emittedTo.get(targetId).push({ event, payload });
        },
      };
    },
  };

  const spatialService = createSpatialAudioService(mockIo);

  const furniture = [
    {
      _id: "wall1",
      name: "Divider",
      type: "wall",
      x: 30,
      y: 0,
      width: 10,
      height: 100,
      blocksAudio: true,
    },
  ];

  const nearbyPeers = [
    { userId: "peer_1", x: 50, y: 20 }, // Obstructed by wall
    { userId: "peer_2", x: 20, y: 20 }, // Unobstructed
    { userId: "peer_far", x: 200, y: 200 }, // Outside 100px radius
  ];

  const spatialPeers = spatialService.updateSpatialAudio({
    userId: "listener_user",
    roomId: "OFFICE_DEMO",
    position: { x: 10, y: 20 },
    nearbyPeers,
    furniture,
  });

  // Verify only peers within 100px earshot are included
  assert.equal(spatialPeers.length, 2);
  assert.deepEqual(
    spatialPeers.map((p) => p.peerId).sort(),
    ["peer_1", "peer_2"]
  );

  // Verify listener received spatial:audio:update
  const listenerEvents = emittedTo.get("listener_user");
  assert.ok(listenerEvents);
  assert.equal(listenerEvents[0].event, "spatial:audio:update");
  assert.equal(listenerEvents[0].payload.roomId, "OFFICE_DEMO");
  assert.equal(listenerEvents[0].payload.peers.length, 2);

  // Peer 1 should be obstructed
  const p1 = listenerEvents[0].payload.peers.find((p) => p.peerId === "peer_1");
  assert.equal(p1.isObstructed, true);

  // Peer 2 should have line of sight
  const p2 = listenerEvents[0].payload.peers.find((p) => p.peerId === "peer_2");
  assert.equal(p2.hasLineOfSight, true);

  // Verify reverse perspective sent to peer_1
  const peer1Events = emittedTo.get("peer_1");
  assert.ok(peer1Events);
  assert.equal(peer1Events[0].event, "spatial:audio:update");
  assert.equal(peer1Events[0].payload.peers[0].peerId, "listener_user");
  assert.equal(peer1Events[0].payload.peers[0].isObstructed, true);

  // Verify reverse perspective sent to peer_2
  const peer2Events = emittedTo.get("peer_2");
  assert.ok(peer2Events);
  assert.equal(peer2Events[0].payload.peers[0].peerId, "listener_user");
  assert.equal(peer2Events[0].payload.peers[0].hasLineOfSight, true);

  // Far peer should receive no event
  assert.equal(emittedTo.has("peer_far"), false);
});

