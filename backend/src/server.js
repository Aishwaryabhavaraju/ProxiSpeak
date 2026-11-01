require("dotenv").config();

const http = require("http");
const mongoose = require("mongoose");
const app = require("./app");
const createSocketServer = require("./socketServer");

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/proxispeak";

function resolveMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

const server = http.createServer(app);
const io = createSocketServer(server);

function startServer() {
  const port = Number(process.env.PORT) || 5000;
  const mongoUri = resolveMongoUri();

  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log(`Connected to MongoDB at ${mongoUri}`);
    })
    .catch((error) => {
      console.warn("MongoDB connection warning:", error.message);
      console.warn("Running with memory state for real-time signaling.");
    });

  server.listen(port, () => {
    console.log(`ProxiSpeak API & WebRTC Signaling server listening on port ${port}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, resolveMongoUri, startServer };