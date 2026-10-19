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

test("Step 3: Test enter/exit detection with Alice, Bob, and Charlie", async (t) => {
  // Import server components
  const { io, previousNearbyUsers } = require("../server");

  // Reset state
  previousNearbyUsers.clear();
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

  // Set up mock socket that registers the server's avatar:move handler
  const socketEvents = [];
  const broadcastEvents = [];
  const handlers = {};

  const mockSocket = {
    id: "socket-alice",
    on(event, handler) {
      handlers[event] = handler;
    },
    emit(event, payload) {
      socketEvents.push({ event, payload });
    },
    broadcast: {
      emit(event, payload) {
        broadcastEvents.push({ event, payload });
      },
    },
  };

  // Trigger the connection handler from server.js to register socket events
  const connectionListeners = io.listeners("connection");
  assert.ok(connectionListeners.length > 0, "io should have a connection listener");
  connectionListeners[connectionListeners.length - 1](mockSocket);

  const moveHandler = handlers["avatar:move"];
  assert.equal(typeof moveHandler, "function", "avatar:move listener must be registered");

  // -------------------------------------------------------------------------
  // 1. Alice moves to [400, 300].
  // Expected: Bob should trigger proximity:enter; Charlie should not.
  // -------------------------------------------------------------------------
  socketEvents.length = 0;
  broadcastEvents.length = 0;

  await moveHandler({ userId: "alice", x: 400, y: 300 });

  // Check Alice's position updated in DB
  const updatedAlice1 = await Avatar.findOne({ userId: "alice" });
  assert.deepEqual(updatedAlice1.position, [400, 300]);

  // Verify proximity:enter event for Bob
  const enterEvents1 = socketEvents.filter((e) => e.event === "proximity:enter");
  assert.equal(enterEvents1.length, 1, "Exactly one proximity:enter event should fire");
  assert.equal(enterEvents1[0].payload.userId, "alice");
  assert.equal(enterEvents1[0].payload.nearbyUser.userId, "bob");
  assert.equal(enterEvents1[0].payload.radius, 100);
  assert.equal(enterEvents1[0].payload.message, "Bob entered earshot.");

  // Verify Charlie did NOT trigger proximity:enter
  const charlieEnter = enterEvents1.find((e) => e.payload.nearbyUser.userId === "charlie");
  assert.equal(charlieEnter, undefined, "Charlie should not trigger proximity:enter");

  // Verify no proximity:exit was fired
  const exitEvents1 = socketEvents.filter((e) => e.event === "proximity:exit");
  assert.equal(exitEvents1.length, 0, "No proximity:exit should fire on initial approach");

  // Verify proximity:update sent current proximity state
  const updateEvents1 = socketEvents.filter((e) => e.event === "proximity:update");
  assert.equal(updateEvents1.length, 1);
  assert.equal(updateEvents1[0].payload.count, 1);
  assert.equal(updateEvents1[0].payload.nearbyUsers[0].userId, "bob");

  // Verify broadcast movement
  assert.equal(broadcastEvents.length, 1);
  assert.equal(broadcastEvents[0].event, "avatar:moved");
  assert.deepEqual(broadcastEvents[0].payload.position, [400, 300]);

  // Verify previousNearbyUsers map state
  assert.deepEqual(previousNearbyUsers.get("alice"), ["bob"]);

  // -------------------------------------------------------------------------
  // 2. Alice moves again but stays within 100 pixels of Bob (e.g., [410, 310]).
  // Distance from [410, 310] to Bob [450, 330] = sqrt(40^2 + 20^2) = 44.72 px <= 100.
  // Expected: No new enter event should fire for Bob.
  // -------------------------------------------------------------------------
  socketEvents.length = 0;
  broadcastEvents.length = 0;

  await moveHandler({ userId: "alice", x: 410, y: 310 });

  const enterEvents2 = socketEvents.filter((e) => e.event === "proximity:enter");
  assert.equal(enterEvents2.length, 0, "No new enter event should fire for Bob");

  const exitEvents2 = socketEvents.filter((e) => e.event === "proximity:exit");
  assert.equal(exitEvents2.length, 0, "No exit event should fire while staying in earshot");

  const updateEvents2 = socketEvents.filter((e) => e.event === "proximity:update");
  assert.equal(updateEvents2.length, 1);
  assert.equal(updateEvents2[0].payload.count, 1);
  assert.equal(updateEvents2[0].payload.nearbyUsers[0].userId, "bob");

  // -------------------------------------------------------------------------
  // 3. Alice moves to [350, 300].
  // Distance to Bob [450, 330] is > 100 px.
  // Expected: proximity:exit should fire for Bob.
  // -------------------------------------------------------------------------
  socketEvents.length = 0;
  broadcastEvents.length = 0;

  await moveHandler({ userId: "alice", x: 350, y: 300 });

  const enterEvents3 = socketEvents.filter((e) => e.event === "proximity:enter");
  assert.equal(enterEvents3.length, 0, "No enter event should fire");

  const exitEvents3 = socketEvents.filter((e) => e.event === "proximity:exit");
  assert.equal(exitEvents3.length, 1, "proximity:exit should fire for Bob");
  assert.equal(exitEvents3[0].payload.userId, "alice");
  assert.equal(exitEvents3[0].payload.nearbyUserId, "bob");
  assert.equal(exitEvents3[0].payload.radius, 100);
  assert.equal(exitEvents3[0].payload.message, "bob left earshot.");

  const updateEvents3 = socketEvents.filter((e) => e.event === "proximity:update");
  assert.equal(updateEvents3.length, 1);
  assert.equal(updateEvents3[0].payload.count, 0, "No users in earshot now");

  // Verify previousNearbyUsers map state has updated to empty
  assert.deepEqual(previousNearbyUsers.get("alice"), []);
});

test("avatar:move validation and error handling", async () => {
  const { io } = require("../server");
  const socketEvents = [];
  const handlers = {};

  const mockSocket = {
    id: "socket-test",
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

