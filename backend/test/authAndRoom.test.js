const assert = require("node:assert/strict");
const test = require("node:test");
const { io, userSockets, roomMembers, socketRooms } = require("../server");

test("Room and Chat Socket.IO lifecycle", async () => {
  userSockets.clear();
  socketRooms.clear();
  roomMembers.clear();

  const aliceEmits = [];
  const aliceHandlers = {};
  const mockAliceSocket = {
    id: "socket-alice",
    data: {},
    join(room) {
      if (!this.rooms) this.rooms = new Set();
      this.rooms.add(room);
    },
    leave(room) {
      if (this.rooms) this.rooms.delete(room);
    },
    on(event, handler) {
      aliceHandlers[event] = handler;
    },
    emit(event, payload) {
      aliceEmits.push({ event, payload });
    },
    to(room) {
      return {
        emit(event, payload) {
          bobEmits.push({ from: "alice", toRoom: room, event, payload });
        },
      };
    },
  };

  const bobEmits = [];
  const bobHandlers = {};
  const mockBobSocket = {
    id: "socket-bob",
    data: {},
    join(room) {
      if (!this.rooms) this.rooms = new Set();
      this.rooms.add(room);
    },
    leave(room) {
      if (this.rooms) this.rooms.delete(room);
    },
    on(event, handler) {
      bobHandlers[event] = handler;
    },
    emit(event, payload) {
      bobEmits.push({ event, payload });
    },
    to(room) {
      return {
        emit(event, payload) {
          aliceEmits.push({ from: "bob", toRoom: room, event, payload });
        },
      };
    },
  };

  const connectionListeners = io.listeners("connection");
  const connHandler = connectionListeners[connectionListeners.length - 1];

  connHandler(mockAliceSocket);
  connHandler(mockBobSocket);

  // 1. Alice joins room "ROOM-TEST"
  await aliceHandlers["join-office"]({
    username: "Alice",
    userId: "user_alice",
    roomId: "ROOM-TEST",
    x: 200,
    y: 150,
  });

  assert.equal(socketRooms.get("socket-alice"), "ROOM-TEST");
  assert.equal(roomMembers.get("ROOM-TEST").size, 1);
  const aliceSession = aliceEmits.find((e) => e.event === "session-confirmed");
  assert.ok(aliceSession);
  assert.equal(aliceSession.payload.username, "Alice");
  assert.equal(aliceSession.payload.roomId, "ROOM-TEST");

  // 2. Bob joins room "ROOM-TEST"
  await bobHandlers["join-office"]({
    username: "Bob",
    userId: "user_bob",
    roomId: "ROOM-TEST",
    x: 240,
    y: 150,
  });

  assert.equal(socketRooms.get("socket-bob"), "ROOM-TEST");
  assert.equal(roomMembers.get("ROOM-TEST").size, 2);

  // 3. Bob moves
  bobHandlers["position-update"]({ x: 250, y: 160, direction: 1, muted: false });
  const bobMovedInAlice = aliceEmits.find((e) => e.event === "user-moved");
  assert.ok(bobMovedInAlice);
  assert.equal(bobMovedInAlice.payload.x, 250);
  assert.equal(bobMovedInAlice.payload.y, 160);

  // 4. Alice leaves room
  aliceHandlers["leave-office"]();
  assert.equal(socketRooms.has("socket-alice"), false);
  assert.equal(roomMembers.get("ROOM-TEST").size, 1);
});

