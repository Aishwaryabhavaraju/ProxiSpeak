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
    const avatars = [
      {
        userId: "user_A",
        username: "Alice",
        position: [500, 500],
        isOnline: true,
      },
      {
        userId: "user_B",
        username: "Bob",
        position: [520, 510],
        isOnline: true,
      },
      {
        userId: "user_C",
        username: "Charlie",
        position: [550, 480],
        isOnline: true,
      },
    ];

    for (const a of avatars) {
      await Avatar.findOneAndUpdate(
        { userId: a.userId },
        {
          $set: {
            username: a.username,
            position: a.position,
            isOnline: a.isOnline,
          },
        },
        { upsert: true, new: true }
      );
    }

    console.log("Successfully seeded online avatars near [500, 500]:");
    const seeded = await Avatar.find({
      userId: { $in: ["user_A", "user_B", "user_C"] },
    });
    console.table(
      seeded.map((u) => ({
        userId: u.userId,
        username: u.username,
        position: JSON.stringify(u.position),
        isOnline: u.isOnline,
      }))
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Failed to seed nearby avatars:", err);
  process.exitCode = 1;
});
