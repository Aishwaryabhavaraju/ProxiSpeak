const mongoose = require("mongoose");

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    startTime: {
      type: String, // HH:MM (24-hour)
      required: true,
    },
    endTime: {
      type: String, // HH:MM (24-hour)
      required: true,
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 480,
    },
    roomId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    roomName: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
    },
    creatorName: {
      type: String,
      default: "Host",
      trim: true,
    },
    invitees: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["scheduled", "in-progress", "completed", "cancelled"],
      default: "scheduled",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Meeting", meetingSchema);

