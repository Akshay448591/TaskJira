import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Workspaces API Integration', () => {
  async function createTestUser(role = 'user') {
    const unique = Math.random().toString(36).substring(7);
    const user = {
      name: `User ${unique}`,
      email: `${role}_${unique}@example.com`,
      password: 'Password123!',
    };
    const res = await request(app).post('/api/auth/signup').send(user);
    return { user, cookies: res.headers['set-cookie'] };
  }

  it('POST /api/workspaces creates a new workspace with Owner role', async () => {
    const { cookies } = await createTestUser('owner');

    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'Acme Product Team', description: 'Core product development workspace' });

    expect(wsRes.status).toBe(201);
    expect(wsRes.body.workspace).toBeDefined();
    expect(wsRes.body.workspace.name).toBe('Acme Product Team');
    expect(wsRes.body.workspace.role).toBe('owner');
  });

  it('GET /api/workspaces lists workspaces user is a member of', async () => {
    const { cookies } = await createTestUser('owner');

    await request(app)
      .post('/api/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'Workspace Alpha' });

    const listRes = await request(app)
      .get('/api/workspaces')
      .set('Cookie', cookies);

    expect(listRes.status).toBe(200);
    expect(listRes.body.workspaces).toBeInstanceOf(Array);
    expect(listRes.body.workspaces.some((w) => w.name === 'Workspace Alpha')).toBe(true);
  });

  it('GET /api/workspaces/:id enforces strict workspace isolation (404 for non-members)', async () => {
    const { cookies: ownerCookies } = await createTestUser('owner');
    const { cookies: outsiderCookies } = await createTestUser('outsider');

    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Cookie', ownerCookies)
      .send({ name: 'Confidential Workspace' });

    const workspaceId = wsRes.body.workspace._id;

    // Outsider trying to access owner's workspace
    const isolatedRes = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Cookie', outsiderCookies);

    expect(isolatedRes.status).toBe(404);
  });
});
