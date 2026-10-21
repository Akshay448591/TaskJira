import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { httpRequestsTotal, httpRequestDurationSeconds } from '../utils/metrics.js';

export function observabilityMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;
    const durationSec = durationMs / 1000;
    const route = req.baseUrl ? `${req.baseUrl}${req.route ? req.route.path : req.path}` : (req.route ? req.route.path : req.path);
    const statusCode = String(res.statusCode);

    // Set response header for client inspection
    try {
      res.setHeader('x-response-time', `${durationMs.toFixed(2)}ms`);
    } catch {
      // Headers already sent
    }

    // Record metrics
    try {
      httpRequestsTotal.inc({ method: req.method, route: route || 'unknown', status_code: statusCode });
      httpRequestDurationSeconds.observe({ method: req.method, route: route || 'unknown', status_code: statusCode }, durationSec);
    } catch {
      // Ignore metric label error
    }

    // Structured logging
    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: parseFloat(durationMs.toFixed(2)),
      ip: req.ip,
      userId: req.user?._id?.toString(),
    };

    if (res.statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode} [${durationMs.toFixed(2)}ms]`, logData);
    } else if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode} [${durationMs.toFixed(2)}ms]`, logData);
    } else {
      logger.info(`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode} [${durationMs.toFixed(2)}ms]`, logData);
    }
  });

  next();
}
