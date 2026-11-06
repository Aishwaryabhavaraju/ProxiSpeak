require("dotenv").config();

const http = require("node:http");
const mongoose = require("mongoose");
const app = require("./app");
const { createSignalingServer } = require("./services/signaling");

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/proxispeak";

function resolveMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const mongoUri = resolveMongoUri();

  await mongoose.connect(mongoUri);
  const httpServer = http.createServer(app);
  let signaling;

  try {
    signaling = await createSignalingServer(httpServer);
    await new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, resolve);
    });
    console.log(`ProxiSpeak API and signaling listening on ${port}`);
    return { httpServer, signaling };
  } catch (error) {
    if (signaling) await signaling.close();
    await mongoose.disconnect();
    throw error;
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Could not start ProxiSpeak server", error);
    process.exitCode = 1;
  });
}

module.exports = { app, resolveMongoUri, startServer };