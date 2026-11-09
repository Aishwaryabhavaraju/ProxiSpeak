const axios = require("axios");
const { performance } = require("perf_hooks");

// =====================================
// LOAD TEST CONFIGURATION
// =====================================

const BASE_URL = process.env.API_URL || "http://localhost:5000";

const TOTAL_USERS = Number(process.env.TOTAL_USERS || 100);
const MOVEMENTS_PER_USER = Number(process.env.MOVEMENTS_PER_USER || 20);
const CONCURRENT_USERS = Number(process.env.CONCURRENT_USERS || 20);

const EARSHOT_RADIUS = 100;

const results = {
  movementLatencies: [],
  queryLatencies: [],
  successfulMovements: 0,
  failedMovements: 0,
  successfulQueries: 0,
  failedQueries: 0,
};

// =====================================
// LATENCY STATISTICS
// =====================================

function calculateStats(values) {
  if (!values.length) {
    return { min: 0, max: 0, avg: 0, p95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);

  const sum = sorted.reduce((total, value) => total + value, 0);

  return {
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    avg: Number((sum / sorted.length).toFixed(2)),
    p95: Number(
      sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)
    ),
  };
}

// =====================================
// SIMULATE AVATAR MOVEMENT
// =====================================

async function simulateMovement(userId, x, y) {
  const start = performance.now();

  try {
    // Update an existing avatar's position.
    const response = await axios.patch(
      `${BASE_URL}/api/avatars/${encodeURIComponent(userId)}/position`,
      {
        x,
        y,
      },
      { timeout: 10000 }
    );

    const latency = performance.now() - start;

    results.movementLatencies.push(latency);
    results.successfulMovements++;

    return true;
  } catch (error) {
    results.failedMovements++;

    if (results.failedMovements <= 5) {
      console.error(
        `Movement failed for ${userId}:`,
        error.response?.status || error.message
      );
    }

    return false;
  }
}

// =====================================
// SIMULATE PROXIMITY QUERIES
// =====================================

async function simulateProximityQuery(x, y) {
  const start = performance.now();

  try {
    await axios.get(`${BASE_URL}/api/avatars/near`, {
      params: {
        x,
        y,
        radius: EARSHOT_RADIUS,
      },
      timeout: 10000,
    });

    const latency = performance.now() - start;

    results.queryLatencies.push(latency);
    results.successfulQueries++;

    return true;
  } catch (error) {
    results.failedQueries++;

    if (results.failedQueries <= 5) {
      console.error(
        "Proximity query failed:",
        error.response?.status || error.message
      );
    }

    return false;
  }
}

// =====================================
// SIMULATE ONE USER
// =====================================

async function simulateUser(userNumber) {
  const userId = `load_test_user_${userNumber}`;

  for (let movement = 0; movement < MOVEMENTS_PER_USER; movement++) {
    // Generate virtual Canvas coordinates.
    const x = 400 + Math.random() * 200;
    const y = 300 + Math.random() * 200;

    await simulateMovement(userId, x, y);

    // Query nearby users after movement.
    await simulateProximityQuery(x, y);
  }
}

// =====================================
// RUN CONCURRENT USERS IN BATCHES
// =====================================

async function runLoadTest() {
  console.log("\n================================");
  console.log("PROXISPEAK DAY 19 LOAD TEST");
  console.log("================================");

  console.log("API:", BASE_URL);
  console.log("Total users:", TOTAL_USERS);
  console.log("Concurrent users:", CONCURRENT_USERS);
  console.log("Movements per user:", MOVEMENTS_PER_USER);

  const startTime = performance.now();

  // Process users in batches to control concurrency.
  for (
    let start = 1;
    start <= TOTAL_USERS;
    start += CONCURRENT_USERS
  ) {
    const end = Math.min(
      start + CONCURRENT_USERS,
      TOTAL_USERS + 1
    );

    const batch = [];

    for (let user = start; user < end; user++) {
      batch.push(simulateUser(user));
    }

    await Promise.all(batch);

    console.log(
      `Completed ${end - 1}/${TOTAL_USERS} users`
    );
  }

  const totalTime = (performance.now() - startTime) / 1000;

  // =====================================
  // FINAL REPORT
  // =====================================

  const totalEvents =
    results.successfulMovements + results.successfulQueries;

  console.log("\n================================");
  console.log("LOAD TEST RESULTS");
  console.log("================================");

  console.log("\nMOVEMENT STATISTICS");

  console.table(calculateStats(results.movementLatencies));

  console.log("Successful movements:", results.successfulMovements);
  console.log("Failed movements:", results.failedMovements);

  console.log("\nPROXIMITY QUERY STATISTICS");

  console.table(calculateStats(results.queryLatencies));

  console.log("Successful queries:", results.successfulQueries);
  console.log("Failed queries:", results.failedQueries);

  console.log("\nOVERALL PERFORMANCE");

  console.log("Total execution time:", totalTime.toFixed(2), "seconds");

  console.log(
    "Total successful HTTP operations:",
    totalEvents
  );

  console.log(
    "HTTP operations per second:",
    (totalEvents / totalTime).toFixed(2)
  );

  console.log(
    "Total failed HTTP operations:",
    results.failedMovements + results.failedQueries
  );

  console.log("\n================================");
  console.log("LOAD TEST COMPLETED");
  console.log("================================");
}

runLoadTest().catch((error) => {
  console.error("Load test encountered an error:", error);
  process.exitCode = 1;
});

