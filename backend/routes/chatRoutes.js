const express = require("express");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const ChatMessage = require("../models/ChatMessage");

const router = express.Router();

const inMemoryRoomMessages = new Map();
const inMemoryDirectMessages = [];

/**
 * GET /api/chat/room/:roomId
 * Retrieve message history for a specific room (up to 100 messages).
 */
router.get("/room/:roomId", async (req, res) => {
  try {
    const roomId = String(req.params.roomId).trim().toUpperCase();
    const limit = Math.min(Number(req.query.limit) || 100, 200);

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      const msgs = inMemoryRoomMessages.get(roomId) || [];
      return res.status(200).json({
        success: true,
        roomId,
        count: msgs.length,
        messages: msgs.slice(-limit),
      });
    }

    const messages = await ChatMessage.find({
      type: "room",
      roomId,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Return in chronological order
    return res.status(200).json({
      success: true,
      roomId,
      count: messages.length,
      messages: messages.reverse(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch room messages",
      error: error.message,
    });
  }
});

/**
 * GET /api/chat/direct/:userA/:userB
 * Retrieve direct message history between two users (up to 100 messages).
 */
router.get("/direct/:userA/:userB", async (req, res) => {
  try {
    const userA = String(req.params.userA).trim();
    const userB = String(req.params.userB).trim();
    const limit = Math.min(Number(req.query.limit) || 100, 200);

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      const msgs = inMemoryDirectMessages.filter(
        (m) =>
          (m.senderId === userA && m.recipientId === userB) ||
          (m.senderId === userB && m.recipientId === userA)
      );
      return res.status(200).json({
        success: true,
        participants: [userA, userB],
        count: msgs.length,
        messages: msgs.slice(-limit),
      });
    }

    const messages = await ChatMessage.find({
      type: "direct",
      $or: [
        { senderId: userA, recipientId: userB },
        { senderId: userB, recipientId: userA },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      participants: [userA, userB],
      count: messages.length,
      messages: messages.reverse(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch direct messages",
      error: error.message,
    });
  }
});

/**
 * POST /api/chat/message
 * Save a new message via REST API (fallback / HTTP clients)
 */
router.post("/message", async (req, res) => {
  try {
    const {
      type = "room",
      roomId = "MAIN-OFFICE",
      senderId,
      senderUsername,
      senderColor = "#818CF8",
      recipientId = null,
      recipientUsername = null,
      text,
    } = req.body;

    if (!senderId || !senderUsername || !text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "senderId, senderUsername, and text are required.",
      });
    }

    const message = await ChatMessage.create({
      messageId: randomUUID(),
      type,
      roomId: type === "room" ? String(roomId).trim().toUpperCase() : null,
      senderId: String(senderId).trim(),
      senderUsername: String(senderUsername).trim(),
      senderColor,
      recipientId: recipientId ? String(recipientId).trim() : null,
      recipientUsername: recipientUsername ? String(recipientUsername).trim() : null,
      text: String(text).trim(),
      reactions: {},
    });

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to save message",
      error: error.message,
    });
  }
});

/**
 * POST /api/chat/read
 * Mark direct messages from senderId to recipientId as read
 */
router.post("/read", async (req, res) => {
  try {
    const { senderId, recipientId } = req.body;
    if (!senderId || !recipientId) {
      return res.status(400).json({
        success: false,
        message: "senderId and recipientId are required.",
      });
    }

    const result = await ChatMessage.updateMany(
      {
        type: "direct",
        senderId: String(senderId).trim(),
        recipientId: String(recipientId).trim(),
        read: false,
      },
      {
        $set: { read: true },
      }
    );

    return res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to mark messages as read",
      error: error.message,
    });
  }
});

/**
 * POST /api/chat/reaction
 * Add or toggle an emoji reaction on a message
 */
router.post("/reaction", async (req, res) => {
  try {
    const { messageId, emoji, username } = req.body;
    if (!messageId || !emoji || !username) {
      return res.status(400).json({
        success: false,
        message: "messageId, emoji, and username are required.",
      });
    }

    const message = await ChatMessage.findOne({ messageId });
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    const currentReactions = message.reactions || new Map();
    const users = currentReactions.get(emoji) || [];

    const userIndex = users.indexOf(username);
    if (userIndex > -1) {
      // Toggle off
      users.splice(userIndex, 1);
    } else {
      // Toggle on
      users.push(username);
    }

    if (users.length === 0) {
      currentReactions.delete(emoji);
    } else {
      currentReactions.set(emoji, users);
    }

    message.reactions = currentReactions;
    await message.save();

    return res.status(200).json({
      success: true,
      messageId,
      reactions: Object.fromEntries(message.reactions || []),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to toggle reaction",
      error: error.message,
    });
  }
});

module.exports = router;

