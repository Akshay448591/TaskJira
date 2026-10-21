import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../../src/middleware/auth.js';
import { RANK, ROLES } from '../../src/constants.js';
import { ApiError, isId, escapeRegex } from '../../src/utils/ApiError.js';

describe('Role and Middleware Logic', () => {
  it('RANK hierarchy correctly ranks viewer < member < admin < owner', () => {
    expect(RANK.viewer).toBeLessThan(RANK.member);
    expect(RANK.member).toBeLessThan(RANK.admin);
    expect(RANK.admin).toBeLessThan(RANK.owner);
    expect(ROLES).toEqual(['owner', 'admin', 'member', 'viewer']);
  });

  it('requireRole allows request when user has equal or higher rank', () => {
    const next = vi.fn();
    const req = { role: 'admin' };
    const res = {};

    requireRole('member')(req, res, next);
    expect(next).toHaveBeenCalledWith();

    next.mockClear();
    requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireRole rejects request when user has lower rank with 403 ApiError', () => {
    const next = vi.fn();
    const req = { role: 'viewer' };
    const res = {};

    requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
    const errorArg = next.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(ApiError);
    expect(errorArg.status).toBe(403);
  });

  it('isId validates 24-character hex MongoDB ObjectIDs correctly', () => {
    expect(isId('60d5ec49f1b2c8b1f8e4e1a1')).toBe(true);
    expect(isId('invalid-mongo-id')).toBe(false);
    expect(isId('60d5ec49f1b2c8b1f8e4e1a')).toBe(false); // 23 chars
    expect(isId(null)).toBe(false);
    expect(isId(12345)).toBe(false);
  });

  it('escapeRegex escapes regex special characters safely', () => {
    const raw = 'test(123)*+[hello]';
    const escaped = escapeRegex(raw);
    expect(escaped).toBe('test\\(123\\)\\*\\+\\[hello\\]');
    const regex = new RegExp(escaped);
    expect(regex.test('test(123)*+[hello]')).toBe(true);
  });
});
