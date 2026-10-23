const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const Avatar = require("./models/Avatar");
const http = require("http");
const { Server } = require("socket.io");
const { calculateDistance } = require("./utils/proximity");
const {
  findNearbyUsers,
  EARSHOT_RADIUS,
} = require("./utils/fastProximity");
const { getProximityChanges } = require("./utils/proximityTracker");

const app = express();

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*", // Development only; restrict this in production
    methods: ["GET", "POST", "PATCH"],
  },
});

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


/**
 * GET /api/avatars/within
 *
 * Example:
 * /api/avatars/within?minX=300&minY=200&maxX=600&maxY=500
 *
 * Find online avatars inside a rectangular virtual-office area.
 */
app.get("/api/avatars/within", async (req, res) => {
  try {
    const { minX, minY, maxX, maxY } = req.query;

    // Validate that all four boundaries are provided
    if (
      minX === undefined ||
      minY === undefined ||
      maxX === undefined ||
      maxY === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide minX, minY, maxX, and maxY.",
      });
    }

    const x1 = Number(minX);
    const y1 = Number(minY);
    const x2 = Number(maxX);
    const y2 = Number(maxY);

    // Validate numeric boundaries and rectangle dimensions
    if (
      ![x1, y1, x2, y2].every(Number.isFinite) ||
      ![minX, minY, maxX, maxY].every(
        (value) => String(value).trim() !== ""
      ) ||
      x1 < 0 ||
      y1 < 0 ||
      x2 < x1 ||
      y2 < y1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide valid non-negative boundaries, with maxX >= minX and maxY >= minY.",
      });
    }

    // Find online avatars inside the rectangular area
    const avatars = await Avatar.find({
      isOnline: true,
      position: {
        $geoWithin: {
          $box: [
            [x1, y1],
            [x2, y2],
          ],
        },
      },
    })
      .select("userId username position isOnline updatedAt")
      .limit(500)
      .lean();

    return res.status(200).json({
      success: true,
      message: "Avatars inside the defined area retrieved successfully.",
      area: {
        minX: x1,
        minY: y1,
        maxX: x2,
        maxY: y2,
      },
      count: avatars.length,
      avatars,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to find avatars inside the defined area.",
      error: error.message,
    });
  }
});

/**
 * GET /api/avatars/nearest/:userId?radius=100&limit=10
 * Find nearest online users and calculate their distances.
 */
app.get("/api/avatars/nearest/:userId", async (req, res) => {
  try {
    const userId = req.params.userId.trim();
    const radius =
      req.query.radius === undefined ? 100 : Number(req.query.radius);
    const limit =
      req.query.limit === undefined ? 10 : Number(req.query.limit);

    if (
      !Number.isFinite(radius) ||
      radius < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Radius must be non-negative and limit must be 1–100.",
      });
    }

    const currentUser = await Avatar.findOne({
      userId,
      isOnline: true,
    }).select("userId username position");

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found or offline.",
      });
    }

    const nearbyUsers = await Avatar.find({
      userId: { $ne: userId },
      isOnline: true,
      position: {
        $near: currentUser.position,
        $maxDistance: radius,
      },
    })
      .select("userId username position isOnline")
      .limit(limit)
      .lean();

    const results = nearbyUsers.map((user) => ({
      ...user,
      distance: Number(
        calculateDistance(currentUser.position, user.position).toFixed(2)
      ),
    }));

    return res.status(200).json({
      success: true,
      currentUser: {
        userId: currentUser.userId,
        username: currentUser.username,
        position: currentUser.position,
      },
      radius,
      count: results.length,
      nearbyUsers: results,
    });
  } catch (error) {
    console.error("Nearest-user calculation failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to calculate nearest users.",
      error: error.message,
    });
  }
});


/**
 * GET /api/avatars/earshot/:userId
 *
 * Finds online users within 100 pixels of the requested avatar.
 */
app.get("/api/avatars/earshot/:userId", async (req, res) => {
  try {
    const userId = req.params.userId.trim();

    const currentUser = await Avatar.findOne({
      userId,
      isOnline: true,
    }).select("userId username position");

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Avatar not found or offline.",
      });
    }

    // MongoDB returns nearby avatars ordered by distance.
    const nearbyAvatars = await Avatar.find({
      userId: { $ne: userId },
      isOnline: true,
      position: {
        $near: currentUser.position,
        $maxDistance: EARSHOT_RADIUS,
      },
    })
      .select("userId username position")
      .limit(100)
      .lean();

    const usersInEarshot = nearbyAvatars.map((avatar) => ({
      userId: avatar.userId,
      username: avatar.username,
      position: avatar.position,
      distance: Number(
        calculateDistance(
          currentUser.position,
          avatar.position
        ).toFixed(2)
      ),
      canHear: true,
    }));

    return res.status(200).json({
      success: true,
      userId: currentUser.userId,
      radius: EARSHOT_RADIUS,
      count: usersInEarshot.length,
      usersInEarshot,
    });
  } catch (error) {
    console.error("Earshot calculation failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to identify users within earshot.",
      error: error.message,
    });
  }
});

