const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const Avatar = require("../models/Avatar");

const SEED_PREFIX = "perf_test_";
const SAMPLE_SIZE = 1000;
const RUNS = 100;

function randomCoord(min = 0, max = 1000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

async function setupBenchmarkData() {
  console.log(`Seeding ${SAMPLE_SIZE} test avatars for performance measurement...`);
  // Clean up any old benchmark data
  await Avatar.deleteMany({ userId: { $regex: `^${SEED_PREFIX}` } });

  const testAvatars = [];
  // Ensure some are near [500, 500]
  for (let i = 0; i < 30; i++) {
    testAvatars.push({
      userId: `${SEED_PREFIX}near_${i}`,
      username: `NearUser_${i}`,
      position: [500 + randomCoord(-80, 80), 500 + randomCoord(-80, 80)],
      isOnline: i % 4 !== 0, // 75% online
    });
  }

  // The rest scattered across 0-1000
  for (let i = 30; i < SAMPLE_SIZE; i++) {
    testAvatars.push({
      userId: `${SEED_PREFIX}scatter_${i}`,
      username: `ScatterUser_${i}`,
      position: [randomCoord(0, 1000), randomCoord(0, 1000)],
      isOnline: Math.random() > 0.3,
    });
  }

  // Batch insert
  await Avatar.insertMany(testAvatars);
  console.log("Seeding complete.");
}

async function cleanupBenchmarkData() {
  console.log("Cleaning up temporary test avatars...");
  await Avatar.deleteMany({ userId: { $regex: `^${SEED_PREFIX}` } });
  console.log("Cleanup complete.");
}

async function measureBefore() {
  // BEFORE implementation:
  // 1. find with select("userId username position isOnline")
  // 2. NO .lean() (Hydrated Mongoose documents)
  // 3. Includes _id and isOnline
  const query = {
    position: {
      $near: [500, 500],
      $maxDistance: 100,
    },
    isOnline: true,
    userId: { $ne: "user_A" },
  };

  // Explain stats for Before
  const plan = await Avatar.find(query)
    .select("userId username position isOnline")
    .limit(100)
    .explain("executionStats");

  const totalDocsExamined = plan.executionStats.totalDocsExamined;

  // Warm up
  for (let i = 0; i < 10; i++) {
    await Avatar.find(query)
      .select("userId username position isOnline")
      .limit(100);
  }

  // Latency runs
  const latencies = [];
  let sampleResult;
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    const res = await Avatar.find(query)
      .select("userId username position isOnline")
      .limit(100);
    const t1 = process.hrtime.bigint();
    latencies.push(Number(t1 - t0) / 1_000_000);
    if (i === 0 && res.length > 0) {
      sampleResult = Object.keys(res[0].toObject ? res[0].toObject() : res[0]);
    }
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95 = percentile(latencies, 0.95);

  return {
    average: Number(avg.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    docsExamined: totalDocsExamined,
    fields: sampleResult ? sampleResult.join(", ") : "_id, userId, username, position, isOnline",
  };
}

async function measureAfter() {
  // AFTER implementation:
  // 1. filter with userId: { $ne: excludeUserId }, isOnline: true, position: { $near, $maxDistance }
  // 2. .select("userId username position -_id")
  // 3. .limit(100).lean().exec()
  // 4. In-memory distance calculation and field formatting
  const filter = {
    isOnline: true,
    position: {
      $near: [500, 500],
      $maxDistance: 100,
    },
    userId: { $ne: "user_A" },
  };

  // Explain stats for After
  const plan = await Avatar.find(filter)
    .select("userId username position -_id")
    .limit(100)
    .lean()
    .explain("executionStats");

  const totalDocsExamined = plan.executionStats.totalDocsExamined;

  // Warm up
  for (let i = 0; i < 10; i++) {
    await Avatar.find(filter)
      .select("userId username position -_id")
      .limit(100)
      .lean()
      .exec();
  }

  // Latency runs
  const latencies = [];
  let sampleResult;
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    const users = await Avatar.find(filter)
      .select("userId username position -_id")
      .limit(100)
      .lean()
      .exec();

    const results = users.map((user) => {
      const distance = Math.hypot(
        user.position[0] - 500,
        user.position[1] - 500
      );
      return {
        ...user,
        distance: Number(distance.toFixed(2)),
        canHear: distance <= 100,
      };
    });
    const t1 = process.hrtime.bigint();
    latencies.push(Number(t1 - t0) / 1_000_000);
    if (i === 0 && results.length > 0) {
      sampleResult = Object.keys(results[0]);
    }
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95 = percentile(latencies, 0.95);

  return {
    average: Number(avg.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    docsExamined: totalDocsExamined,
    fields: sampleResult ? sampleResult.join(", ") : "userId, username, position, distance, canHear",
  };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await Avatar.createIndexes();
    await setupBenchmarkData();

    console.log(`Running ${RUNS} iterations for Before (Unoptimized: no lean, all fields hydrated)...`);
    const beforeStats = await measureBefore();

    console.log(`Running ${RUNS} iterations for After (Optimized: .lean(), select -_id, distance)...`);
    const afterStats = await measureAfter();

    console.log("\n================ COMPARISON TABLE ================");
    console.table([
      {
        Metric: "Average latency",
        Before: `${beforeStats.average} ms`,
        After: `${afterStats.average} ms`,
        Improvement: `${(((beforeStats.average - afterStats.average) / beforeStats.average) * 100).toFixed(1)}% faster`,
      },
      {
        Metric: "p95 latency",
        Before: `${beforeStats.p95} ms`,
        After: `${afterStats.p95} ms`,
        Improvement: `${(((beforeStats.p95 - afterStats.p95) / beforeStats.p95) * 100).toFixed(1)}% faster`,
      },
      {
        Metric: "Documents examined",
        Before: `${beforeStats.docsExamined}`,
        After: `${afterStats.docsExamined}`,
        Improvement: "Indexed 2d lookup",
      },
      {
        Metric: "Returned fields",
        Before: beforeStats.fields,
        After: afterStats.fields,
        Improvement: "Stripped _id and isOnline",
      },
    ]);
  } finally {
    await cleanupBenchmarkData();
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("Comparison measurement failed:", err);
  process.exitCode = 1;
});
