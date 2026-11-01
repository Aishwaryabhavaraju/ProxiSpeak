const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedUsername: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    socketId: {
      type: String,
      required: true,
    },
    color: {
      type: String,
      default: "#0ea5e9",
    },
    x: {
      type: Number,
      default: 205,
    },
    y: {
      type: Number,
      default: 155,
    },
    direction: {
      type: Number,
      default: 0,
    },
    muted: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

// Compound unique index ensuring one unique username per room!
participantSchema.index({ roomId: 1, normalizedUsername: 1 }, { unique: true });
participantSchema.index({ roomId: 1, userId: 1 });
participantSchema.index({ socketId: 1 });

module.exports = mongoose.model("Participant", participantSchema);
