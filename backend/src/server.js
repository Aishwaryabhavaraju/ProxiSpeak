require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./app");

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/proxispeak";

function resolveMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const mongoUri = resolveMongoUri();

  mongoose
    .connect(mongoUri)
    .then(() => {
      app.listen(port, () => console.log(`ProxiSpeak geospatial API listening on ${port}`));
    })
    .catch((error) => {
      console.error("Could not connect to MongoDB", error);
      process.exit(1);
    });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, resolveMongoUri, startServer };