// Day 11: Generate proximity groups for all online users
app.get("/api/avatars/proximity-groups", async (req, res) => {
  try {
    const radius =
      req.query.radius === undefined
        ? EARSHOT_RADIUS
        : Number(req.query.radius);

    if (!Number.isFinite(radius) || radius <= 0 || radius > 1000) {
      return res.status(400).json({
        success: false,
        message: "Radius must be greater than 0 and at most 1000.",
      });
    }

    // Get all online avatars.
    const onlineAvatars = await Avatar.find({ isOnline: true })
      .select("userId username position")
      .lean();

    const proximityGroups = [];

    // Find nearby users for each online avatar.
    for (const avatar of onlineAvatars) {
      const nearbyAvatars = await Avatar.find({
        userId: { $ne: avatar.userId },
        isOnline: true,
        position: {
          $near: avatar.position,
          $maxDistance: radius,
        },
      })
        .select("userId username position")
        .limit(100)
        .lean();

      const nearbyUsers = nearbyAvatars.map((nearbyAvatar) => {
        const [x1, y1] = avatar.position;
        const [x2, y2] = nearbyAvatar.position;

        const distance = Math.hypot(x2 - x1, y2 - y1);

        return {
          userId: nearbyAvatar.userId,
          username: nearbyAvatar.username,
          position: nearbyAvatar.position,
          distance: Number(distance.toFixed(2)),
          canHear: distance <= radius,
        };
      });

      proximityGroups.push({
        groupId: `proximity-${avatar.userId}`,
        centerUser: {
          userId: avatar.userId,
          username: avatar.username,
          position: avatar.position,
        },
        radius,
        memberCount: nearbyUsers.length + 1,
        nearbyUserCount: nearbyUsers.length,
        members: [
          {
            userId: avatar.userId,
            username: avatar.username,
            position: avatar.position,
            distance: 0,
            canHear: true,
          },
          ...nearbyUsers,
        ],
      });
    }

    return res.status(200).json({
      success: true,
      radius,
      onlineUserCount: onlineAvatars.length,
      groupCount: proximityGroups.length,
      proximityGroups,
    });
  } catch (error) {
    console.error("Proximity group error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate proximity groups.",
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

    try {
      await Avatar.createIndexes();
      console.log("Avatar geospatial indexes are ready");
    } catch (indexError) {
      console.warn("Avatar index check:", indexError.message);
    }

    const PORT = process.env.PORT || 5000;

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Socket.IO movement integration is ready");
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
};

/**
 * Day 7: Socket.IO movement and proximity integration
 *
 * Client sends:
 * socket.emit("avatar:move", {
 *   userId: "user_A",
 *   x: 450,
 *   y: 320
 * });
 */
// Maps each online user ID to their active Socket.IO socket ID.
const userSockets = new Map();

// Stores each user's latest known proximity peers.
const previousNearbyUsers = new Map();

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("avatar:register", async ({ userId } = {}) => {
    if (typeof userId !== "string" || !userId.trim()) {
      return socket.emit("movement:error", {
        message: "A valid userId is required.",
      });
    }

    const normalizedUserId = userId.trim();

    userSockets.set(normalizedUserId, socket.id);
    socket.data.userId = normalizedUserId;

    socket.emit("avatar:registered", {
      success: true,
      userId: normalizedUserId,
    });
  });

  // Relay a WebRTC offer, answer, or ICE candidate to the target user.
  const relayWebRTCSignal = (socket, eventName) => {
    socket.on(eventName, ({ targetUserId, payload } = {}) => {
      const senderUserId = socket.data.userId;

      if (
        !senderUserId ||
        typeof targetUserId !== "string" ||
        !targetUserId.trim() ||
        !payload
      ) {
        return socket.emit("webrtc:error", {
          message: "Invalid WebRTC signaling payload.",
        });
      }

      const targetSocketId = userSockets.get(targetUserId.trim());

      if (!targetSocketId) {
        return socket.emit("webrtc:error", {
          message: `Peer ${targetUserId} is not connected.`,
        });
      }

      io.to(targetSocketId).emit(eventName, {
        senderUserId,
        payload,
      });
    });
  };

  relayWebRTCSignal(socket, "webrtc:offer");
  relayWebRTCSignal(socket, "webrtc:answer");
  relayWebRTCSignal(socket, "webrtc:ice-candidate");

  socket.on("avatar:move", async (data) => {
    try {
      const { userId, x, y } = data || {};

      if (
        typeof userId !== "string" ||
        !userId.trim() ||
        x === undefined ||
        y === undefined ||
        x === null ||
        y === null ||
        x === "" ||
        y === "" ||
        !Number.isFinite(Number(x)) ||
        !Number.isFinite(Number(y)) ||
        Number(x) < 0 ||
        Number(y) < 0
      ) {
        return socket.emit("movement:error", {
          message: "Valid userId, x, and y are required.",
        });
      }

      const position = [Number(x), Number(y)];

      // Update the existing avatar; do not create a new one.
      const avatar = await Avatar.findOneAndUpdate(
        { userId: userId.trim() },
        { $set: { position, isOnline: true } },
        { new: true, runValidators: true }
      );

      if (!avatar) {
        return socket.emit("movement:error", {
          message: "Avatar not found.",
        });
      }

      const result = await findNearbyUsers(
        Avatar,
        avatar.userId,
        position,
        EARSHOT_RADIUS,
        100
      );

      const peers = result.users;

      // Compare the previous and current peer lists.
      const previousIds = previousNearbyUsers.get(avatar.userId) || [];
      const currentIds = peers.map((peer) => peer.userId);

      const previousSet = new Set(previousIds);
      const currentSet = new Set(currentIds);

      const entered = peers.filter(
        (peer) => !previousSet.has(peer.userId)
      );

      const exited = previousIds.filter(
        (peerId) => !currentSet.has(peerId)
      );

      // Save the moving user's current peer list.
      previousNearbyUsers.set(avatar.userId, currentIds);

      // Update reciprocal proximity state so that the other user's
      // next movement does not generate a duplicate enter/exit event.
      for (const peer of peers) {
        const peerIds = new Set(
          previousNearbyUsers.get(peer.userId) || []
        );

        peerIds.add(avatar.userId);
        previousNearbyUsers.set(peer.userId, [...peerIds]);
      }

      for (const peerId of exited) {
        const peerIds = new Set(
          previousNearbyUsers.get(peerId) || []
        );

        peerIds.delete(avatar.userId);
        previousNearbyUsers.set(peerId, [...peerIds]);
      }

      // Send the optimized proximity result to Member 1.
      socket.emit("proximity:peers:update", {
        userId: avatar.userId,
        radius: result.radius,
        count: result.count,
        queryTimeMs: result.queryTimeMs,
        peers: result.users,
      });

      console.log(
        `Proximity query: ${result.queryTimeMs} ms, ` +
        `${result.count} nearby users for ${avatar.userId}`
      );

      // Notify both sides when a peer enters earshot.
      for (const peer of entered) {
        const eventData = {
          userId: avatar.userId,
          peer: {
            userId: peer.userId,
            username: peer.username,
            position: peer.position,
            distance: peer.distance,
          },
        };

        socket.emit("proximity:peer:entered", eventData);

        const peerSocketId = userSockets.get(peer.userId);

        if (peerSocketId) {
          io.to(peerSocketId).emit("proximity:peer:entered", {
            userId: peer.userId,
            peer: {
              userId: avatar.userId,
              username: avatar.username,
              position: avatar.position,
              distance: peer.distance,
            },
          });
        }
      }

      // Notify both sides when a peer leaves earshot.
      for (const peerId of exited) {
        const eventData = {
          userId: avatar.userId,
          peerUserId: peerId,
        };

        socket.emit("proximity:peer:left", eventData);

        const peerSocketId = userSockets.get(peerId);

        if (peerSocketId) {
          io.to(peerSocketId).emit("proximity:peer:left", {
            userId: peerId,
            peerUserId: avatar.userId,
          });
        }
      }

      // Broadcast the movement to connected clients.
      socket.broadcast.emit("avatar:moved", {
        userId: avatar.userId,
        position,
      });
    } catch (error) {
      console.error("Movement/proximity error:", error);

      socket.emit("movement:error", {
        message: "Failed to update movement and proximity.",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    if (socket.data?.userId && userSockets.get(socket.data.userId) === socket.id) {
      userSockets.delete(socket.data.userId);
    }
  });
});

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  httpServer,
  io,
  previousNearbyUsers,
  userSockets,
  startServer,
};
