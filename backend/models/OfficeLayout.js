const mongoose = require("mongoose");

const furnitureSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "table",
        "chair",
        "sofa",
        "plant",
        "desk",
        "bookshelf",
        "cabinet",
        "wall",
        "other",
      ],
    },

    // Position on the 2D office canvas
    x: {
      type: Number,
      required: true,
      min: 0,
    },
    y: {
      type: Number,
      required: true,
      min: 0,
    },

    // Furniture dimensions in pixels
    width: {
      type: Number,
      required: true,
      min: 1,
    },
    height: {
      type: Number,
      required: true,
      min: 1,
    },

    rotation: {
      type: Number,
      default: 0,
    },

    // Obstacle configuration
    obstacleType: {
      type: String,
      enum: ["solid", "non-blocking", "sound-dampening"],
      default: "solid",
    },

    blocksMovement: {
      type: Boolean,
      default: true,
    },

    blocksAudio: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const officeLayoutSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    roomName: {
      type: String,
      required: true,
      trim: true,
    },

    dimensions: {
      width: {
        type: Number,
        required: true,
        min: 100,
      },
      height: {
        type: Number,
        required: true,
        min: 100,
      },
    },

    background: {
      type: String,
      default: "#111827",
    },

    furniture: {
      type: [furnitureSchema],
      default: [],
    },

    createdBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OfficeLayout", officeLayoutSchema);

