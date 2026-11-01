const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const app = require("../src/app");
const { inMemoryRooms, inMemoryParticipants, getMemoryRoomUsers } = require("../src/routes/roomRoutes");

// Helper to make local HTTP requests to the Express app
function makeRequest(server, path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address.port;
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("Username Uniqueness & Validation Test Suite", async (t) => {
  let server;

  await t.before(() => {
    server = app.listen(0);
  });

  await t.after(() => {
    if (server) server.close();
  });

  await t.test("TEST 8: Reject empty username or spaces only", async () => {
    const res1 = await makeRequest(server, "/api/rooms/TEST-ROOM/validate-user", "POST", {
      username: "",
      userId: "u1",
    });
    assert.equal(res1.status, 400);

    const res2 = await makeRequest(server, "/api/rooms/TEST-ROOM/validate-user", "POST", {
      username: "    ",
      userId: "u1",
    });
    assert.equal(res2.status, 400);
  });

  await t.test("TEST 1 & 2: User 1 joins with Suman, User 2 is rejected for Suman and case-insensitive suman", async () => {
    const roomId = "ROOM-ALPHA";
    const roomUsers = getMemoryRoomUsers(roomId);
    roomUsers.clear();

    // User 1 validates and joins
    const res1 = await makeRequest(server, `/api/rooms/${roomId}/validate-user`, "POST", {
      username: "Suman",
      userId: "user-1",
    });
    assert.equal(res1.status, 200);

    // Register User 1 into room
    roomUsers.set("suman", { userId: "user-1", username: "Suman" });

    // User 2 tries exact same name "Suman"
    const res2 = await makeRequest(server, `/api/rooms/${roomId}/validate-user`, "POST", {
      username: "Suman",
      userId: "user-2",
    });
    assert.equal(res2.status, 409);
    assert.equal(res2.body.error, "Username already taken. Please choose another username.");

    // User 2 tries lowercase "suman"
    const res3 = await makeRequest(server, `/api/rooms/${roomId}/validate-user`, "POST", {
      username: "suman",
      userId: "user-2",
    });
    assert.equal(res3.status, 409);
    assert.equal(res3.body.error, "Username already taken. Please choose another username.");

    // User 2 tries uppercase with spaces "   SUMAN   "
    const res4 = await makeRequest(server, `/api/rooms/${roomId}/validate-user`, "POST", {
      username: "   SUMAN   ",
      userId: "user-2",
    });
    assert.equal(res4.status, 409);
    assert.equal(res4.body.error, "Username already taken. Please choose another username.");
  });

  await t.test("TEST 3: User 1 (Suman), User 2 (Karthik), User 3 (Pavan) all join cleanly", async () => {
    const roomId = "ROOM-MULTI";
    const roomUsers = getMemoryRoomUsers(roomId);
    roomUsers.clear();

    const users = [
      { id: "u1", name: "Suman" },
      { id: "u2", name: "Karthik" },
      { id: "u3", name: "Pavan" },
    ];

    for (const u of users) {
      const res = await makeRequest(server, `/api/rooms/${roomId}/validate-user`, "POST", {
        username: u.name,
        userId: u.id,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.valid, true);
      roomUsers.set(u.name.toLowerCase(), { userId: u.id, username: u.name });
    }

    assert.equal(roomUsers.size, 3);
  });

  await t.test("TEST 5: Browser refresh by the same user restores identity without duplication", async () => {
    const roomId = "ROOM-REFRESH";
    const roomUsers = getMemoryRoomUsers(roomId);
    roomUsers.clear();

    roomUsers.set("karthik", { userId: "user-karthik-stable", username: "Karthik" });

    // Same user refreshes with the same userId:
    const res = await makeRequest(server, `/api/rooms/${roomId}/validate-user`, "POST", {
      username: "Karthik",
      userId: "user-karthik-stable",
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.restored, true);
  });

  await t.test("TEST 6: Disconnecting releases the username", async () => {
    const roomId = "ROOM-DISCONNECT";
    const roomUsers = getMemoryRoomUsers(roomId);
    roomUsers.clear();

    roomUsers.set("suman", { userId: "user-1", username: "Suman" });
    assert.equal(roomUsers.has("suman"), true);

    // User leaves / disconnects
    roomUsers.delete("suman");
    assert.equal(roomUsers.has("suman"), false);

    // Now a new user can take "Suman"
    const res = await makeRequest(server, `/api/rooms/${roomId}/validate-user`, "POST", {
      username: "Suman",
      userId: "user-new",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
  });

  await t.test("TEST 7: Different rooms may have users with the same username", async () => {
    const roomA = getMemoryRoomUsers("ROOM-A");
    const roomB = getMemoryRoomUsers("ROOM-B");
    roomA.clear();
    roomB.clear();

    roomA.set("suman", { userId: "user-a", username: "Suman" });

    // Suman joining ROOM-B should be valid and allowed
    const res = await makeRequest(server, "/api/rooms/ROOM-B/validate-user", "POST", {
      username: "Suman",
      userId: "user-b",
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
  });
});
