const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { randomUUID } = require("crypto");

let publisher;
let subscriber;
let eventPublisher;
let eventSubscriber;
let initialized = false;

const instanceId = randomUUID();

const MOVEMENT_CHANNEL = "proxispeak:avatar:movement";
const PROXIMITY_CHANNEL = "proxispeak:proximity:transition";

async function initializeRedis(io, handlers = {}) {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is missing from backend/.env");
  }

  const clientOptions = {
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => (retries > 0 ? false : 200),
    },
  };

  publisher = createClient(clientOptions);
  subscriber = publisher.duplicate();

  publisher.on("error", (err) =>
    console.error("Redis publisher error:", err.message)
  );
  subscriber.on("error", (err) =>
    console.error("Redis subscriber error:", err.message)
  );

  await Promise.all([
    publisher.connect(),
    subscriber.connect(),
  ]);

  // Enable cross-instance Socket.IO broadcasts.
  io.adapter(createAdapter(publisher, subscriber));

  // Separate clients for application-level event distribution.
  eventPublisher = publisher.duplicate();
  eventSubscriber = publisher.duplicate();

  eventPublisher.on("error", (err) =>
    console.error("Redis event publisher error:", err.message)
  );
  eventSubscriber.on("error", (err) =>
    console.error("Redis event subscriber error:", err.message)
  );

  await Promise.all([
    eventPublisher.connect(),
    eventSubscriber.connect(),
  ]);

  await eventSubscriber.subscribe(
    MOVEMENT_CHANNEL,
    (message, channel) => {
      try {
        const event = JSON.parse(message);

        // Distribute to sockets connected to THIS instance only.
        // Every instance receives the Redis publication.
        if (channel === MOVEMENT_CHANNEL) {
          io.local.emit("avatar:movement:distributed", event);
          handlers.onMovement?.(event);
        }
      } catch (error) {
        console.error("Invalid Redis movement event:", error.message);
      }
    }
  );

  // Subscribe separately so proximity events can be routed to
  // the two relevant users rather than broadcast to everyone.
  await eventSubscriber.subscribe(
    PROXIMITY_CHANNEL,
    (message) => {
      try {
        const event = JSON.parse(message);

        if (!event.userA || !event.userB || !event.type) {
          return;
        }

        const eventName =
          event.type === "enter"
            ? "proximity:peer:entered"
            : event.type === "exit"
              ? "proximity:peer:left"
              : null;

        if (!eventName) return;

        const payloadForA = {
          userId: event.userB,
          distance: event.distance,
          reason: event.reason,
        };

        const payloadForB = {
          userId: event.userA,
          distance: event.distance,
          reason: event.reason,
        };

        // Each server emits only to its own local sockets.
        io.local.to(event.userA).emit(eventName, payloadForA);
        io.local.to(event.userB).emit(eventName, payloadForB);
      } catch (error) {
        console.error("Invalid Redis proximity event:", error.message);
      }
    }
  );

  initialized = true;
  console.log("Redis Pub/Sub and Socket.IO adapter initialized.");
}

async function publishMovement(event) {
  if (!initialized) {
    throw new Error("Redis has not been initialized.");
  }

  await eventPublisher.publish(
    MOVEMENT_CHANNEL,
    JSON.stringify({
      ...event,
      instanceId,
      publishedAt: Date.now(),
    })
  );
}

async function publishProximityTransition(event) {
  if (!initialized) {
    throw new Error("Redis has not been initialized.");
  }

  await eventPublisher.publish(
    PROXIMITY_CHANNEL,
    JSON.stringify(event)
  );
}

async function closeRedis() {
  initialized = false;

  const clients = [
    eventSubscriber,
    eventPublisher,
    subscriber,
    publisher,
  ].filter(Boolean);

  await Promise.allSettled(
    clients.map((client) =>
      client.isOpen ? client.quit() : Promise.resolve()
    )
  );
}

function isRedisInitialized() {
  return initialized;
}

module.exports = {
  initializeRedis,
  publishMovement,
  publishProximityTransition,
  closeRedis,
  isRedisInitialized,
};
