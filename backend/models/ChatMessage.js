const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["room", "direct"],
      default: "room",
      index: true,
    },
    roomId: {
      type: String,
      trim: true,
      index: true,
      default: "MAIN-OFFICE",
    },
    senderId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    senderUsername: {
      type: String,
      required: true,
      trim: true,
    },
    senderColor: {
      type: String,
      default: "#818CF8",
    },
    recipientId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    recipientUsername: {
      type: String,
      trim: true,
      default: null,
    },
    text: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    reactions: {
      type: Map,
      of: [String], // Map from emoji character e.g. "👍" to array of usernames
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast query of conversation history
chatMessageSchema.index({ roomId: 1, createdAt: -1 });
chatMessageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);

