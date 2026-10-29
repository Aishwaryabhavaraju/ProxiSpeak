const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const { Server } = require("socket.io");

const SIGNAL_EVENTS = ["signal:offer", "signal:answer", "signal:ice-candidate"];
const MAX_ROOM_ID_LENGTH = 128;

function isRoomId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ROOM_ID_LENGTH
  );
}

function isSignalPayload(event, payload) {
  if (!payload || typeof payload.to !== "string" || !payload.to) return false;
  if (!payload.data || typeof payload.data !== "object") return false;
  if (event === "signal:offer") {
    return payload.data.type === "offer" && typeof payload.data.sdp === "string";
  }
  if (event === "signal:answer") {
    return payload.data.type === "answer" && typeof payload.data.sdp === "string";
  }
  return typeof payload.data.candidate === "string";
}

async function createSignalingServer(httpServer, options = {}) {
  const redisUrl = Object.prototype.hasOwnProperty.call(options, "redisUrl")
    ? options.redisUrl
    : process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const io = new Server(httpServer, options.socketOptions);
  let publisher;
  let subscriber;

  if (redisUrl) {
    publisher = createClient({ url: redisUrl });
    subscriber = publisher.duplicate();
    publisher.on("error", (error) => console.error("Redis publisher error", error));
    subscriber.on("error", (error) => console.error("Redis subscriber error", error));

    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
      io.adapter(createAdapter(publisher, subscriber));
    } catch (error) {
      await Promise.allSettled([
        publisher.isOpen ? publisher.quit() : Promise.resolve(),
        subscriber.isOpen ? subscriber.quit() : Promise.resolve(),
      ]);
      await new Promise((resolve) => io.close(resolve));
      throw error;
    }
  }

  function reportSocketError(socket, error) {
    console.error("Signaling error", error);
    socket.emit("signaling:error", { message: "Signaling operation failed" });
  }

  async function leaveCurrentRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.data.roomId = undefined;
    await socket.leave(roomId);
    socket.to(roomId).emit("peer:left", { peerId: socket.id });
  }

  io.on("connection", (socket) => {
    socket.on("room:join", (payload) => {
      void (async () => {
        const roomId = payload && payload.roomId;
        if (!isRoomId(roomId)) {
          socket.emit("signaling:error", { message: "A valid roomId is required" });
          return;
        }

        if (socket.data.roomId === roomId) {
          const currentPeers = await io.in(roomId).fetchSockets();
          socket.emit("room:peers", {
            peers: currentPeers
              .map((peer) => peer.id)
              .filter((peerId) => peerId !== socket.id),
          });
          return;
        }

        await leaveCurrentRoom(socket);
        await socket.join(roomId);
        socket.data.roomId = roomId;

        const peers = await io.in(roomId).fetchSockets();
        socket.emit("room:peers", {
          peers: peers.map((peer) => peer.id).filter((peerId) => peerId !== socket.id),
        });
        socket.to(roomId).emit("peer:joined", { peerId: socket.id });
      })().catch((error) => reportSocketError(socket, error));
    });

    for (const event of SIGNAL_EVENTS) {
      socket.on(event, (payload) => {
        void (async () => {
          const roomId = socket.data.roomId;
          if (!roomId || !isSignalPayload(event, payload)) {
            socket.emit("signaling:error", { message: "Invalid signaling payload" });
            return;
          }

          const [target] = await io.in(payload.to).fetchSockets();
          if (!target || !target.rooms.has(roomId)) {
            socket.emit("signaling:error", {
              message: "Target peer is not in the same room",
            });
            return;
          }

          io.to(payload.to).emit(event, { from: socket.id, data: payload.data });
        })().catch((error) => reportSocketError(socket, error));
      });
    }

    socket.on("disconnecting", () => {
      const roomId = socket.data.roomId;
      if (roomId) socket.to(roomId).emit("peer:left", { peerId: socket.id });
    });
  });

  return {
    io,
    async close() {
      await new Promise((resolve) => io.close(resolve));
      if (publisher && subscriber) {
        await Promise.all([publisher.quit(), subscriber.quit()]);
      }
    },
  };
}

module.exports = { createSignalingServer, isRoomId, isSignalPayload };
