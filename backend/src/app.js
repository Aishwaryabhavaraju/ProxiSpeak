const express = require("express");
const Avatar = require("./models/Avatar");
const createAvatarRouter = require("./routes/avatarRoutes");

const app = express();

app.use(express.json());
app.get("/health", (request, response) => response.json({ status: "ok" }));
app.use("/api/avatars", createAvatarRouter(Avatar));

app.use((error, request, response, next) => {
  const status = error.status || error.statusCode || 500;
  const message = status >= 500 ? "Internal server error" : error.message;
  if (status >= 500) console.error(error);
  response.status(status).json({ error: message });
});

module.exports = app;