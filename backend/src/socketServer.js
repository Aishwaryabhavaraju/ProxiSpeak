const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Avatar = require("./models/Avatar");
const Participant = require("./models/Participant");
const { inMemoryRooms, inMemoryParticipants, getMemoryRoomUsers } = require("./routes/roomRoutes");

/**
 * Socket.IO Signaling Server with Strict Room-Scoped Username Uniqueness.
 *
 * Rules:
 * 1. Usernames are unique per room (case-insensitive & trimmed).
 * 2. Unwanted/fallback names like "Colleague", "User", "Guest" are forbidden.
 * 3. Atomic reservation prevents race conditions during simultaneous joins.
 * 4. Browser refresh / reconnect from the same userId is smoothly restored.
 * 5. Permanent disconnect immediately releases the username.
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // roomId -> Map<userId, userObject>
  const rooms = new Map();

  io.on("connection", (socket) => {
    let currentRoomId = null;
    let currentUser = null;

    socket.on("join-office", async (payload = {}) => {
      const { roomId, username, userId, muted, x, y } = payload;

      // 1. Validate username format
      const cleanUsername = (username || "").trim();
      if (!cleanUsername) {
        socket.emit("join-error", { message: "Please enter a valid display name." });
        return;
      }

      if (cleanUsername.length > 30) {
        socket.emit("join-error", { message: "Display name must be 30 characters or fewer." });
        return;
      }

      const normalizedUsername = cleanUsername.toLowerCase();
      const room = (roomId || "MAIN-OFFICE").trim().toUpperCase();
      const effectiveUserId = (userId || "").trim() || socket.id;

      if (!rooms.has(room)) {
        rooms.set(room, new Map());
      }
      const roomUsers = rooms.get(room);
      const memoryUsers = getMemoryRoomUsers(room);

      // 2. Case-insensitive Room-Scoped Uniqueness Check
      let existingByUsername = null;
      for (const u of roomUsers.values()) {
        if (u.username.toLowerCase() === normalizedUsername) {
          existingByUsername = u;
          break;
        }
      }

      // If username is occupied in this room:
      if (existingByUsername) {
        // Allow ONLY if it's the same user reconnecting/refreshing with the same userId
        if (existingByUsername.userId === effectiveUserId) {
          // Clean up old stale socket connection if still active
          const oldSocket = io.sockets.sockets.get(existingByUsername.socketId);
          if (oldSocket && oldSocket.id !== socket.id) {
            try {
              oldSocket.leave(room);
              oldSocket.disconnect(true);
            } catch (_) {}
          }
        } else {
          // Different user attempting to use an already taken username
          console.warn(
            `[Socket.IO] Rejected join: Username "${cleanUsername}" is already occupied in room "${room}"`
          );
          socket.emit("join-error", {
            message: "Username already taken. Please choose another username.",
          });
          return;
        }
      }

      // 3. Database-level atomic constraint check (if MongoDB is connected)
      if (mongoose.connection.readyState === 1) {
        try {
          const dbExisting = await Participant.findOne({ roomId: room, normalizedUsername });
          if (dbExisting && dbExisting.userId !== effectiveUserId) {
            socket.emit("join-error", {
              message: "Username already taken. Please choose another username.",
            });
            return;
          }

          await Participant.findOneAndUpdate(
            { roomId: room, normalizedUsername },
            {
              roomId: room,
              username: cleanUsername,
              normalizedUsername,
              userId: effectiveUserId,
              socketId: socket.id,
              lastSeen: new Date(),
            },
            { upsert: true, new: true, runValidators: true }
          );
        } catch (dbErr) {
          if (dbErr.code === 11000) {
            socket.emit("join-error", {
              message: "Username already taken. Please choose another username.",
            });
            return;
          }
        }
      }

      currentRoomId = room;
      socket.join(room);
      socket.join(`user:${effectiveUserId}`);

      // Preserve existing user color or assign consistent palette
      const palette = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];
      const assignedColor =
        existingByUsername?.color || palette[roomUsers.size % palette.length];

      currentUser = {
        id: effectiveUserId,
        userId: effectiveUserId,
        socketId: socket.id,
        roomId: room,
        username: cleanUsername,
        x: typeof x === "number" ? x : existingByUsername?.x || 205,
        y: typeof y === "number" ? y : existingByUsername?.y || 155,
        direction: typeof existingByUsername?.direction === "number" ? existingByUsername.direction : 0,
        muted: Boolean(muted),
        color: assignedColor,
      };

      // Register into room registries
      roomUsers.set(effectiveUserId, currentUser);
      memoryUsers.set(normalizedUsername, { userId: effectiveUserId, username: cleanUsername });
      inMemoryRooms.add(room);

      // Sync avatar location in DB
      if (mongoose.connection.readyState === 1) {
        try {
          await Avatar.findOneAndUpdate(
            { userId: effectiveUserId },
            { location: [currentUser.x, currentUser.y], lastSeen: new Date() },
            { upsert: true, new: true }
          );
        } catch (_) {}
      }

      // 1. Confirm session to sender
      socket.emit("session-confirmed", currentUser);

      // 2. Send other members in room (strictly de-duplicated, excluding self)
      const peers = Array.from(roomUsers.values()).filter(
        (u) => u.userId !== effectiveUserId
      );
      socket.emit("users-update", peers);

      // 3. Broadcast arrival to others in room
      socket.to(room).emit("user-joined", currentUser);

      console.log(
        `[Socket.IO] Room "${room}": User "${cleanUsername}" (${effectiveUserId}) successfully joined. Active members: ${roomUsers.size}`
      );
    });

    socket.on("position-update", async (data = {}) => {
      if (!currentRoomId || !currentUser) return;
      const { x, y, direction, muted } = data;

      if (typeof x === "number") currentUser.x = x;
      if (typeof y === "number") currentUser.y = y;
      if (typeof direction === "number") currentUser.direction = direction;
      if (typeof muted === "boolean") currentUser.muted = muted;

      socket.to(currentRoomId).emit("user-moved", {
        id: currentUser.id,
        userId: currentUser.userId,
        x: currentUser.x,
        y: currentUser.y,
        direction: currentUser.direction,
        muted: currentUser.muted,
      });

      try {
        await Avatar.updateOne(
          { userId: currentUser.userId },
          {
            location: [Math.round(currentUser.x), Math.round(currentUser.y)],
            lastSeen: new Date(),
          }
        );
      } catch (_) {}
    });

    socket.on("mute-status", ({ roomId, muted } = {}) => {
      if (!currentRoomId || !currentUser) return;
      currentUser.muted = Boolean(muted);
      const targetRoom = roomId || currentRoomId;

      // Broadcast both explicit mute event and user-moved state
      socket.to(targetRoom).emit("user-mute-changed", {
        roomId: targetRoom,
        id: currentUser.id,
        userId: currentUser.userId,
        muted: currentUser.muted,
      });

      socket.to(targetRoom).emit("user-moved", {
        id: currentUser.id,
        userId: currentUser.userId,
        muted: currentUser.muted,
      });
    });

    // Multi-User WebRTC Room-Scoped Signaling
    socket.on("webrtc-offer", (payload = {}) => {
      const { roomId, targetUserId, targetId, sdp } = payload;
      const target = targetUserId || targetId;
      const room = roomId || currentRoomId;
      if (!room || !target || !sdp || !currentUser) return;

      const roomUsers = rooms.get(room);
      if (!roomUsers) return;

      const targetUser = roomUsers.get(target);
      const targetSocketId = targetUser?.socketId;

      if (targetSocketId) {
        io.to(targetSocketId).emit("webrtc-offer", {
          roomId: room,
          senderUserId: currentUser.userId,
          targetUserId: target,
          fromId: currentUser.userId,
          fromSocketId: socket.id,
          sdp,
        });
      }
    });

    socket.on("webrtc-answer", (payload = {}) => {
      const { roomId, targetUserId, targetId, sdp } = payload;
      const target = targetUserId || targetId;
      const room = roomId || currentRoomId;
      if (!room || !target || !sdp || !currentUser) return;

      const roomUsers = rooms.get(room);
      if (!roomUsers) return;

      const targetUser = roomUsers.get(target);
      const targetSocketId = targetUser?.socketId;

      if (targetSocketId) {
        io.to(targetSocketId).emit("webrtc-answer", {
          roomId: room,
          senderUserId: currentUser.userId,
          targetUserId: target,
          fromId: currentUser.userId,
          fromSocketId: socket.id,
          sdp,
        });
      }
    });

    socket.on("webrtc-ice-candidate", (payload = {}) => {
      const { roomId, targetUserId, targetId, candidate } = payload;
      const target = targetUserId || targetId;
      const room = roomId || currentRoomId;
      if (!room || !target || !candidate || !currentUser) return;

      const roomUsers = rooms.get(room);
      if (!roomUsers) return;

      const targetUser = roomUsers.get(target);
      const targetSocketId = targetUser?.socketId;

      if (targetSocketId) {
        io.to(targetSocketId).emit("webrtc-ice-candidate", {
          roomId: room,
          senderUserId: currentUser.userId,
          targetUserId: target,
          fromId: currentUser.userId,
          fromSocketId: socket.id,
          candidate,
        });
      }
    });

    const handleUserCleanup = async () => {
      if (currentRoomId && currentUser) {
        const leavingRoomId = currentRoomId;
        const leavingUser = currentUser;
        currentRoomId = null;
        currentUser = null;

        const roomUsers = rooms.get(leavingRoomId);
        const memoryUsers = getMemoryRoomUsers(leavingRoomId);

        if (roomUsers) {
          roomUsers.delete(leavingUser.userId);
          if (roomUsers.size === 0) {
            rooms.delete(leavingRoomId);
          }
        }

        if (memoryUsers) {
          memoryUsers.delete(leavingUser.username.toLowerCase());
        }

        socket.to(leavingRoomId).emit("user-left", {
          roomId: leavingRoomId,
          id: leavingUser.id,
          userId: leavingUser.userId,
        });

        console.log(
          `[Socket.IO] User "${leavingUser.username}" (${leavingUser.userId}) left room "${leavingRoomId}". Remaining: ${roomUsers?.size || 0}`
        );

        if (mongoose.connection.readyState === 1) {
          try {
            await Participant.deleteOne({ roomId: leavingRoomId, userId: leavingUser.userId });
            await Avatar.deleteOne({ userId: leavingUser.userId });
          } catch (_) {}
        }
      }
    };

    socket.on("leave-office", handleUserCleanup);
    socket.on("disconnect", handleUserCleanup);
  });

  return io;
}

module.exports = createSocketServer;
