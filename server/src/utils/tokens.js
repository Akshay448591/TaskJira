import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const signAccess = (user) => jwt.sign({ sub: user.id }, env.accessSecret, { expiresIn: Math.floor(ACCESS_TTL_MS / 1000) });
export const signRefresh = (user) =>
  jwt.sign({ sub: user.id, jti: crypto.randomUUID() }, env.refreshSecret, { expiresIn: Math.floor(REFRESH_TTL_MS / 1000) });
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const base = () => ({ httpOnly: true, secure: env.isProd, sameSite: 'lax' });

export function setAuthCookies(res, access, refresh) {
  res.cookie('access_token', access, { ...base(), maxAge: ACCESS_TTL_MS, path: '/' });
  // refresh cookie is only ever sent to the auth endpoints
  res.cookie('refresh_token', refresh, { ...base(), maxAge: REFRESH_TTL_MS, path: '/api/auth' });
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', { ...base(), path: '/' });
  res.clearCookie('refresh_token', { ...base(), path: '/api/auth' });
}
