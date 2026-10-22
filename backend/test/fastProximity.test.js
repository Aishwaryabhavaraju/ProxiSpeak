const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const Avatar = require("../models/Avatar");
const {
  findNearbyUsers,
  EARSHOT_RADIUS,
  MAX_NEARBY_USERS,
} = require("../utils/fastProximity");

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

test("Step 1: Validation in findNearbyUsers", async () => {
  // Test invalid position
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", null),
    /Position must be a valid \[X, Y\] array\./
  );
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [100]),
    /Position must be a valid \[X, Y\] array\./
  );
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [-5, 100]),
    /Position must be a valid \[X, Y\] array\./
  );
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", ["400", 300]),
    /Position must be a valid \[X, Y\] array\./
  );

  // Test invalid radius
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [400, 300], 0),
    /Radius must be between 0 and 1000\./
  );
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [400, 300], -10),
    /Radius must be between 0 and 1000\./
  );
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [400, 300], 1001),
    /Radius must be between 0 and 1000\./
  );

  // Test invalid limit
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [400, 300], 100, 0),
    /Limit must be an integer between 1 and 100\./
  );
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [400, 300], 100, 101),
    /Limit must be an integer between 1 and 100\./
  );
  await assert.rejects(
    async () => findNearbyUsers(Avatar, "user_A", [400, 300], 100, 5.5),
    /Limit must be an integer between 1 and 100\./
  );
});

test("Step 3: Verify the 2d geospatial index exists on position", async () => {
  const indexes = await Avatar.collection.getIndexes();
  // Check index entries
  const indexEntries = Object.values(indexes);
  const has2dIndex = indexEntries.some(
    (index) => Array.isArray(index) && index.some(([key, val]) => key === "position" && val === "2d")
  );

  assert.ok(
    has2dIndex,
    `Expected 'position: "2d"' index in collection indexes: ${JSON.stringify(indexes)}`
  );
});

test("Step 4: Multi-user test with Alice, Bob, and Charlie", async () => {
  await Avatar.deleteMany({});

  // Alice: user_A at [400, 300]
  // Bob: user_B at [450, 330] -> dist = 58.31 px
  // Charlie: user_C at [600, 400] -> dist = 223.61 px
  await Avatar.create([
    { userId: "user_A", username: "Alice", position: [400, 300], isOnline: true },
    { userId: "user_B", username: "Bob", position: [450, 330], isOnline: true },
    { userId: "user_C", username: "Charlie", position: [600, 400], isOnline: true },
  ]);

  // Query nearby users for Alice at [400, 300]
  const result = await findNearbyUsers(
    Avatar,
    "user_A",
    [400, 300],
    EARSHOT_RADIUS,
    100
  );

  assert.equal(result.radius, 100);
  assert.equal(result.count, 1, "Only Bob should be within 100px earshot");
  assert.ok(result.queryTimeMs >= 0, "Query time must be recorded");

  // Bob should be in the list with exact distance ~58.31
  const bob = result.users.find((u) => u.userId === "user_B");
  assert.ok(bob, "Bob should appear in Alice's nearby list");
  assert.equal(bob.username, "Bob");
  assert.deepEqual(bob.position, [450, 330]);
  assert.equal(bob.distance, 58.31);
  assert.equal(bob.canHear, true);

  // Charlie should NOT be in the list
  const charlie = result.users.find((u) => u.userId === "user_C");
  assert.equal(charlie, undefined, "Charlie should not be in Alice's nearby list");

  // Offline users should not be returned
  await Avatar.updateOne({ userId: "user_B" }, { isOnline: false });
  const resultOffline = await findNearbyUsers(
    Avatar,
    "user_A",
    [400, 300],
    EARSHOT_RADIUS,
    100
  );
  assert.equal(resultOffline.count, 0, "Offline users must be excluded");
});

test("Step 5: Query performance and repeated latency measurement", async () => {
  // Ensure online avatars
  await Avatar.updateMany({}, { isOnline: true });

  const queryTimes = [];
  const iterations = 25;

  for (let i = 0; i < iterations; i++) {
    // Alternate positions slightly around [400, 300]
    const testPos = [400 + (i % 5), 300 + (i % 5)];
    const res = await findNearbyUsers(
      Avatar,
      "user_A",
      testPos,
      EARSHOT_RADIUS,
      100
    );
    queryTimes.push(res.queryTimeMs);
  }

  const avgTime = queryTimes.reduce((acc, t) => acc + t, 0) / queryTimes.length;
  queryTimes.sort((a, b) => a - b);
  const p95 = queryTimes[Math.floor(queryTimes.length * 0.95)];

  assert.equal(queryTimes.length, iterations);
  assert.ok(avgTime >= 0);
  assert.ok(p95 >= 0);
});
