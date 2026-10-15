import { Router } from 'express';
import { z } from 'zod';
import { Notification } from '../models/Notification.js';
import { Membership } from '../models/Membership.js';
import { requireAuth, checkIdParam } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { NOTIFICATION_TYPES } from '../constants.js';

const router = Router();
router.use(requireAuth);
router.param('notificationId', checkIdParam);

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const listQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  workspace: oid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Only notifications for workspaces the user still belongs to are ever shown.
async function scope(req, workspace) {
  const ids = (await Membership.find({ user: req.user._id }).select('workspace')).map((m) => String(m.workspace));
  const list = workspace ? ids.filter((i) => i === workspace) : ids;
  return { user: req.user._id, workspace: { $in: list } };
}

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const base = await scope(req, q.workspace);
    const filter = { ...base };
    if (q.unread === 'true') filter.read = false;
    if (q.type) filter.type = q.type;
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort('-createdAt')
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .populate('actor', 'name email avatar')
        .populate('workspace', 'name')
        .populate('project', 'name'),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...base, read: false }),
    ]);
    res.json({ notifications, total, unreadCount, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ count: await Notification.countDocuments({ ...(await scope(req)), read: false }) });
  })
);

router.post(
  '/read-all',
  validate(z.object({ workspace: oid.optional() })),
  asyncHandler(async (req, res) => {
    const filter = { ...(await scope(req, req.body.workspace)), read: false };
    const r = await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
    res.json({ updated: r.modifiedCount });
  })
);

router.patch(
  '/:notificationId',
  validate(z.object({ read: z.boolean() })),
  asyncHandler(async (req, res) => {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user._id },
      { $set: { read: req.body.read, readAt: req.body.read ? new Date() : null } },
      { new: true }
    );
    if (!n) throw new ApiError(404, 'Notification not found');
    res.json({ notification: n });
  })
);

router.delete(
  '/:notificationId',
  asyncHandler(async (req, res) => {
    const r = await Notification.deleteOne({ _id: req.params.notificationId, user: req.user._id });
    if (!r.deletedCount) throw new ApiError(404, 'Notification not found');
    res.json({ message: 'Deleted' });
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const r = await Notification.deleteMany({ user: req.user._id, read: true });
    res.json({ deleted: r.deletedCount });
  })
);

export default router;
