import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/error.js';
import { AVATAR_DIR } from './middleware/upload.js';
import { observabilityMiddleware } from './middleware/observability.js';
import { getMetrics, getMetricsContentType } from './utils/metrics.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import invitationRoutes from './routes/invitations.js';
import workspaceRoutes from './routes/workspaces.js';
import notificationRoutes from './routes/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Observability and request tracing middleware
app.use(observabilityMiddleware);

// Enhanced Health check endpoint with deep subsystem diagnostics
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  let dbStatus = 'disconnected';
  let dbLatencyMs = null;

  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
      dbStatus = 'connected';
      dbLatencyMs = Date.now() - start;
    }
  } catch {
    dbStatus = 'error';
  }

  const memory = process.memoryUsage();
  const isHealthy = dbStatus === 'connected' || mongoose.connection.readyState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    ok: isHealthy, // backwards compatibility
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    memory: {
      rssMb: parseFloat((memory.rss / (1024 * 1024)).toFixed(2)),
      heapUsedMb: parseFloat((memory.heapUsed / (1024 * 1024)).toFixed(2)),
      heapTotalMb: parseFloat((memory.heapTotal / (1024 * 1024)).toFixed(2)),
    },
  });
});

// Prometheus metrics exposition endpoint
app.get('/api/metrics', async (req, res) => {
  try {
    res.setHeader('Content-Type', getMetricsContentType());
    res.send(await getMetrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

// Safe CORS handling: never set invalid characters or headers for requests without origin
app.use(
  cors({
    origin: (origin, callback) => {
      // If request has no origin header (health probes, curl, same-origin fetch)
      if (!origin) return callback(null, false);
      return callback(null, origin);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
if (!env.isProd && process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// avatars are public images; task attachments are NOT served statically (see tasks route)
app.use('/uploads/avatars', express.static(AVATAR_DIR, { maxAge: '1d' }));

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/notifications', notificationRoutes);

// In production, serve the built SPA from client/dist if present
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
