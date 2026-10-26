const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const Avatar = require("../models/Avatar");

const TEST_PREFIX = "benchmark_day15_";
const RADIUS = 100;
const MAX_RESULTS = 100;
const WARMUP_RUNS = 10;
const BENCHMARK_RUNS = 100;

const AVATAR_COUNTS = [100, 500, 1000, 5000];

function randomCoordinate() {
  return Math.floor(Math.random() * 1000);
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

function getStats(times) {
  const average =
    times.reduce((total, time) => total + time, 0) / times.length;

  return {
    average: Number(average.toFixed(3)),
    p95: Number(percentile(times, 0.95).toFixed(3)),
    min: Number(Math.min(...times).toFixed(3)),
    max: Number(Math.max(...times).toFixed(3)),
  };
}

async function seedAvatars(count) {
  const avatars = Array.from({ length: count }, (_, index) => ({
    userId: `${TEST_PREFIX}${index}`,
    username: `BenchmarkUser${index}`,
    position: [randomCoordinate(), randomCoordinate()],
    isOnline: true,
  }));

  // Insert in batches to avoid one very large insert.
  const batchSize = 500;

  for (let i = 0; i < avatars.length; i += batchSize) {
    await Avatar.insertMany(avatars.slice(i, i + batchSize));
  }
}

async function runQuery() {
  const start = process.hrtime.bigint();

  await Avatar.find({
    userId: { $not: { $regex: `^${TEST_PREFIX}` } },
    isOnline: true,
    position: {
      $near: [500, 500],
      $maxDistance: RADIUS,
    },
  })
    .select("userId username position")
    .limit(MAX_RESULTS)
    .lean();

  const end = process.hrtime.bigint();

  return Number(end - start) / 1_000_000;
}

async function benchmarkCount(count) {
  console.log(`\nTesting ${count} online benchmark avatars...`);

  // Remove only this script's previous test records.
  await Avatar.deleteMany({
    userId: { $regex: `^${TEST_PREFIX}` },
  });

  await seedAvatars(count);

  // Warm up the query before recording timings.
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await runQuery();
  }

  const times = [];

  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    times.push(await runQuery());
  }

  const stats = getStats(times);

  return {
    avatars: count,
    runs: BENCHMARK_RUNS,
    averageMs: stats.average,
    p95Ms: stats.p95,
    minMs: stats.min,
    maxMs: stats.max,
    target: stats.p95 < 20 ? "PASS" : "CHECK",
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is missing. Check the backend/.env file."
    );
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    // Ensure the geospatial index exists before benchmarking.
    await Avatar.createIndexes();

    console.log("Radius:", RADIUS, "pixels");
    console.log("Maximum returned peers:", MAX_RESULTS);
    console.log("Warm-up queries:", WARMUP_RUNS);
    console.log("Measured queries per test:", BENCHMARK_RUNS);

    const results = [];

    for (const count of AVATAR_COUNTS) {
      results.push(await benchmarkCount(count));
    }

    console.log("\n===== DAY 15 PROXIMITY BENCHMARK =====");
    console.table(results);
    console.log("All latency measurements are in milliseconds.");
    console.log("PASS means p95 latency is below 20 ms.");
  } finally {
    // Delete only records created by this benchmark.
    await Avatar.deleteMany({
      userId: { $regex: `^${TEST_PREFIX}` },
    }).catch((error) => {
      console.error("Test-avatar cleanup failed:", error.message);
    });

    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exitCode = 1;
});
