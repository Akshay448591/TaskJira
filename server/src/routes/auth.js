import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { signAccess, signRefresh, sha256, setAuthCookies, clearAuthCookies } from '../utils/tokens.js';
import { sendMail } from '../utils/mailer.js';

const router = Router();

export const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const email = z.string().trim().toLowerCase().email('Enter a valid email');

const signupSchema = z.object({ name: z.string().trim().min(2, 'Name is too short').max(80), email, password: passwordRule });
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const forgotSchema = z.object({ email });
const resetSchema = z.object({ token: z.string().min(10).max(200), password: passwordRule });

async function issueSession(res, user) {
  const access = signAccess(user);
  const refresh = signRefresh(user);
  const { exp } = jwt.decode(refresh);
  // drop expired entries, then store the new hash (keep at most 5 devices)
  await User.updateOne({ _id: user._id }, { $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } } });
  await User.updateOne(
    { _id: user._id },
    { $push: { refreshTokens: { $each: [{ tokenHash: sha256(refresh), expiresAt: new Date(exp * 1000) }], $slice: -5 } } }
  );
  setAuthCookies(res, access, refresh);
}

router.post(
  '/signup',
  authLimiter,
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    if (await User.exists({ email })) throw new ApiError(409, 'An account with this email already exists');
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    await issueSession(res, user);
    res.status(201).json({ user });
  })
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    await issueSession(res, user);
    res.json({ user });
  })
);

// Refresh-token rotation: every refresh issues a new pair and invalidates the old token.
// Re-using an already-rotated token revokes every session of that user.
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (!token) throw new ApiError(401, 'No refresh token', 'REFRESH_INVALID');
    let payload;
    try {
      payload = jwt.verify(token, env.refreshSecret);
    } catch {
      clearAuthCookies(res);
      throw new ApiError(401, 'Session expired, please log in again', 'REFRESH_INVALID');
    }
    const user = await User.findById(payload.sub).select('+refreshTokens');
    const hash = sha256(token);
    if (!user || !user.refreshTokens.some((t) => t.tokenHash === hash)) {
      if (user) await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });
      clearAuthCookies(res);
      throw new ApiError(401, 'Session expired, please log in again', 'REFRESH_INVALID');
    }
    await User.updateOne({ _id: user._id }, { $pull: { refreshTokens: { tokenHash: hash } } });
    await issueSession(res, user);
    res.json({ user });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (token) {
      try {
        const { sub } = jwt.verify(token, env.refreshSecret);
        await User.updateOne({ _id: sub }, { $pull: { refreshTokens: { tokenHash: sha256(token) } } });
      } catch {
        /* token invalid/expired - nothing to revoke */
      }
    }
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user) {
      const raw = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = sha256(raw);
      user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      await sendMail({
        to: user.email,
        subject: 'Reset your TaskJira password',
        text: `Hi ${user.name},\n\nReset your password (valid for 1 hour):\n${env.clientUrl}/reset-password?token=${raw}\n\nIf you did not request this, ignore this email.`,
      });
    }
    // same response whether or not the account exists (no user enumeration)
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  })
);

router.post(
  '/reset-password',
  authLimiter,
  validate(resetSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      resetTokenHash: sha256(req.body.token),
      resetTokenExpires: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpires +refreshTokens');
    if (!user) throw new ApiError(400, 'Reset link is invalid or has expired');
    user.passwordHash = await bcrypt.hash(req.body.password, 12);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.refreshTokens = []; // sign out everywhere
    await user.save();
    clearAuthCookies(res);
    res.json({ message: 'Password updated. You can now log in.' });
  })
);

export default router;
