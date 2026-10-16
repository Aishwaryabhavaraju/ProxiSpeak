const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const Avatar = require("./models/Avatar");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Catch malformed JSON errors gracefully and return JSON instead of HTML
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON payload. Please check your request body in Postman (ensure valid JSON syntax).",
      error: err.message,
    });
  }
  next(err);
});

app.get("/", (req, res) => {
  res.json({
    message: "ProxiSpeak Backend API is running",
  });
});

// GET /api/avatars - Retrieve all avatars
app.get("/api/avatars", async (req, res) => {
  try {
    const avatars = await Avatar.find().sort({ updatedAt: -1 });
    res.status(200).json({
      success: true,
      count: avatars.length,
      avatars,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch avatars",
      error: error.message,
    });
  }
});

// GET /api/avatars/near - Retrieve nearby avatars (must be defined BEFORE :userId)
app.get("/api/avatars/near", async (req, res) => {
  try {
    const x = Number(req.query.x);
    const y = Number(req.query.y);
    const radius = Number(req.query.radius ?? 100);
    const excludeUserId = req.query.excludeUserId;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      !Number.isFinite(radius) ||
      radius < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide valid non-negative x, y, and radius values.",
      });
    }

    const query = {
      position: {
        $near: [x, y],
        $maxDistance: radius,
      },
      isOnline: true,
    };

    if (excludeUserId) {
      query.userId = { $ne: excludeUserId };
    }

    const nearbyAvatars = await Avatar.find(query)
      .select("userId username position isOnline")
      .limit(100);

    res.json({
      success: true,
      count: nearbyAvatars.length,
      radius,
      nearbyAvatars,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to find nearby avatars",
      error: error.message,
    });
  }
});


/**
 * GET /api/avatars/nearby-to/:userId?radius=100
 * Find online avatars closest to a specific user.
 */
app.get("/api/avatars/nearby-to/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const radius = req.query.radius === undefined
      ? 100
      : Number(req.query.radius);

    if (!userId || !userId.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid userId is required.",
      });
    }

    if (
      !Number.isFinite(radius) ||
      radius < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Radius must be a valid non-negative number.",
      });
    }

    // Find the target user's current position
    const targetAvatar = await Avatar.findOne({
      userId: userId.trim(),
      isOnline: true,
    }).select("userId username position");

    if (!targetAvatar) {
      return res.status(404).json({
        success: false,
        message: "Target avatar not found or is offline.",
      });
    }

    const [x, y] = targetAvatar.position;

    // Find other online avatars nearest to the target position
    const nearbyUsers = await Avatar.find({
      userId: { $ne: targetAvatar.userId },
      isOnline: true,
      position: {
        $near: [x, y],
        $maxDistance: radius,
      },
    })
      .select("userId username position isOnline")
      .limit(100)
      .lean();

    // Include straight-line distance in virtual-world pixels
    const usersWithDistance = nearbyUsers.map((avatar) => {
      const [otherX, otherY] = avatar.position;
      const distance = Math.hypot(otherX - x, otherY - y);

      return {
        ...avatar,
        distance: Number(distance.toFixed(2)),
      };
    });

    return res.status(200).json({
      success: true,
      message: "Nearby users retrieved successfully.",
      targetUser: {
        userId: targetAvatar.userId,
        username: targetAvatar.username,
        position: targetAvatar.position,
      },
      radius,
      count: usersWithDistance.length,
      nearbyUsers: usersWithDistance,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to find nearby users.",
      error: error.message,
    });
  }
});

// GET /api/avatars/:userId - Retrieve avatar for a specific user
app.get("/api/avatars/:userId", async (req, res) => {
  try {
    const avatar = await Avatar.findOne({ userId: req.params.userId });
    if (!avatar) {
      return res.status(404).json({
        success: false,
        message: `Avatar not found for userId: ${req.params.userId}`,
      });
    }
    res.status(200).json({
      success: true,
      avatar,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch avatar",
      error: error.message,
    });
  }
});

// POST /api/avatars - Create or update an avatar's position and online status
app.post("/api/avatars", async (req, res) => {
  try {
    let { userId, username, x, y, position, isOnline } = req.body || {};

    // Support position array [x, y] or separate x, y coordinates
    if ((x === undefined || y === undefined) && Array.isArray(position) && position.length === 2) {
      x = position[0];
      y = position[1];
    }

    const numX = Number(x);
    const numY = Number(y);

    if (
      !userId ||
      !username ||
      !Number.isFinite(numX) ||
      !Number.isFinite(numY) ||
      numX < 0 ||
      numY < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide userId, username, and valid non-negative x and y coordinates (or position: [x, y]).",
      });
    }

    const trimmedUserId = String(userId).trim();
    const trimmedUsername = String(username).trim();

    const avatar = await Avatar.findOneAndUpdate(
      { userId: trimmedUserId },
      {
        $set: {
          userId: trimmedUserId,
          username: trimmedUsername,
          position: [numX, numY],
          isOnline: isOnline !== undefined ? Boolean(isOnline) : true,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    res.status(200).json({
      success: true,
      message: "Avatar position saved successfully",
      avatar,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to save avatar",
      error: error.message,
    });
  }
});


/**
 * PATCH /api/avatars/:userId/position
 * Update an existing avatar's latest X/Y coordinates.
 */
app.patch("/api/avatars/:userId/position", async (req, res) => {
  try {
    const { userId } = req.params;
    let { x, y, position } = req.body || {};

    // Accept either { x, y } or { position: [x, y] }
    if (
      (x === undefined || y === undefined) &&
      Array.isArray(position) &&
      position.length === 2
    ) {
      [x, y] = position;
    }

    // Require both coordinates
    if (x === undefined || y === undefined) {
      return res.status(400).json({
        success: false,
        message: "Provide both x and y coordinates.",
      });
    }

    // Reject empty strings, null values, and non-numeric coordinates
    if (
      x === null ||
      y === null ||
      (typeof x === "string" && x.trim() === "") ||
      (typeof y === "string" && y.trim() === "") ||
      !Number.isFinite(Number(x)) ||
      !Number.isFinite(Number(y)) ||
      Number(x) < 0 ||
      Number(y) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Coordinates must be valid non-negative numbers.",
      });
    }

    const numX = Number(x);
    const numY = Number(y);

    // Update the existing avatar; do not create a new one
    const avatar = await Avatar.findOneAndUpdate(
      { userId: userId.trim() },
      {
        $set: {
          position: [numX, numY],
        },
      },
      {
        new: true,
        runValidators: true,
        timestamps: true,
      }
    );

    if (!avatar) {
      return res.status(404).json({
        success: false,
        message: `Avatar not found for userId: ${userId}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Avatar position updated successfully.",
      avatar: {
        userId: avatar.userId,
        username: avatar.username,
        position: avatar.position,
        isOnline: avatar.isOnline,
        updatedAt: avatar.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update avatar position.",
      error: error.message,
    });
  }
});

const startServer = async () => {
  try {
    await connectDB();

    // Create / ensure indexes declared in the Avatar schema
    try {
      await Avatar.createIndexes();
      console.log("Avatar geospatial indexes are ready");
    } catch (indexError) {
      console.warn("Avatar index check:", indexError.message);
    }

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
