import http from 'http';
import app from './app.js';
import { initRealtime } from './realtime.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { startScheduler } from './services/scheduler.js';
import { backfillSortFields } from './models/Task.js';

connectDB()
  .then(() => backfillSortFields())
  .then(() => {
    const server = http.createServer(app);
    initRealtime(server); // Socket.IO shares the HTTP server
    server.listen(env.port, () => {
      console.log(`API running on http://localhost:${env.port}`);
      startScheduler(); // hourly deadline alerts
    });
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
