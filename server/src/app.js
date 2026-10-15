import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/error.js';
import { AVATAR_DIR } from './middleware/upload.js';
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

// Health check endpoint for cloud orchestrators (Render) - respond instantly
app.get('/api/health', (req, res) => res.status(200).json({ ok: true }));

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
if (!env.isProd) app.use(morgan('dev'));

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
