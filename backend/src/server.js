import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Avatar } from './models/Avatar.js';
import { Room } from './models/Room.js';
import { registerSignaling } from './services/signaling.js';

export async function startServer(config = loadConfig()) {
  await mongoose.connect(config.mongodbUri);
  await Promise.all([Avatar.createIndexes(), Room.createIndexes()]);

  const app = createApp({
    earshotDistance: config.earshotDistance,
    corsOrigins: config.corsOrigins,
    getDatabaseStatus: () => mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins.length ? config.corsOrigins : false,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1_000_000,
  });

  let redisPublisher;
  let redisSubscriber;
  if (config.redisUrl) {
    redisPublisher = createClient({ url: config.redisUrl });
    redisSubscriber = redisPublisher.duplicate();
    redisPublisher.on('error', (error) => console.error('Redis publisher error:', error));
    redisSubscriber.on('error', (error) => console.error('Redis subscriber error:', error));
    await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);
    io.adapter(createAdapter(redisPublisher, redisSubscriber));
    console.info('Socket.IO Redis adapter enabled');
  } else {
    console.warn('REDIS_URL is unset; signaling is limited to this server instance');
  }

  registerSignaling(io, { earshotDistance: config.earshotDistance });
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, resolve);
  });

  console.info(`ProxiSpeak backend listening on http://${config.host}:${config.port}`);
  return {
    httpServer,
    io,
    async close() {
      await new Promise((resolve) => io.close(resolve));
      if (redisPublisher?.isOpen) await redisPublisher.quit();
      if (redisSubscriber?.isOpen) await redisSubscriber.quit();
      await mongoose.disconnect();
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then((server) => {
    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }).catch((error) => {
    console.error('Backend startup failed:', error);
    process.exitCode = 1;
  });
}
