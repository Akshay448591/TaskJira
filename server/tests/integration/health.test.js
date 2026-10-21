import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Health and Observability API Integration', () => {
  it('GET /api/health responds with 200, status ok, and subsystem metrics', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.uptimeSeconds).toBeTypeOf('number');
    expect(res.body.database).toBeDefined();
    expect(res.body.database.status).toBe('connected');
    expect(res.body.memory).toBeDefined();
    expect(res.body.memory.rssMb).toBeTypeOf('number');
  });

  it('GET /api/metrics exposes Prometheus metrics exposition format', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('taskjira_http_requests_total');
    expect(res.text).toContain('taskjira_http_request_duration_seconds');
  });

  it('HTTP responses include x-request-id header for correlation', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
  });
});
