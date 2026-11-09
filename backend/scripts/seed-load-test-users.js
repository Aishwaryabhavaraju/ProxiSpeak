const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const Avatar = require("../models/Avatar");

async function seedUsers() {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/proxispeak";
    await mongoose.connect(mongoUri);

    const TOTAL_USERS = Number(process.env.TOTAL_USERS || 100);
    const users = [];

    for (let i = 1; i <= TOTAL_USERS; i++) {
      users.push({
        userId: `load_test_user_${i}`,
        username: `LoadTestUser${i}`,
        position: [
          400 + Math.random() * 200,
          300 + Math.random() * 200,
        ],
        isOnline: true,
      });
    }

    for (const user of users) {
      await Avatar.updateOne(
        { userId: user.userId },
        { $set: user },
        { upsert: true, runValidators: true }
      );
    }

    console.log(`${TOTAL_USERS} test avatars prepared.`);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedUsers();

