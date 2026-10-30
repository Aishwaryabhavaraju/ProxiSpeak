const express = require("express");
const Room = require("../models/Room");

const router = express.Router();

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// POST /api/rooms - Create a new room
router.post("/", async (req, res) => {
  try {
    const { name, description, isPrivate, creatorId, creatorName } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Room name is required.",
      });
    }

    let roomId;
    let attempts = 0;
    while (!roomId && attempts < 10) {
      attempts++;
      const candidate = generateRoomId();
      const existing = await Room.findOne({ roomId: candidate });
      if (!existing) {
        roomId = candidate;
      }
    }

    if (!roomId) {
      roomId = `ROOM-${Date.now().toString(36).toUpperCase()}`;
    }

    const room = await Room.create({
      roomId,
      name: name.trim(),
      description: (description || "").trim(),
      creatorId: creatorId || "guest",
      creatorName: creatorName || "Guest",
      isPrivate: Boolean(isPrivate),
    });

    return res.status(201).json({
      success: true,
      message: "Room created successfully",
      room: {
        roomId: room.roomId,
        name: room.name,
        description: room.description,
        creatorId: room.creatorId,
        creatorName: room.creatorName,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error("Room creation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create room.",
      error: error.message,
    });
  }
});

// GET /api/rooms - List recent public rooms
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({ isPrivate: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.status(200).json({
      success: true,
      rooms,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch rooms.",
      error: error.message,
    });
  }
});

// GET /api/rooms/:roomId - Get and validate room existence
router.get("/:roomId", async (req, res) => {
  try {
    const normalizedId = req.params.roomId.trim().toUpperCase();
    const room = await Room.findOne({ roomId: normalizedId }).lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found. Please verify the room ID.",
      });
    }

    return res.status(200).json({
      success: true,
      room,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to query room.",
      error: error.message,
    });
  }
});

module.exports = router;

