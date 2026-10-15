import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { avatarUpload, removeFile, AVATAR_DIR } from '../middleware/upload.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { passwordRule } from './auth.js';
import { signAccess, signRefresh, sha256, setAuthCookies } from '../utils/tokens.js';
import jwt from 'jsonwebtoken';
import { NOTIFICATION_TYPES } from '../constants.js';

const router = Router();
router.use(requireAuth);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(300).optional(),
  settings: z
    .object({
      emailNotifications: z.boolean().optional(),
      timezone: z.string().trim().min(1).max(60).optional(),
      notifications: z
        .object(Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, z.object({ inApp: z.boolean().optional(), email: z.boolean().optional() }).optional()])))
        .optional(),
    })
    .optional(),
});
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordRule });

router.get('/me', (req, res) => res.json({ user: req.user }));

router.patch(
  '/me',
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const { name, bio, settings } = req.body;
    if (name !== undefined) req.user.name = name;
    if (bio !== undefined) req.user.bio = bio;
    if (settings?.emailNotifications !== undefined) req.user.settings.emailNotifications = settings.emailNotifications;
    if (settings?.timezone !== undefined) req.user.settings.timezone = settings.timezone;
    for (const [type, pref] of Object.entries(settings?.notifications || {})) {
      if (pref?.inApp !== undefined) req.user.set(`settings.notifications.${type}.inApp`, pref.inApp);
      if (pref?.email !== undefined) req.user.set(`settings.notifications.${type}.email`, pref.email);
    }
    await req.user.save();
    res.json({ user: req.user });
  })
);

router.post(
  '/me/avatar',
  avatarUpload.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No image uploaded');
    await removeFile(AVATAR_DIR, req.user.avatar);
    req.user.avatar = req.file.filename;
    await req.user.save();
    res.json({ user: req.user });
  })
);

router.delete(
  '/me/avatar',
  asyncHandler(async (req, res) => {
    await removeFile(AVATAR_DIR, req.user.avatar);
    req.user.avatar = null;
    await req.user.save();
    res.json({ user: req.user });
  })
);

router.patch(
  '/me/password',
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash)))
      throw new ApiError(400, 'Current password is incorrect');
    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await user.save();
    // revoke all other sessions, keep this one signed in with a fresh pair
    const access = signAccess(user);
    const refresh = signRefresh(user);
    const { exp } = jwt.decode(refresh);
    await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [{ tokenHash: sha256(refresh), expiresAt: new Date(exp * 1000) }] } });
    setAuthCookies(res, access, refresh);
    res.json({ message: 'Password changed' });
  })
);

export default router;
