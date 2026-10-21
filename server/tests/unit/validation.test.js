import { describe, it, expect } from 'vitest';
import { passwordRule } from '../../src/routes/auth.js';

describe('Validation Schemas', () => {
  it('passwordRule accepts valid passwords with letters and numbers (>=8 chars)', () => {
    expect(passwordRule.safeParse('Password123').success).toBe(true);
    expect(passwordRule.safeParse('SecretPass99').success).toBe(true);
  });

  it('passwordRule rejects passwords shorter than 8 characters', () => {
    const res = passwordRule.safeParse('Pass1');
    expect(res.success).toBe(false);
  });

  it('passwordRule rejects passwords without numbers', () => {
    const res = passwordRule.safeParse('OnlyLettersHere');
    expect(res.success).toBe(false);
  });

  it('passwordRule rejects passwords without letters', () => {
    const res = passwordRule.safeParse('1234567890');
    expect(res.success).toBe(false);
  });
});
