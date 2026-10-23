const assert = require("node:assert/strict");
const test = require("node:test");
const { io, userSockets } = require("../server");

test("WebRTC signaling relay handlers", async () => {
  userSockets.clear();

  const aliceEvents = [];
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
  };

  const ioEmits = [];
  const originalIoTo = io.to;
  io.to = (targetSocketId) => ({
    emit(event, payload) {
      ioEmits.push({ targetSocketId, event, payload });
    },
  });

  const connectionListeners = io.listeners("connection");
  const connHandler = connectionListeners[connectionListeners.length - 1];

  connHandler(mockAliceSocket);
  connHandler(mockBobSocket);

  // Register Alice and Bob
  await aliceHandlers["avatar:register"]({ userId: "user_A" });
  await bobHandlers["avatar:register"]({ userId: "user_B" });

  assert.equal(userSockets.get("user_A"), "socket-alice");
  assert.equal(userSockets.get("user_B"), "socket-bob");

  // Test 1: Invalid payload or targetUserId emits webrtc:error
  aliceEvents.length = 0;
  aliceHandlers["webrtc:offer"]({ targetUserId: "", payload: {} });
  assert.equal(aliceEvents.length, 1);
  assert.equal(aliceEvents[0].event, "webrtc:error");

  aliceEvents.length = 0;
  aliceHandlers["webrtc:offer"]({ targetUserId: "user_B" }); // missing payload
  assert.equal(aliceEvents.length, 1);
  assert.equal(aliceEvents[0].event, "webrtc:error");

  // Test 2: Target user not connected
  aliceEvents.length = 0;
  aliceHandlers["webrtc:offer"]({ targetUserId: "user_nonexistent", payload: { sdp: "offer" } });
  assert.equal(aliceEvents.length, 1);
  assert.equal(aliceEvents[0].event, "webrtc:error");
  assert.match(aliceEvents[0].payload.message, /not connected/);

  // Test 3: Successful relay of webrtc:offer from Alice to Bob
  ioEmits.length = 0;
  aliceHandlers["webrtc:offer"]({
    targetUserId: "user_B",
    payload: { type: "offer", sdp: "mock-sdp-offer" },
  });
  assert.equal(ioEmits.length, 1);
  assert.equal(ioEmits[0].targetSocketId, "socket-bob");
  assert.equal(ioEmits[0].event, "webrtc:offer");
  assert.equal(ioEmits[0].payload.senderUserId, "user_A");
  assert.equal(ioEmits[0].payload.payload.sdp, "mock-sdp-offer");

  // Test 4: Successful relay of webrtc:answer from Bob to Alice
  ioEmits.length = 0;
  bobHandlers["webrtc:answer"]({
    targetUserId: "user_A",
    payload: { type: "answer", sdp: "mock-sdp-answer" },
  });
  assert.equal(ioEmits.length, 1);
  assert.equal(ioEmits[0].targetSocketId, "socket-alice");
  assert.equal(ioEmits[0].event, "webrtc:answer");
  assert.equal(ioEmits[0].payload.senderUserId, "user_B");
  assert.equal(ioEmits[0].payload.payload.sdp, "mock-sdp-answer");

  // Test 5: Successful relay of webrtc:ice-candidate from Alice to Bob
  ioEmits.length = 0;
  aliceHandlers["webrtc:ice-candidate"]({
    targetUserId: "user_B",
    payload: { candidate: "candidate:123" },
  });
  assert.equal(ioEmits.length, 1);
  assert.equal(ioEmits[0].targetSocketId, "socket-bob");
  assert.equal(ioEmits[0].event, "webrtc:ice-candidate");
  assert.equal(ioEmits[0].payload.senderUserId, "user_A");
  assert.equal(ioEmits[0].payload.payload.candidate, "candidate:123");

  // Test 6: Disconnect cleans up userSockets
  aliceHandlers["disconnect"]();
  assert.equal(userSockets.has("user_A"), false);
  assert.equal(userSockets.get("user_B"), "socket-bob");

  io.to = originalIoTo;
});
