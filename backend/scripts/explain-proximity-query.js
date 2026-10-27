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
    const plan = await Avatar.find({
      isOnline: true,
      position: {
        $near: [500, 500],
        $maxDistance: 100,
      },
    })
      .select("userId username position -_id")
      .limit(100)
      .lean()
      .explain("executionStats");

    console.log(
      JSON.stringify(
        {
          executionStages: plan.executionStats.executionStages,
          totalDocsExamined: plan.executionStats.totalDocsExamined,
          totalKeysExamined: plan.executionStats.totalKeysExamined,
          nReturned: plan.executionStats.nReturned,
          executionTimeMillis:
            plan.executionStats.executionTimeMillis,
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Explain query failed:", error.message);
  process.exitCode = 1;
});
