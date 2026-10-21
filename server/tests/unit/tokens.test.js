import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccess, signRefresh, sha256, setAuthCookies, clearAuthCookies } from '../../src/utils/tokens.js';
import { env } from '../../src/config/env.js';

describe('Tokens Utility', () => {
  const dummyUser = { id: '60d5ec49f1b2c8b1f8e4e1a1' };

  it('signs a valid access token with subject matching user ID', () => {
    const token = signAccess(dummyUser);
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, env.accessSecret);
    expect(decoded.sub).toBe(dummyUser.id);
    expect(decoded.exp).toBeDefined();
  });

  it('signs a valid refresh token with unique jti and subject', () => {
    const token1 = signRefresh(dummyUser);
    const token2 = signRefresh(dummyUser);

    expect(typeof token1).toBe('string');
    expect(typeof token2).toBe('string');
    expect(token1).not.toBe(token2);

    const decoded1 = jwt.verify(token1, env.refreshSecret);
    const decoded2 = jwt.verify(token2, env.refreshSecret);
    expect(decoded1.sub).toBe(dummyUser.id);
    expect(decoded2.sub).toBe(dummyUser.id);
    expect(decoded1.jti).not.toBe(decoded2.jti);
  });

  it('sha256 computes consistent hex hashes', () => {
    const input = 'refresh-token-sample-12345';
    const hash1 = sha256(input);
    const hash2 = sha256(input);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256('different-sample')).not.toBe(hash1);
  });

  it('setAuthCookies sets both access and refresh cookies with security options', () => {
    const cookies = {};
    const res = {
      cookie: (name, val, opts) => {
        cookies[name] = { val, opts };
      },
    };

    setAuthCookies(res, 'access-token-xyz', 'refresh-token-abc');

    expect(cookies.access_token).toBeDefined();
    expect(cookies.access_token.val).toBe('access-token-xyz');
    expect(cookies.access_token.opts.httpOnly).toBe(true);
    expect(cookies.access_token.opts.path).toBe('/');

    expect(cookies.refresh_token).toBeDefined();
    expect(cookies.refresh_token.val).toBe('refresh-token-abc');
    expect(cookies.refresh_token.opts.httpOnly).toBe(true);
    expect(cookies.refresh_token.opts.path).toBe('/api/auth');
  });

  it('clearAuthCookies clears both auth cookies', () => {
    const cleared = {};
    const res = {
      clearCookie: (name, opts) => {
        cleared[name] = opts;
      },
    };

    clearAuthCookies(res);
    expect(cleared.access_token).toBeDefined();
    expect(cleared.access_token.path).toBe('/');
    expect(cleared.refresh_token).toBeDefined();
    expect(cleared.refresh_token.path).toBe('/api/auth');
  });
});
