import express from 'express';
import avatarRoutes from './routes/avatarRoutes.js';
import roomRoutes from './routes/roomRoutes.js';

export function createApp({ earshotDistance, corsOrigins, getDatabaseStatus }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.locals.earshotDistance = earshotDistance;

  app.use((request, response, next) => {
    const origin = request.get('origin');
    if (!origin) return next();
    if (!corsOrigins.includes(origin)) {
      return response.status(403).json({ error: 'Origin not allowed' });
    }

    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
    response.set('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    return next();
  });

  app.get('/health', (_request, response) => {
    const database = getDatabaseStatus();
    response.status(database === 'connected' ? 200 : 503).json({
      status: database === 'connected' ? 'ok' : 'unavailable',
      database,
    });
  });

  app.use('/api/avatars', avatarRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use((_request, response) => response.status(404).json({ error: 'Not found' }));
  app.use((error, _request, response, _next) => {
    console.error('HTTP request failed:', error);
    const status =
      Number.isInteger(error.status) && error.status >= 400 && error.status < 500
        ? error.status
        : 500;
    response.status(status).json({
      error: status === 500 ? 'Internal server error' : error.message,
    });
  });

  return app;
}
