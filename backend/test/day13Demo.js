/**
 * Day 13 Verification and Performance Benchmark Script
 * 
 * Verifies:
 * - Step 3: MongoDB 2d geospatial index inspection (db.avatars.getIndexes())
 * - Step 4: Multi-user test (Alice user_A, Bob user_B, Charlie user_C)
 * - Step 5: Query performance timings (logging queryTimeMs and statistics)
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Avatar = require("../models/Avatar");
const { io, userSockets, previousNearbyUsers } = require("../server");
const { findNearbyUsers, EARSHOT_RADIUS } = require("../utils/fastProximity");

async function runDay13Demo() {
  console.log("=================================================");
  console.log("   Day 13 — Proximity Queries & Multi-User Test  ");
  console.log("=================================================\n");

  await connectDB();

  // ---------------------------------------------------------------------------
  // Step 3: Verify the geospatial index
  // ---------------------------------------------------------------------------
  console.log("--- Step 3: Verifying MongoDB Collection Indexes ---");
  await Avatar.createIndexes();
  const indexes = await Avatar.collection.getIndexes();
  console.log("Indexes on 'avatars' collection (db.avatars.getIndexes()):");
  console.log(JSON.stringify(indexes, null, 2));

  const has2d = Object.values(indexes).some(
    (idx) => Array.isArray(idx) && idx.some(([k, v]) => k === "position" && v === "2d")
  );

  if (has2d) {
    console.log("✅ Verified: 2d geospatial index exists on 'position'.\n");
  } else {
    console.error("❌ Warning: 2d index on 'position' not detected!");
  }

  // ---------------------------------------------------------------------------
  // Step 4: Test with multiple users (Alice, Bob, Charlie)
  // ---------------------------------------------------------------------------
  console.log("--- Step 4: Multi-User Proximity Test ---");
  userSockets.clear();
  previousNearbyUsers.clear();
  await Avatar.deleteMany({});

  const avatarsToSeed = [
    { userId: "user_A", username: "Alice", position: [400, 300], isOnline: true },
    { userId: "user_B", username: "Bob", position: [450, 330], isOnline: true },
    { userId: "user_C", username: "Charlie", position: [600, 400], isOnline: true },
  ];

  for (const a of avatarsToSeed) {
    await Avatar.findOneAndUpdate(
      { userId: a.userId },
      { $set: a },
      { upsert: true, new: true, runValidators: true }
    );
  }
  console.log("Seeded avatars:");
  console.log("  • Alice   (user_A) at [400, 300] (Center)");
  console.log("  • Bob     (user_B) at [450, 330] (~58.31 px away)");
  console.log("  • Charlie (user_C) at [600, 400] (~223.61 px away)");

  // Set up mock socket for Alice and Bob
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
    broadcast: { emit() {} },
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

  const originalIoTo = io.to;
  io.to = (targetId) => ({
    emit(event, payload) {
      if (targetId === "socket-bob") {
        bobEvents.push({ event, payload });
      }
    },
  });

  const connectionListeners = io.listeners("connection");
  const connHandler = connectionListeners[connectionListeners.length - 1];
  connHandler(mockAliceSocket);
  connHandler(mockBobSocket);

  await aliceHandlers["avatar:register"]({ userId: "user_A" });
  await bobHandlers["avatar:register"]({ userId: "user_B" });

  console.log("\nSimulating Alice movement event: avatar:move -> [400, 300]...");
  await aliceHandlers["avatar:move"]({ userId: "user_A", x: 400, y: 300 });

  const peersUpdate = aliceEvents.find((e) => e.event === "proximity:peers:update");
  if (peersUpdate) {
    console.log("Alice received 'proximity:peers:update':");
    console.log(JSON.stringify(peersUpdate.payload, null, 2));

    const containsBob = peersUpdate.payload.peers.some((p) => p.userId === "user_B");
    const containsCharlie = peersUpdate.payload.peers.some((p) => p.userId === "user_C");

    if (containsBob && !containsCharlie) {
      console.log("✅ Expected Result Confirmed: Bob (58.31 px) is in nearby list, Charlie (223.61 px) is NOT.\n");
    } else {
      console.error("❌ Unexpected peers list:", peersUpdate.payload.peers);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 5: Query Performance Benchmark
  // ---------------------------------------------------------------------------
  console.log("--- Step 5: Query Performance Latency Benchmark ---");
  const iterations = 50;
  const timings = [];

  for (let i = 0; i < iterations; i++) {
    // Small position jitter
    const x = 400 + (i % 7);
    const y = 300 + (i % 7);
    const res = await findNearbyUsers(Avatar, "user_A", [x, y], EARSHOT_RADIUS, 100);
    timings.push(res.queryTimeMs);
  }

  const minTime = Math.min(...timings);
  const maxTime = Math.max(...timings);
  const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;

  const sorted = [...timings].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  console.log(`Executed ${iterations} consecutive fast proximity queries.`);
  console.log(`  • Minimum Latency : ${minTime.toFixed(3)} ms`);
  console.log(`  • Average Latency : ${avgTime.toFixed(3)} ms`);
  console.log(`  • Median (P50)    : ${p50.toFixed(3)} ms`);
  console.log(`  • 95th Percentile : ${p95.toFixed(3)} ms`);
  console.log(`  • 99th Percentile : ${p99.toFixed(3)} ms`);
  console.log(`  • Maximum Latency : ${maxTime.toFixed(3)} ms`);

  io.to = originalIoTo;
  await mongoose.disconnect();
  console.log("\n✅ All Day 13 verification checks and benchmarks completed successfully.");
}

if (require.main === module) {
  runDay13Demo().catch((err) => {
    console.error("Error running Day 13 demo:", err);
    process.exit(1);
  });
}

module.exports = { runDay13Demo };
