const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const { io: ioClient } = require("socket.io-client");
const app = require("../src/app");
const createSocketServer = require("../src/socketServer");

test("ProxiSpeak Multi-User WebRTC Signaling Integration Suite", async (t) => {
  let server;
  let ioServer;
  let port;
  const clients = [];

  const createClient = () => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    clients.push(socket);
    return socket;
  };

  await t.before(() => {
    return new Promise((resolve) => {
      server = http.createServer(app);
      ioServer = createSocketServer(server);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  await t.after(() => {
    for (const c of clients) {
      try {
        c.disconnect();
      } catch (_) {}
    }
    if (server) server.close();
  });

  await t.test("TEST 1-2: 4 Participants join the same room and receive correct member synchronization", { timeout: 8000 }, async () => {
    const roomId = "CONF-101";
    const userA = createClient();
    const userB = createClient();
    const userC = createClient();
    const userD = createClient();

    // 1. User A joins
    await new Promise((resolve) => {
      userA.on("session-confirmed", (session) => {
        assert.equal(session.username, "Alice");
        resolve();
      });
      userA.emit("join-office", { roomId, username: "Alice", userId: "usr-alice", muted: true });
    });

    // 2. User B joins; User A must receive user-joined for B, User B must receive Alice in users-update
    await Promise.all([
      new Promise((resolve) => {
        userA.once("user-joined", (u) => {
          assert.equal(u.username, "Bob");
          assert.equal(u.userId, "usr-bob");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userB.once("users-update", (users) => {
          assert.equal(users.length, 1);
          assert.equal(users[0].username, "Alice");
          resolve();
        });
        userB.emit("join-office", { roomId, username: "Bob", userId: "usr-bob", muted: true });
      }),
    ]);

    // 3. User C joins; A and B receive join for C, C receives A and B
    await Promise.all([
      new Promise((resolve) => {
        userA.once("user-joined", (u) => {
          assert.equal(u.username, "Charlie");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userB.once("user-joined", (u) => {
          assert.equal(u.username, "Charlie");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userC.once("users-update", (users) => {
          assert.equal(users.length, 2);
          const names = users.map((u) => u.username).sort();
          assert.deepEqual(names, ["Alice", "Bob"]);
          resolve();
        });
        userC.emit("join-office", { roomId, username: "Charlie", userId: "usr-charlie", muted: true });
      }),
    ]);

    // 4. User D joins; A, B, and C receive join for D, D receives A, B, and C
    await Promise.all([
      new Promise((resolve) => {
        userA.once("user-joined", (u) => {
          assert.equal(u.username, "David");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userB.once("user-joined", (u) => {
          assert.equal(u.username, "David");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userC.once("user-joined", (u) => {
          assert.equal(u.username, "David");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userD.once("users-update", (users) => {
          assert.equal(users.length, 3);
          const names = users.map((u) => u.username).sort();
          assert.deepEqual(names, ["Alice", "Bob", "Charlie"]);
          resolve();
        });
        userD.emit("join-office", { roomId, username: "David", userId: "usr-david", muted: true });
      }),
    ]);
  });

  await t.test("TEST 3-4: Directed WebRTC Signaling is delivered strictly to the target peer", { timeout: 8000 }, async () => {
    const roomId = "CONF-101";
    const userA = clients[0];
    const userB = clients[1];
    const userC = clients[2];
    const userD = clients[3];

    let userCReceivedOffer = false;
    let userDReceivedOffer = false;

    const unexpectedOfferC = () => {
      userCReceivedOffer = true;
    };
    const unexpectedOfferD = () => {
      userDReceivedOffer = true;
    };

    userC.on("webrtc-offer", unexpectedOfferC);
    userD.on("webrtc-offer", unexpectedOfferD);

    // Alice sends WebRTC offer intended exclusively for Bob
    await new Promise((resolve) => {
      userB.once("webrtc-offer", (payload) => {
        assert.equal(payload.senderUserId, "usr-alice");
        assert.equal(payload.targetUserId, "usr-bob");
        assert.equal(payload.sdp.type, "offer");
        resolve();
      });

      userA.emit("webrtc-offer", {
        roomId,
        targetUserId: "usr-bob",
        sdp: { type: "offer", sdp: "dummy-offer-sdp" },
      });
    });

    userC.off("webrtc-offer", unexpectedOfferC);
    userD.off("webrtc-offer", unexpectedOfferD);

    assert.equal(userCReceivedOffer, false, "User C must NOT receive Alice's offer to Bob");
    assert.equal(userDReceivedOffer, false, "User D must NOT receive Alice's offer to Bob");

    // Bob sends WebRTC answer back exclusively to Alice
    let userCReceivedAnswer = false;
    userC.once("webrtc-answer", () => {
      userCReceivedAnswer = true;
    });

    await new Promise((resolve) => {
      userA.once("webrtc-answer", (payload) => {
        assert.equal(payload.senderUserId, "usr-bob");
        assert.equal(payload.targetUserId, "usr-alice");
        assert.equal(payload.sdp.type, "answer");
        resolve();
      });

      userB.emit("webrtc-answer", {
        roomId,
        targetUserId: "usr-alice",
        sdp: { type: "answer", sdp: "dummy-answer-sdp" },
      });
    });

    assert.equal(userCReceivedAnswer, false, "User C must NOT receive Bob's answer to Alice");
  });

  await t.test("TEST 5-7: Microphone mute/unmute state is immediately broadcast to all peers", { timeout: 8000 }, async () => {
    const roomId = "CONF-101";
    const userA = clients[0];
    const userB = clients[1];
    const userC = clients[2];
    const userD = clients[3];

    // User B enables microphone after everyone has joined -> Alice, Charlie, David receive un-mute
    await Promise.all([
      new Promise((resolve) => {
        userA.once("user-mute-changed", (payload) => {
          assert.equal(payload.userId, "usr-bob");
          assert.equal(payload.muted, false);
          resolve();
        });
      }),
      new Promise((resolve) => {
        userC.once("user-mute-changed", (payload) => {
          assert.equal(payload.userId, "usr-bob");
          assert.equal(payload.muted, false);
          resolve();
        });
      }),
      new Promise((resolve) => {
        userD.once("user-mute-changed", (payload) => {
          assert.equal(payload.userId, "usr-bob");
          assert.equal(payload.muted, false);
          resolve();
        });
      }),
      new Promise((resolve) => {
        userB.emit("mute-status", { roomId, muted: false });
        resolve();
      }),
    ]);

    // User C mutes their microphone -> Alice, Bob, David receive mute
    await Promise.all([
      new Promise((resolve) => {
        userA.once("user-mute-changed", (payload) => {
          assert.equal(payload.userId, "usr-charlie");
          assert.equal(payload.muted, true);
          resolve();
        });
      }),
      new Promise((resolve) => {
        userB.once("user-mute-changed", (payload) => {
          assert.equal(payload.userId, "usr-charlie");
          assert.equal(payload.muted, true);
          resolve();
        });
      }),
      new Promise((resolve) => {
        userD.once("user-mute-changed", (payload) => {
          assert.equal(payload.userId, "usr-charlie");
          assert.equal(payload.muted, true);
          resolve();
        });
      }),
      new Promise((resolve) => {
        userC.emit("mute-status", { roomId, muted: true });
        resolve();
      }),
    ]);
  });

  await t.test("TEST 8-9: User D leaves and User E joins cleanly without disconnecting others", { timeout: 8000 }, async () => {
    const roomId = "CONF-101";
    const userA = clients[0];
    const userB = clients[1];
    const userC = clients[2];
    const userD = clients[3];

    // User D leaves
    await Promise.all([
      new Promise((resolve) => {
        userA.once("user-left", (payload) => {
          assert.equal(payload.userId, "usr-david");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userB.once("user-left", (payload) => {
          assert.equal(payload.userId, "usr-david");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userC.once("user-left", (payload) => {
          assert.equal(payload.userId, "usr-david");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userD.emit("leave-office");
        userD.disconnect();
        resolve();
      }),
    ]);

    // New User E joins
    const userE = createClient();
    await Promise.all([
      new Promise((resolve) => {
        userA.once("user-joined", (payload) => {
          assert.equal(payload.username, "Emma");
          assert.equal(payload.userId, "usr-emma");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userB.once("user-joined", (payload) => {
          assert.equal(payload.username, "Emma");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userC.once("user-joined", (payload) => {
          assert.equal(payload.username, "Emma");
          resolve();
        });
      }),
      new Promise((resolve) => {
        userE.once("users-update", (users) => {
          assert.equal(users.length, 3);
          const names = users.map((u) => u.username).sort();
          assert.deepEqual(names, ["Alice", "Bob", "Charlie"]);
          resolve();
        });
        userE.emit("join-office", { roomId, username: "Emma", userId: "usr-emma", muted: false });
      }),
    ]);
  });

  await t.test("TEST 10: Simultaneous WebRTC offer collision (glare) handling and candidate routing", { timeout: 8000 }, async () => {
    const roomId = "CONF-101";
    const userA = clients[0];
    const userB = clients[1];

    // Both users send offers simultaneously to each other
    let userAReceivedOffer = false;
    let userBReceivedOffer = false;

    await Promise.all([
      new Promise((resolve) => {
        userA.once("webrtc-offer", (payload) => {
          assert.equal(payload.fromUserId, "usr-bob");
          userAReceivedOffer = true;
          resolve();
        });
        userB.emit("webrtc-offer", {
          roomId,
          targetUserId: "usr-alice",
          sdp: { type: "offer", sdp: "bob-simultaneous-offer" },
        });
      }),
      new Promise((resolve) => {
        userB.once("webrtc-offer", (payload) => {
          assert.equal(payload.fromUserId, "usr-alice");
          userBReceivedOffer = true;
          resolve();
        });
        userA.emit("webrtc-offer", {
          roomId,
          targetUserId: "usr-bob",
          sdp: { type: "offer", sdp: "alice-simultaneous-offer" },
        });
      }),
    ]);

    assert.equal(userAReceivedOffer, true, "User A received User B's simultaneous offer");
    assert.equal(userBReceivedOffer, true, "User B received User A's simultaneous offer");

    // Test Trickle ICE candidate delivery
    await new Promise((resolve) => {
      userB.once("webrtc-ice-candidate", (payload) => {
        assert.equal(payload.fromUserId, "usr-alice");
        assert.equal(payload.candidate.candidate, "candidate:12345 1 udp 2122260223 127.0.0.1 50000 typ host");
        resolve();
      });
      userA.emit("webrtc-ice-candidate", {
        roomId,
        targetUserId: "usr-bob",
        candidate: { candidate: "candidate:12345 1 udp 2122260223 127.0.0.1 50000 typ host", sdpMLineIndex: 0 },
      });
    });
  });

  await t.test("TEST 11-12: Avatar movement coordinates and direction are broadcast smoothly to peers", { timeout: 8000 }, async () => {
    const roomId = "CONF-101";
    const userA = clients[0];
    const userB = clients[1];

    // User A moves right to (250, 100) facing right (direction 0)
    await Promise.all([
      new Promise((resolve) => {
        userB.once("user-moved", (payload) => {
          assert.equal(payload.userId, "usr-alice");
          assert.equal(payload.x, 250);
          assert.equal(payload.y, 100);
          assert.equal(payload.direction, 0);
          resolve();
        });
      }),
      new Promise((resolve) => {
        userA.emit("position-update", { x: 250, y: 100, direction: 0, muted: false });
        resolve();
      }),
    ]);
  });
});

