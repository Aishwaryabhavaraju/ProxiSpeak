const mongoose = require("mongoose");

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/proxispeak";

function resolveMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

const connectDB = async () => {
  try {
    const mongoUri = resolveMongoUri();
    const connection = await mongoose.connect(mongoUri);

    console.log(
      `MongoDB connected successfully: ${connection.connection.host}`
    );
    return connection;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.resolveMongoUri = resolveMongoUri;
module.exports.DEFAULT_MONGODB_URI = DEFAULT_MONGODB_URI;
