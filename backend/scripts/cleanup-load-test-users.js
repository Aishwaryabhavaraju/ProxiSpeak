const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const Avatar = require("../models/Avatar");

async function cleanup() {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/proxispeak";
    await mongoose.connect(mongoUri);

    const result = await Avatar.deleteMany({
      userId: /^load_test_user_\d+$/,
    });

    console.log(
      `Removed ${result.deletedCount} load-test avatars.`
    );
  } catch (error) {
    console.error("Cleanup failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

cleanup();

