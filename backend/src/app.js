const express = require("express");
const Avatar = require("./models/Avatar");
const createAvatarRouter = require("./routes/avatarRoutes");
const { createRoomRouter } = require("./routes/roomRoutes");

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.get("/health", (request, response) => response.json({ status: "ok" }));
app.use("/api/avatars", createAvatarRouter(Avatar));
app.use("/api/rooms", createRoomRouter());

app.use((error, request, response, next) => {
  const status = error.status || error.statusCode || 500;
  const message = status >= 500 ? "Internal server error" : error.message;
  if (status >= 500) console.error(error);
  response.status(status).json({ error: message });
});

module.exports = app;