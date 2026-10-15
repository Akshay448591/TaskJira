import rateLimit from 'express-rate-limit';

const json = (message) => ({ message });

export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: json('Too many requests, please slow down.'),
});

// strict limiter for credential endpoints (login, signup, password reset)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: json('Too many attempts. Try again in a few minutes.'),
});
