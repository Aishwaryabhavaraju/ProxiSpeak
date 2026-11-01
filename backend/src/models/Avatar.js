const mongoose = require("mongoose");

const avatarSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, trim: true },
    location: {
      type: [Number],
      required: true,
      validate: {
        validator: (coordinates) =>
          coordinates.length === 2 && coordinates.every(Number.isFinite),
        message: "Location must contain finite [x, y] coordinates",
      },
    },
    lastSeen: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

avatarSchema.index({ location: "2d" });

module.exports = mongoose.model("Avatar", avatarSchema);