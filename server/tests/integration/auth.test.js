import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Auth API Integration', () => {
  const testUser = {
    name: 'Alice Developer',
    email: 'alice@example.com',
    password: 'Password123!',
  };

  it('POST /api/auth/signup registers a new user and returns 201 with auth cookies', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email.toLowerCase());
    expect(res.body.user.name).toBe(testUser.name);
    expect(res.body.user.passwordHash).toBeUndefined(); // ensure password hash is not leaked

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = cookies.join('; ');
    expect(cookieStr).toContain('access_token=');
    expect(cookieStr).toContain('refresh_token=');
  });

  it('POST /api/auth/signup rejects registration with existing email (409 Conflict)', async () => {
    // First signup
    await request(app).post('/api/auth/signup').send(testUser);

    // Duplicate signup
    const duplicateRes = await request(app).post('/api/auth/signup').send(testUser);
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.message).toContain('already exists');
  });

  it('POST /api/auth/login succeeds with valid credentials and sets cookies', async () => {
    await request(app).post('/api/auth/signup').send(testUser);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe(testUser.email);
    const cookies = loginRes.headers['set-cookie'].join('; ');
    expect(cookies).toContain('access_token=');
    expect(cookies).toContain('refresh_token=');
  });

  it('POST /api/auth/login fails with invalid password (401 Unauthorized)', async () => {
    await request(app).post('/api/auth/signup').send(testUser);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'WrongPassword99' });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /api/auth/me returns current user when valid access_token cookie is provided', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send(testUser);
    const cookies = signupRes.headers['set-cookie'];

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookies);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(testUser.email);
  });

  it('GET /api/auth/me fails with 401 when access_token cookie is missing', async () => {
    const meRes = await request(app).get('/api/auth/me');
    expect(meRes.status).toBe(401);
    expect(meRes.body.code).toBe('TOKEN_EXPIRED');
  });

  it('POST /api/auth/refresh rotates refresh token successfully', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send(testUser);
    const cookies = signupRes.headers['set-cookie'];

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.user).toBeDefined();
    const newCookies = refreshRes.headers['set-cookie'].join('; ');
    expect(newCookies).toContain('access_token=');
    expect(newCookies).toContain('refresh_token=');
  });

  it('POST /api/auth/logout clears auth cookies and revokes session', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send(testUser);
    const cookies = signupRes.headers['set-cookie'];

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('Logged out');
    const clearedCookies = logoutRes.headers['set-cookie'].join('; ');
    expect(clearedCookies).toContain('access_token=;');
  });
});
