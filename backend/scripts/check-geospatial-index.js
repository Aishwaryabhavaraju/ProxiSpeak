const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const Avatar = require("../models/Avatar");

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // Create any indexes declared in the Mongoose schema.
    await Avatar.createIndexes();

    const indexes = await Avatar.collection.indexes();

    console.log("\n===== AVATAR INDEX VERIFICATION =====");
    console.table(
      indexes.map((index) => ({
        name: index.name,
        keys: JSON.stringify(index.key),
      }))
    );

    const hasPosition2dIndex = indexes.some(
      (index) => index.key?.position === "2d"
    );

    if (!hasPosition2dIndex) {
      throw new Error(
        "Missing 2d index on position. Check Avatar.js."
      );
    }

    console.log("\nSUCCESS: position 2d index exists.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Index verification failed:", error.message);
  process.exitCode = 1;
});
