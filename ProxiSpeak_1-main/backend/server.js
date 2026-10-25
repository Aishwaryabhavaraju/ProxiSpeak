import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const users = new Map();

io.on("connection", (socket) => {
  console.log("[ProxiSpeak] Client connected:", socket.id);

  socket.on("join-office", ({ username, muted = true }) => {
    const spawnX = 180 + Math.floor(Math.random() * 140);
    const spawnY = 130 + Math.floor(Math.random() * 80);
    const newUser = {
      id: socket.id,
      username: String(username || "Guest").slice(0, 30),
      x: spawnX,
      y: spawnY,
      direction: 0,
      muted: Boolean(muted),
    };
    users.set(socket.id, newUser);

    // Confirm local identity & send full user list
    socket.emit("session-confirmed", newUser);
    io.emit("users-update", Array.from(users.values()));
    socket.broadcast.emit("user-joined", newUser);
  });

  socket.on("position-update", ({ x, y, direction = 0, muted }) => {
    const existing = users.get(socket.id);
    if (!existing) return;
    if (typeof x === "number" && typeof y === "number") {
      existing.x = Math.max(12, Math.min(588, Math.round(x)));
      existing.y = Math.max(12, Math.min(438, Math.round(y)));
      existing.direction = Number(direction) || 0;
    }
    if (typeof muted === "boolean") {
      existing.muted = muted;
    }
    socket.broadcast.emit("user-moved", existing);
  });

  socket.on("mute-status", ({ muted }) => {
    const existing = users.get(socket.id);
    if (!existing) return;
    existing.muted = Boolean(muted);
    io.emit("users-update", Array.from(users.values()));
  });

  socket.on("webrtc-offer", ({ targetId, sdp }) => {
    if (
      typeof targetId === "string" &&
      targetId !== socket.id &&
      users.has(targetId) &&
      sdp &&
      typeof sdp === "object"
    ) {
      io.to(targetId).emit("webrtc-offer", { fromId: socket.id, sdp });
    }
  });

  socket.on("webrtc-answer", ({ targetId, sdp }) => {
    if (
      typeof targetId === "string" &&
      targetId !== socket.id &&
      users.has(targetId) &&
      sdp &&
      typeof sdp === "object"
    ) {
      io.to(targetId).emit("webrtc-answer", { fromId: socket.id, sdp });
    }
  });

  socket.on("webrtc-ice-candidate", ({ targetId, candidate }) => {
    if (
      typeof targetId === "string" &&
      targetId !== socket.id &&
      users.has(targetId) &&
      candidate &&
      typeof candidate === "object"
    ) {
      io.to(targetId).emit("webrtc-ice-candidate", { fromId: socket.id, candidate });
    }
  });

  socket.on("disconnect", () => {
    if (users.has(socket.id)) {
      users.delete(socket.id);
      io.emit("user-left", { id: socket.id });
      io.emit("users-update", Array.from(users.values()));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ProxiSpeak Signaling Server running on http://localhost:${PORT}`);
});
