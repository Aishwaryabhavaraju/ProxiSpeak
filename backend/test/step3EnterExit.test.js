const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const Avatar = require("../models/Avatar");
const { EARSHOT_RADIUS, calculateDistance } = require("../utils/earshot");

// Use local test database
const TEST_MONGO_URI =
  process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/proxispeak_test";

test.before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI);
  }
  await Avatar.deleteMany({});
  await Avatar.createIndexes();
});

test.after(async () => {
  await Avatar.deleteMany({});
  await mongoose.disconnect();
});

test("Step 1 & 2: User registry and avatar:register event", async () => {
  const { io, userSockets } = require("../server");

  userSockets.clear();

  const socketEvents = [];
  const handlers = {};

  const mockSocket = {
    id: "socket-user1",
    data: {},
    on(event, handler) {
      handlers[event] = handler;
    },
    emit(event, payload) {
      socketEvents.push({ event, payload });
    },
  };

  const connectionListeners = io.listeners("connection");
  connectionListeners[connectionListeners.length - 1](mockSocket);

  const registerHandler = handlers["avatar:register"];
  assert.equal(typeof registerHandler, "function", "avatar:register listener must be registered");

  // Test invalid userIds
  socketEvents.length = 0;
  await registerHandler({});
  assert.equal(socketEvents[0].event, "movement:error");
  assert.equal(socketEvents[0].payload.message, "A valid userId is required.");

  socketEvents.length = 0;
  await registerHandler({ userId: "" });
  assert.equal(socketEvents[0].event, "movement:error");
  assert.equal(socketEvents[0].payload.message, "A valid userId is required.");

  socketEvents.length = 0;
  await registerHandler({ userId: "   " });
  assert.equal(socketEvents[0].event, "movement:error");
  assert.equal(socketEvents[0].payload.message, "A valid userId is required.");

  socketEvents.length = 0;
  await registerHandler({ userId: 12345 });
  assert.equal(socketEvents[0].event, "movement:error");
  assert.equal(socketEvents[0].payload.message, "A valid userId is required.");

  // Test valid userId registration
  socketEvents.length = 0;
  await registerHandler({ userId: "  user_alice  " });
  assert.equal(socketEvents[0].event, "avatar:registered");
  assert.deepEqual(socketEvents[0].payload, {
    success: true,
    userId: "user_alice",
  });
  assert.equal(userSockets.get("user_alice"), "socket-user1");
  assert.equal(mockSocket.data.userId, "user_alice");

  // Test socket disconnect cleans up userSockets
  const disconnectHandler = handlers["disconnect"];
  assert.equal(typeof disconnectHandler, "function");
  disconnectHandler();
  assert.equal(userSockets.get("user_alice"), undefined);
});

