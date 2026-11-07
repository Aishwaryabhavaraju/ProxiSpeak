import 'dotenv/config';

function positiveNumber(value, name, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    mongodbUri: env.MONGODB_URI,
    redisUrl: env.REDIS_URL || undefined,
    earshotDistance: positiveNumber(env.EARSHOT_DISTANCE, 'EARSHOT_DISTANCE', 250),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
