require("dotenv").config();

const { resolveMongoUri } = require("../config/db");
const server = require("../server");

module.exports = {
  app: server.app,
  httpServer: server.httpServer,
  io: server.io,
  resolveMongoUri,
  startServer: server.startServer,
};

if (require.main === module) {
  server.startServer();
}