test("Step 3 & 5: Proximity results sent to signaling layer (Alice, Bob, Charlie)", async (t) => {
  // Import server components
  const { io, previousNearbyUsers, userSockets } = require("../server");

  // Reset state
  previousNearbyUsers.clear();
  userSockets.clear();
  await Avatar.deleteMany({});

  // Verify distance calculations from prompt:
  // Alice at [400, 300]
  // Bob at [450, 330] -> Distance ~58.31 px
  // Charlie at [600, 400] -> Distance ~223.61 px
  const distBobFromAlice = calculateDistance([400, 300], [450, 330]);
  const distCharlieFromAlice = calculateDistance([400, 300], [600, 400]);

  assert.equal(Number(distBobFromAlice.toFixed(2)), 58.31);
  assert.equal(Number(distCharlieFromAlice.toFixed(2)), 223.61);
  assert.ok(distBobFromAlice <= EARSHOT_RADIUS, "Bob is within 100px of Alice");
  assert.ok(distCharlieFromAlice > EARSHOT_RADIUS, "Charlie is outside 100px of Alice");

  // Create initial avatars in MongoDB:
  // Alice initially somewhere far away
  await Avatar.create([
    { userId: "alice", username: "Alice", position: [0, 0], isOnline: true },
    { userId: "bob", username: "Bob", position: [450, 330], isOnline: true },
    { userId: "charlie", username: "Charlie", position: [600, 400], isOnline: true },
  ]);

  // Set up mock sockets for Alice and Bob
  const aliceEvents = [];
  const aliceBroadcastEvents = [];
  const aliceHandlers = {};

  const mockAliceSocket = {
    id: "socket-alice",
    data: {},
    on(event, handler) {
      aliceHandlers[event] = handler;
    },
    emit(event, payload) {
      aliceEvents.push({ event, payload });
    },
    broadcast: {
      emit(event, payload) {
        aliceBroadcastEvents.push({ event, payload });
      },
    },
  };

  const bobEvents = [];
  const bobHandlers = {};
  const mockBobSocket = {
    id: "socket-bob",
    data: {},
    on(event, handler) {
      bobHandlers[event] = handler;
    },
    emit(event, payload) {
      bobEvents.push({ event, payload });
    },
    broadcast: { emit() {} },
  };

  // Mock io.to to route messages to registered sockets
  const ioToEvents = [];
  const originalIoTo = io.to;
  io.to = (targetId) => ({
    emit(event, payload) {
      ioToEvents.push({ targetId, event, payload });
      if (targetId === "socket-bob") {
        bobEvents.push({ event, payload });
      }
      return true;
    },
  });

  t.after(() => {
    io.to = originalIoTo;
  });

  // Connect Alice and Bob
  const connectionListeners = io.listeners("connection");
  const connHandler = connectionListeners[connectionListeners.length - 1];
  connHandler(mockAliceSocket);
  connHandler(mockBobSocket);

  // Register users
  await aliceHandlers["avatar:register"]({ userId: "alice" });
  await bobHandlers["avatar:register"]({ userId: "bob" });

  assert.equal(userSockets.get("alice"), "socket-alice");
  assert.equal(userSockets.get("bob"), "socket-bob");

  const moveHandler = aliceHandlers["avatar:move"];
  assert.equal(typeof moveHandler, "function", "avatar:move listener must be registered");

  // -------------------------------------------------------------------------
  // 1. Alice moves to [400, 300].
  // Both Alice and Bob are within 100 pixels (~58.31 px).
  // Charlie is 224 pixels away and outside earshot.
  // -------------------------------------------------------------------------
  aliceEvents.length = 0;
  bobEvents.length = 0;
  aliceBroadcastEvents.length = 0;
  ioToEvents.length = 0;

  await moveHandler({ userId: "alice", x: 400, y: 300 });

  // Check Alice's position updated in DB
  const updatedAlice1 = await Avatar.findOne({ userId: "alice" });
  assert.deepEqual(updatedAlice1.position, [400, 300]);

  // Check Alice receives proximity:peers:update
  const peersUpdateEvents = aliceEvents.filter((e) => e.event === "proximity:peers:update");
  assert.equal(peersUpdateEvents.length, 1);
  assert.equal(peersUpdateEvents[0].payload.userId, "alice");
  assert.equal(peersUpdateEvents[0].payload.radius, 100);
  assert.equal(peersUpdateEvents[0].payload.peers.length, 1);
  assert.equal(peersUpdateEvents[0].payload.peers[0].userId, "bob");
  assert.equal(peersUpdateEvents[0].payload.peers[0].distance, 58.31);
  assert.equal(peersUpdateEvents[0].payload.peers[0].canHear, true);

  // Check Alice receives proximity:peer:entered for Bob
  const aliceEnterEvents = aliceEvents.filter((e) => e.event === "proximity:peer:entered");
  assert.equal(aliceEnterEvents.length, 1, "Alice should receive proximity:peer:entered");
  assert.equal(aliceEnterEvents[0].payload.userId, "alice");
  assert.equal(aliceEnterEvents[0].payload.peer.userId, "bob");
  assert.equal(aliceEnterEvents[0].payload.peer.username, "Bob");
  assert.equal(aliceEnterEvents[0].payload.peer.distance, 58.31);

  // Check Bob receives proximity:peer:entered with Alice's details via io.to(bobSocketId)
  const bobEnterEvents = bobEvents.filter((e) => e.event === "proximity:peer:entered");
  assert.equal(bobEnterEvents.length, 1, "Bob should receive proximity:peer:entered");
  assert.equal(bobEnterEvents[0].payload.userId, "bob");
  assert.equal(bobEnterEvents[0].payload.peer.userId, "alice");
  assert.equal(bobEnterEvents[0].payload.peer.username, "Alice");
  assert.equal(bobEnterEvents[0].payload.peer.distance, 58.31);

  // Check Charlie is NOT included in peers or entered events
  const charlieInAlice = aliceEnterEvents.find((e) => e.payload.peer.userId === "charlie");
  assert.equal(charlieInAlice, undefined, "Charlie should not be entered for Alice");

  // Check reciprocal proximity state in previousNearbyUsers
  assert.deepEqual(previousNearbyUsers.get("alice"), ["bob"]);
  assert.deepEqual(previousNearbyUsers.get("bob"), ["alice"]);

  // Verify broadcast movement
  assert.equal(aliceBroadcastEvents.length, 1);
  assert.equal(aliceBroadcastEvents[0].event, "avatar:moved");
  assert.deepEqual(aliceBroadcastEvents[0].payload.position, [400, 300]);

  // -------------------------------------------------------------------------
  // 2. Alice moves again but stays within 100 pixels of Bob ([410, 310]).
  // Distance from [410, 310] to Bob [450, 330] = 44.72 px <= 100.
  // Expected: No new enter or exit events should fire for Bob.
  // -------------------------------------------------------------------------
  aliceEvents.length = 0;
  bobEvents.length = 0;
  ioToEvents.length = 0;

  await moveHandler({ userId: "alice", x: 410, y: 310 });

  const aliceEnter2 = aliceEvents.filter((e) => e.event === "proximity:peer:entered");
  assert.equal(aliceEnter2.length, 0, "No duplicate entered event for Alice");

  const bobEnter2 = bobEvents.filter((e) => e.event === "proximity:peer:entered");
  assert.equal(bobEnter2.length, 0, "No duplicate entered event for Bob");

  const aliceLeft2 = aliceEvents.filter((e) => e.event === "proximity:peer:left");
  assert.equal(aliceLeft2.length, 0, "No left event for Alice");

  const bobLeft2 = bobEvents.filter((e) => e.event === "proximity:peer:left");
  assert.equal(bobLeft2.length, 0, "No left event for Bob");

  // Peers update should still be sent
  const peersUpdate2 = aliceEvents.filter((e) => e.event === "proximity:peers:update");
  assert.equal(peersUpdate2.length, 1);
  assert.equal(peersUpdate2[0].payload.peers[0].userId, "bob");

  // -------------------------------------------------------------------------
  // 3. Alice moves to [350, 300].
  // Distance to Bob [450, 330] is > 100 px (~104.40 px).
  // Expected: Both Alice and Bob receive proximity:peer:left event.
  // -------------------------------------------------------------------------
  aliceEvents.length = 0;
  bobEvents.length = 0;
  ioToEvents.length = 0;

  await moveHandler({ userId: "alice", x: 350, y: 300 });

  // Alice gets proximity:peer:left
  const aliceLeft3 = aliceEvents.filter((e) => e.event === "proximity:peer:left");
  assert.equal(aliceLeft3.length, 1, "Alice should receive proximity:peer:left");
  assert.equal(aliceLeft3[0].payload.userId, "alice");
  assert.equal(aliceLeft3[0].payload.peerUserId, "bob");

  // Bob gets proximity:peer:left
  const bobLeft3 = bobEvents.filter((e) => e.event === "proximity:peer:left");
  assert.equal(bobLeft3.length, 1, "Bob should receive proximity:peer:left");
  assert.equal(bobLeft3[0].payload.userId, "bob");
  assert.equal(bobLeft3[0].payload.peerUserId, "alice");

  // Reciprocal state updated
  assert.deepEqual(previousNearbyUsers.get("alice"), []);
  assert.deepEqual(previousNearbyUsers.get("bob"), []);
});

