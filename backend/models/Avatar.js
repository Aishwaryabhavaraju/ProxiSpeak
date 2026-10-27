
const mongoose = require("mongoose");

const avatarSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
    },

    // Virtual-world coordinates: [X, Y]
    position: {
      type: [Number],
      required: true,
      validate: {
        validator: function (coordinates) {
          return (
            Array.isArray(coordinates) &&
            coordinates.length === 2 &&
            coordinates.every(Number.isFinite) &&
            coordinates.every((value) => value >= 0)
          );
        },
        message: "Position must contain valid non-negative [X, Y] coordinates.",
      },
    },

    isOnline: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Canvas [X, Y] coordinates require a legacy 2d index.
avatarSchema.index(
  { position: "2d" },
  { min: -100000, max: 100000 }
);

module.exports = mongoose.model("Avatar", avatarSchema);
