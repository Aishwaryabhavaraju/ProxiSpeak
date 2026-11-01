const express = require("express");
const mongoose = require("mongoose");
const Room = require("../models/Room");
const Participant = require("../models/Participant");

// In-memory fallback registries if MongoDB is offline or starting
const inMemoryRooms = new Set(["MAIN-OFFICE"]);
// roomId -> Map<normalizedUsername, { userId, username }>
const inMemoryParticipants = new Map();

function getMemoryRoomUsers(roomId) {
  const normRoom = (roomId || "MAIN-OFFICE").trim().toUpperCase();
  if (!inMemoryParticipants.has(normRoom)) {
    inMemoryParticipants.set(normRoom, new Map());
  }
  return inMemoryParticipants.get(normRoom);
}

function createRoomRouter() {
  const router = express.Router();

  // 1. List active rooms
  router.get("/", async (req, res) => {
    try {
      let rooms = [];
      if (mongoose.connection.readyState === 1) {
        try {
          rooms = await Room.find().limit(20).lean();
        } catch (_) {}
      }
      if (!rooms || rooms.length === 0) {
        rooms = Array.from(inMemoryRooms).map((id) => ({
          roomId: id,
          name: id === "MAIN-OFFICE" ? "General Office" : `Workspace ${id}`,
          description: "Active collaboration workspace",
          creatorName: "Team",
          createdAt: new Date().toISOString(),
        }));
      }
      return res.json({ success: true, rooms });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. Create a new room
  router.post("/", async (req, res) => {
    try {
      const createdBy = (req.body?.creatorName || req.body?.username || "creator").trim();
      const roomName = (req.body?.name || "").trim();
      const description = (req.body?.description || "").trim();
      let roomId;
      let collision = true;

      for (let attempts = 0; attempts < 10; attempts++) {
        roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (mongoose.connection.readyState === 1) {
          try {
            const existing = await Room.findOne({ roomId });
            if (!existing && !inMemoryRooms.has(roomId)) {
              collision = false;
              break;
            }
          } catch (_) {
            if (!inMemoryRooms.has(roomId)) {
              collision = false;
              break;
            }
          }
        } else {
          if (!inMemoryRooms.has(roomId)) {
            collision = false;
            break;
          }
        }
      }

      inMemoryRooms.add(roomId);

      const roomData = {
        roomId,
        name: roomName || `Workspace ${roomId}`,
        description,
        creatorName: createdBy,
        createdBy,
        createdAt: new Date().toISOString(),
      };

      if (mongoose.connection.readyState === 1) {
        try {
          await Room.create({ roomId, createdBy, name: roomData.name, description });
        } catch (_) {}
      }

      return res.status(201).json({
        success: true,
        roomId,
        room: roomData,
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to create room: " + err.message });
    }
  });

  // 3. Validate room existence
  router.get("/:roomId", async (req, res) => {
    const rawId = req.params.roomId;
    if (!rawId) {
      return res.status(400).json({ error: "Room ID is required." });
    }

    const roomId = rawId.trim().toUpperCase();

    if (inMemoryRooms.has(roomId)) {
      return res.json({
        success: true,
        roomId,
        exists: true,
        room: {
          roomId,
          name: roomId === "MAIN-OFFICE" ? "General Office" : `Workspace ${roomId}`,
        },
      });
    }

    if (mongoose.connection.readyState === 1) {
      try {
        const room = await Room.findOne({ roomId });
        if (room) {
          inMemoryRooms.add(roomId);
          return res.json({
            success: true,
            roomId,
            exists: true,
            room: {
              roomId,
              name: room.name || `Workspace ${roomId}`,
            },
          });
        }
      } catch (_) {}
    }

    return res.status(404).json({ error: "Room not found. Please create a room first." });
  });

  // 3. Pre-validate username before entering room
  router.post("/:roomId/validate-user", async (req, res) => {
    const rawRoomId = req.params.roomId;
    const rawUsername = req.body?.username;
    const userId = req.body?.userId;

    if (!rawRoomId) {
      return res.status(400).json({ error: "Room ID is required." });
    }

    const roomId = rawRoomId.trim().toUpperCase();
    const username = (rawUsername || "").trim();

    if (!username) {
      return res.status(400).json({ error: "Please enter a display name." });
    }

    if (username.length > 30) {
      return res.status(400).json({ error: "Display name must be 30 characters or fewer." });
    }

    const normalizedUsername = username.toLowerCase();

    // Check in-memory active sockets for this room
    const roomUsers = inMemoryParticipants.get(roomId);
    if (roomUsers) {
      for (const [normUser, data] of roomUsers.entries()) {
        if (normUser === normalizedUsername) {
          // If the request comes from the exact same userId (browser refresh), allow it
          if (userId && data.userId === userId) {
            return res.json({ valid: true, roomId, username, restored: true });
          }
          return res.status(409).json({
            error: "Username already taken. Please choose another username.",
          });
        }
      }
    }

    // Check DB for active participant if MongoDB is actively connected
    if (mongoose.connection.readyState === 1) {
      try {
        const existing = await Participant.findOne({ roomId, normalizedUsername });
        if (existing) {
          if (userId && existing.userId === userId) {
            return res.json({ valid: true, roomId, username, restored: true });
          }
          return res.status(409).json({
            error: "Username already taken. Please choose another username.",
          });
        }
      } catch (_) {}
    }

    return res.json({ valid: true, roomId, username });
  });

  return router;
}

module.exports = {
  createRoomRouter,
  inMemoryRooms,
  inMemoryParticipants,
  getMemoryRoomUsers,
};