test("avatar:move validation and error handling", async () => {
  const { io } = require("../server");
  const socketEvents = [];
  const handlers = {};

  const mockSocket = {
    id: "socket-test",
    data: {},
    on(event, handler) {
      handlers[event] = handler;
    },
    emit(event, payload) {
      socketEvents.push({ event, payload });
    },
    broadcast: { emit() {} },
  };

  const connectionListeners = io.listeners("connection");
  connectionListeners[connectionListeners.length - 1](mockSocket);
  const moveHandler = handlers["avatar:move"];

  // Missing / invalid coordinates
  socketEvents.length = 0;
  await moveHandler({ userId: "alice", x: -1, y: 300 });
  assert.equal(socketEvents[0].event, "movement:error");
  assert.equal(socketEvents[0].payload.message, "Valid userId, x, and y are required.");

  // Missing userId
  socketEvents.length = 0;
  await moveHandler({ userId: "", x: 100, y: 100 });
  assert.equal(socketEvents[0].event, "movement:error");
  assert.equal(socketEvents[0].payload.message, "Valid userId, x, and y are required.");

  // Non-existent avatar
  socketEvents.length = 0;
  await moveHandler({ userId: "nonexistent-user", x: 100, y: 100 });
  assert.equal(socketEvents[0].event, "movement:error");
  assert.equal(socketEvents[0].payload.message, "Avatar not found.");
});
