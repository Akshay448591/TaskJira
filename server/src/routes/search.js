import { Router } from 'express';
import { z } from 'zod';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Comment } from '../models/Comment.js';
import { Membership } from '../models/Membership.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, escapeRegex } from '../utils/ApiError.js';
import { PRIORITIES } from '../constants.js';

// Global search over projects, tasks, users and comments. Every query is pinned to this workspace.
const router = Router({ mergeParams: true });
const TYPES = ['tasks', 'projects', 'users', 'comments'];
const schema = z.object({
  q: z.string().trim().min(1).max(100),
  types: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(8),
  sort: z.enum(['newest', 'oldest', 'updated', 'due']).default('newest'),
  status: z.string().regex(/^[\w-]{1,40}$/).optional(),
  priority: z.enum(PRIORITIES).optional(),
});
const SORTS = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, updated: { updatedAt: -1 }, due: { dueDate: 1 } };

router.get(
  '/',
  validate(schema, 'query'),
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const { q, limit, sort, status, priority } = req.query;
    const types = (req.query.types ? req.query.types.split(',') : TYPES).filter((t) => TYPES.includes(t));
    const rx = new RegExp(escapeRegex(q), 'i');
    const out = {};
    const jobs = [];

    if (types.includes('tasks')) {
      const filter = { workspace: wid, $or: [{ title: rx }, { description: rx }, { labels: rx }] };
      const num = q.replace(/^#/, '');
      if (/^\d+$/.test(num)) filter.$or.push({ number: Number(num) });
      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (sort === 'due') filter.dueDate = { $ne: null };
      jobs.push(
        Task.find(filter).sort(SORTS[sort]).limit(limit).populate('assignee', 'name email avatar').populate('project', 'name columns').then((r) => (out.tasks = r))
      );
    }
    if (types.includes('projects')) {
      jobs.push(
        Project.find({ workspace: wid, $or: [{ name: rx }, { description: rx }] })
          .sort('-updatedAt')
          .limit(limit)
          .select('name description status archived')
          .then((r) => (out.projects = r))
      );
    }
    if (types.includes('users')) {
      jobs.push(
        Membership.find({ workspace: wid })
          .populate('user', 'name email avatar')
          .then((ms) => {
            out.users = ms
              .filter((m) => m.user && (rx.test(m.user.name) || rx.test(m.user.email)))
              .slice(0, limit)
              .map((m) => ({ ...m.user.toJSON(), role: m.role }));
          })
      );
    }
    if (types.includes('comments')) {
      jobs.push(
        Comment.find({ workspace: wid, body: rx })
          .sort(sort === 'oldest' ? 'createdAt' : '-createdAt')
          .limit(limit)
          .populate('author', 'name avatar email')
          .populate('task', 'title number project')
          .then((r) => (out.comments = r.filter((c) => c.task)))
      );
    }
    await Promise.all(jobs);
    res.json({ query: q, ...out });
  })
);

export default router;
