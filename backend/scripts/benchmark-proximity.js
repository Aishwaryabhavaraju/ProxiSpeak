const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const Avatar = require("../models/Avatar");
const { findNearbyUsers, EARSHOT_RADIUS } =
  require("../utils/fastProximity");

// Replace this import with the exact connectDB import
// already used in your backend/server.js.
const connectDB = require("../config/db");

const WARMUP_RUNS = 20;
const TOTAL_RUNS = 200;
const TARGET_MS = 20;

function percentile(values, percent) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percent / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function benchmark() {
  try {
    await connectDB();

    const testAvatar = await Avatar.findOne({
      isOnline: true,
      position: { $exists: true },
    }).lean();

    if (!testAvatar) {
      throw new Error(
        "No online test avatar found. Create an online avatar first."
      );
    }

    console.log(`Benchmark user: ${testAvatar.userId}`);
    console.log(`Radius: ${EARSHOT_RADIUS}px`);

    // Warm up the database and query execution.
    for (let i = 0; i < WARMUP_RUNS; i++) {
      await findNearbyUsers(
        Avatar,
        testAvatar.userId,
        testAvatar.position,
        EARSHOT_RADIUS,
        100
      );
    }

    const timings = [];

    for (let i = 0; i < TOTAL_RUNS; i++) {
      const result = await findNearbyUsers(
        Avatar,
        testAvatar.userId,
        testAvatar.position,
        EARSHOT_RADIUS,
        100
      );

      timings.push(result.queryTimeMs);
    }

    const average =
      timings.reduce((sum, value) => sum + value, 0) / timings.length;

    const median = percentile(timings, 50);
    const p95 = percentile(timings, 95);
    const max = Math.max(...timings);

    console.log("\n--- ProxiSpeak Benchmark ---");
    console.log(`Runs: ${TOTAL_RUNS}`);
    console.log(`Average: ${average.toFixed(3)} ms`);
    console.log(`Median:  ${median.toFixed(3)} ms`);
    console.log(`P95:     ${p95.toFixed(3)} ms`);
    console.log(`Maximum: ${max.toFixed(3)} ms`);
    console.log(`Target:  under ${TARGET_MS} ms`);

    console.log(
      p95 < TARGET_MS
        ? "RESULT: P95 target achieved."
        : "RESULT: P95 target not achieved; investigate query performance."
    );
  } catch (error) {
    console.error("Benchmark failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

benchmark();
