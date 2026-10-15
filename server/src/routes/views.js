import { Router } from 'express';
import { z } from 'zod';
import { SavedView } from '../models/SavedView.js';
import { Project } from '../models/Project.js';
import { requireRole, checkIdParam } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { RANK } from '../constants.js';

const router = Router({ mergeParams: true });
router.param('viewId', checkIdParam);

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
// only these URL-style filter keys may be stored in a saved view
const QUERY_KEYS = ['q', 'status', 'priority', 'assignee', 'label', 'due', 'sort', 'dir', 'project'];
const cleanQuery = (q = {}) => Object.fromEntries(QUERY_KEYS.filter((k) => typeof q[k] === 'string' && q[k] !== '').map((k) => [k, q[k].slice(0, 200)]));

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Give the view a name').max(60),
  view: z.enum(['list', 'board', 'calendar']).default('list'),
  project: oid.nullable().optional(),
  query: z.record(z.any()).default({}),
  shared: z.boolean().default(false),
});

router.get(
  '/',
  validate(z.object({ project: oid.optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const filter = {
      workspace: req.params.workspaceId,
      project: req.query.project || null,
      $or: [{ owner: req.user._id }, { shared: true }],
    };
    const views = await SavedView.find(filter).sort('name').populate('owner', 'name');
    res.json({ views });
  })
);

router.post(
  '/',
  validate(bodySchema),
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const b = req.body;
    if (b.shared && RANK[req.role] < RANK.member) throw new ApiError(403, 'Viewers can only create personal views');
    if (b.project && !(await Project.exists({ _id: b.project, workspace: wid }))) throw new ApiError(404, 'Project not found');
    const count = await SavedView.countDocuments({ workspace: wid, owner: req.user._id });
    if (count >= 50) throw new ApiError(400, 'You have reached the limit of 50 saved views');
    const view = await SavedView.create({ workspace: wid, owner: req.user._id, name: b.name, view: b.view, project: b.project || null, query: cleanQuery(b.query), shared: b.shared });
    res.status(201).json({ view });
  })
);

router.patch(
  '/:viewId',
  validate(bodySchema.partial().omit({ project: true })),
  asyncHandler(async (req, res) => {
    const view = await SavedView.findOne({ _id: req.params.viewId, workspace: req.params.workspaceId });
    if (!view) throw new ApiError(404, 'View not found');
    if (String(view.owner) !== String(req.user._id) && RANK[req.role] < RANK.admin) throw new ApiError(403, 'Only the creator or an admin can edit this view');
    const b = req.body;
    if (b.shared && RANK[req.role] < RANK.member) throw new ApiError(403, 'Viewers can only create personal views');
    if (b.name !== undefined) view.name = b.name;
    if (b.view !== undefined) view.view = b.view;
    if (b.shared !== undefined) view.shared = b.shared;
    if (b.query !== undefined) view.query = cleanQuery(b.query);
    await view.save();
    res.json({ view });
  })
);

router.delete(
  '/:viewId',
  asyncHandler(async (req, res) => {
    const view = await SavedView.findOne({ _id: req.params.viewId, workspace: req.params.workspaceId });
    if (!view) throw new ApiError(404, 'View not found');
    if (String(view.owner) !== String(req.user._id) && RANK[req.role] < RANK.admin) throw new ApiError(403, 'Only the creator or an admin can delete this view');
    await view.deleteOne();
    res.json({ message: 'View deleted' });
  })
);

export default router;
