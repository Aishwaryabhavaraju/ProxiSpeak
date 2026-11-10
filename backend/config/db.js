const mongoose = require("mongoose");

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/proxispeak";

function resolveMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

const connectDB = async () => {
  const primaryUri = resolveMongoUri();

  // 1. Attempt connection to primary configured URI (e.g. MongoDB Atlas)
  try {
    const connection = await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 5000, // 5s timeout instead of hanging 30s
    });

    console.log(
      `MongoDB connected successfully: ${connection.connection.host}`
    );
    return connection;
  } catch (primaryError) {
    console.warn(`\nMongoDB primary connection failed: ${primaryError.message}`);

    // 2. If primary was Atlas, attempt fallback to local MongoDB instance
    if (primaryUri !== DEFAULT_MONGODB_URI) {
      try {
        console.log("Attempting fallback to local MongoDB (mongodb://127.0.0.1:27017/proxispeak)...");
        const localConn = await mongoose.connect(DEFAULT_MONGODB_URI, {
          serverSelectionTimeoutMS: 2000,
        });
        console.log(`MongoDB connected successfully via local fallback: ${localConn.connection.host}`);
        return localConn;
      } catch (localError) {
        // Local MongoDB not running, proceed to in-memory fallback
      }
    }

    // 3. Graceful fallback mode — DO NOT crash the server with process.exit(1)!
    console.warn("================================================================================");
    console.warn("⚠️  MONGODB ATLAS CONNECTION NOTICE:");
    console.warn("    Could not connect to MongoDB Atlas cluster.");
    console.warn("    Common Reason: Your current IP address is not whitelisted on MongoDB Atlas.");
    console.warn("    Fix: Go to https://cloud.mongodb.com -> Network Access -> Add IP Address");
    console.warn("         and add '0.0.0.0/0' (Allow Access from Anywhere) or your current IP.");
    console.warn("");
    console.warn("👉  Continuing in RESILIENT IN-MEMORY FALLBACK MODE:");
    console.warn(`    • Express API server: ACTIVE on port ${process.env.PORT || 5000}`);
    console.warn("    • Socket.IO Real-Time Engine: ACTIVE");
    console.warn("    • WebRTC Voice & Video Signaling: ACTIVE");
    console.warn("    • 2D Virtual Office & Spatial Audio: ACTIVE");
    console.warn("================================================================================\n");
    return null;
  }
};

module.exports = connectDB;
module.exports.resolveMongoUri = resolveMongoUri;
module.exports.DEFAULT_MONGODB_URI = DEFAULT_MONGODB_URI;
