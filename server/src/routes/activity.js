import { Router } from 'express';
import { z } from 'zod';
import { Activity } from '../models/Activity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/ApiError.js';

// Workspace / project activity feed: who changed what, and when.
const router = Router({ mergeParams: true });
const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const query = z.object({
  project: oid.optional(),
  actor: oid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.get(
  '/',
  validate(query, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const filter = { workspace: req.params.workspaceId };
    if (q.project) filter.project = q.project;
    if (q.actor) filter.actor = q.actor;
    const [activity, total] = await Promise.all([
      Activity.find(filter)
        .sort('-createdAt')
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .populate('actor', 'name email avatar')
        .populate('task', 'title number project')
        .populate('project', 'name'),
      Activity.countDocuments(filter),
    ]);
    res.json({ activity, total, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) });
  })
);

export default router;
