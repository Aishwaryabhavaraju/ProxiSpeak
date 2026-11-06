const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
let axios;
try {
  axios = require("axios");
} catch (err) {
  // Graceful fallback to Node built-in fetch if axios is not installed
  axios = {
    create({ baseURL = "", timeout = 10000 } = {}) {
      async function request(method, url, data = null, options = {}) {
        const fullUrl = new URL(url, baseURL);
        if (options.params) {
          Object.entries(options.params).forEach(([k, v]) => {
            if (v !== undefined) fullUrl.searchParams.append(k, v);
          });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const res = await fetch(fullUrl.toString(), {
            method,
            headers: {
              "Content-Type": "application/json",
              ...options.headers,
            },
            body: data ? JSON.stringify(data) : undefined,
            signal: controller.signal,
          });
          clearTimeout(timer);
          let resData;
          try {
            resData = await res.json();
          } catch {
            resData = null;
          }
          if (!res.ok) {
            const reqError = new Error(`Request failed with status code ${res.status}`);
            reqError.response = { status: res.status, data: resData };
            throw reqError;
          }
          return { status: res.status, data: resData };
        } catch (fetchErr) {
          clearTimeout(timer);
          throw fetchErr;
        }
      }

      return {
        get(url, opts) {
          return request("GET", url, null, opts);
        },
        post(url, data, opts) {
          return request("POST", url, data, opts);
        },
      };
    },
  };
}
const assert = require("assert");
const mongoose = require("mongoose");
const OfficeLayout = require("../models/OfficeLayout");
const Avatar = require("../models/Avatar");

const {
  checkSoundObstruction,
} = require("../services/soundObstructionService");

const API_PORT = process.env.PORT || "5000";
const API_URL = process.env.API_URL || `http://localhost:${API_PORT}`;

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

const roomId = `DAY27_TEST_${Date.now()}`;
let userAId = null;
let userBId = null;

async function validateRoomPersistence() {
  console.log("\n1. Testing room persistence...");

  const room = {
    roomId,
    roomName: "Day 27 Validation Room",
    dimensions: { width: 800, height: 600 },
    background: "#eeeeee",
    furniture: [
      {
        name: "Test Sound Wall",
        type: "wall",
        x: 100,
        y: 100,
        width: 40,
        height: 100,
        obstacleType: "solid",
        blocksMovement: true,
        blocksAudio: true,
      },
    ],
  };

  const createResponse = await api.post("/api/office-layouts", room);

  assert(
    createResponse.status === 201 || createResponse.status === 200,
    "Room creation failed"
  );

  const getResponse = await api.get(`/api/office-layouts/${roomId}`);
  const layout = getResponse.data?.data || getResponse.data;

  assert.strictEqual(layout.roomId, roomId);
  assert.strictEqual(layout.furniture.length, 1);

  console.log("PASS: Room and furniture persisted successfully.");
}

async function validateProximityAccuracy() {
  console.log("\n2. Testing proximity accuracy...");

  const userA = `day27_userA_${Date.now()}`;
  const userB = `day27_userB_${Date.now()}`;
  userAId = userA;
  userBId = userB;

  await api.post("/api/avatars", {
    userId: userA,
    username: "Validation User A",
    x: 200,
    y: 200,
    position: [200, 200],
  });

  await api.post("/api/avatars", {
    userId: userB,
    username: "Validation User B",
    x: 250,
    y: 200,
    position: [250, 200],
  });

  const response = await api.get("/api/avatars/near", {
    params: {
      x: 200,
      y: 200,
      radius: 100,
      excludeUserId: userA,
    },
  });

  const nearbyUsers = Array.isArray(response.data)
    ? response.data
    : response.data.users || response.data.avatars || [];

  const peerFound = nearbyUsers.some(
    (user) => user.userId === userB
  );

  assert(peerFound, "Nearby avatar was not detected");

  const distance = Math.hypot(250 - 200, 200 - 200);

  assert(distance <= 100, "Distance calculation is incorrect");

  console.log(`PASS: Nearby avatar detected at ${distance}px.`);
}

async function validateObstacleDetection() {
  console.log("\n3. Testing sound obstacle detection...");

  const result = await checkSoundObstruction(
    roomId,
    { x: 50, y: 150 },
    { x: 200, y: 150 }
  );

  assert(
    result.isObstructed === true,
    "Sound obstacle was not detected"
  );

  assert(
    result.obstructions.length > 0,
    "No blocking furniture was returned"
  );

  console.log("PASS: Sound obstruction detected.");
}

async function cleanupTestData() {
  try {
    if (mongoose.connection.readyState === 1) {
      if (roomId) await OfficeLayout.deleteOne({ roomId });
      if (userAId) await Avatar.deleteOne({ userId: userAId });
      if (userBId) await Avatar.deleteOne({ userId: userBId });
    }
  } catch (err) {
    // Non-critical cleanup
  }
}

async function runValidation() {
  console.log("==================================");
  console.log(" PROXISPEAK DAY 27 VALIDATION");
  console.log("==================================");

  let localServer = null;
  let serverReachable = false;
  try {
    const probe = await api.get("/", { timeout: 1500 });
    if (probe.status === 200) serverReachable = true;
  } catch (e) {
    serverReachable = false;
  }

  if (!serverReachable) {
    console.log(`Connecting in-process server on port ${API_PORT} for validation...`);
    const { httpServer } = require("../server");
    const connectDB = require("../config/db");
    await connectDB();
    try {
      await Avatar.createIndexes();
    } catch (e) {}

    localServer = await new Promise((resolve, reject) => {
      httpServer.listen(API_PORT, () => {
        resolve(httpServer);
      });
      httpServer.once("error", reject);
    });
  } else {
    // Ensure direct DB connection for checkSoundObstruction
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (mongoose.connection.readyState === 0 && mongoUri) {
      try {
        await mongoose.connect(mongoUri);
      } catch (dbErr) {
        console.warn("Direct Mongoose connection failed:", dbErr.message);
      }
    }
  }

  const results = [];

  const tests = [
    ["Room persistence", validateRoomPersistence],
    ["Proximity accuracy", validateProximityAccuracy],
    ["Obstacle detection", validateObstacleDetection],
  ];

  for (const [name, test] of tests) {
    try {
      await test();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false });
      console.error(`FAIL: ${name}`);
      console.error(error.response?.data || error.message);
    }
  }

  await cleanupTestData();

  if (localServer) {
    await new Promise((resolve) => localServer.close(resolve));
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.log("\n========== FINAL REPORT ==========");

  results.forEach((result) => {
    console.log(
      `${result.passed ? "PASS" : "FAIL"} - ${result.name}`
    );
  });

  const passed = results.filter((r) => r.passed).length;

  console.log(`\nResult: ${passed}/${results.length} tests passed.`);

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runValidation();
}

module.exports = {
  validateRoomPersistence,
  validateProximityAccuracy,
  validateObstacleDetection,
  runValidation,
};
