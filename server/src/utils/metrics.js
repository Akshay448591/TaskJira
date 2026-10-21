import client from 'prom-client';

const registry = new client.Registry();

// Enable standard NodeJS process & garbage collection metrics
client.collectDefaultMetrics({
  register: registry,
  prefix: 'taskjira_',
});

export const httpRequestsTotal = new client.Counter({
  name: 'taskjira_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'taskjira_http_request_duration_seconds',
  help: 'Latency distribution of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const activeSocketConnections = new client.Gauge({
  name: 'taskjira_active_socket_connections',
  help: 'Number of active realtime Socket.IO connections',
  registers: [registry],
});

export async function getMetrics() {
  return registry.metrics();
}

export function getMetricsContentType() {
  return registry.contentType;
}
