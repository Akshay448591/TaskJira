import { Router } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Membership } from '../models/Membership.js';
import { requireRole, checkIdParam } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler, escapeRegex } from '../utils/ApiError.js';
import { COLUMN_CATEGORIES, COLUMN_COLORS, DEFAULT_COLUMNS, PRIORITIES, PROJECT_STATUSES, RANK } from '../constants.js';
import { deleteProjectCascade } from '../services/cascade.js';
import { columnsOf, doneKeys } from '../services/workflow.js';
import { logActivity } from '../services/activity.js';
import { emit } from '../realtime.js';
import sprintRoutes from './sprints.js';
import timelineRoutes from './timeline.js';

const router = Router({ mergeParams: true });
router.param('projectId', checkIdParam);

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const projectSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  deadline: z.coerce.date().nullable().optional(),
  owner: oid.optional(),
  members: z.array(oid).max(200).optional(),
});
const listQuery = z.object({
  archived: z.enum(['true', 'false']).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
});
const columnsSchema = z.object({
  columns: z
    .array(
      z.object({
        key: z.string().regex(/^[\w-]{1,40}$/).optional(),
        name: z.string().trim().min(1, 'Column name is required').max(30),
        color: z.enum(COLUMN_COLORS).default('slate'),
        category: z.enum(COLUMN_CATEGORIES),
      })
    )
    .min(2, 'A workflow needs at least 2 columns')
    .max(12, 'A workflow can have at most 12 columns'),
});

const POPULATE = [
  { path: 'owner', select: 'name email avatar' },
  { path: 'members', select: 'name email avatar' },
];

async function assertWorkspaceUsers(workspace, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return;
  const count = await Membership.countDocuments({ workspace, user: { $in: unique } });
  if (count !== unique.length) throw new ApiError(400, 'Owner and members must belong to this workspace');
}

const canManage = (req, project) =>
  RANK[req.role] >= RANK.admin || String(project.owner?._id || project.owner) === String(req.user._id);

async function getProject(req) {
  const p = await Project.findOne({ _id: req.params.projectId, workspace: req.params.workspaceId });
  if (!p) throw new ApiError(404, 'Project not found');
  return p;
}

// Completion is "tasks in a Done-category column / all top-level tasks". Subtasks roll up into their parent.
async function statsFor(workspace, projects) {
  const ids = projects.map((p) => p._id);
  const rows = await Task.aggregate([
    { $match: { workspace: new mongoose.Types.ObjectId(workspace), project: { $in: ids }, parent: null } },
    { $group: { _id: { project: '$project', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const counts = {};
  for (const r of rows) (counts[String(r._id.project)] ||= {})[r._id.status] = r.n;
  const out = {};
  for (const p of projects) {
    const cols = columnsOf(p);
    const done = new Set(doneKeys(p));
    const c = counts[String(p._id)] || {};
    const byStatus = {};
    let total = 0;
    let doneCount = 0;
    for (const [k, n] of Object.entries(c)) {
      total += n;
      if (done.has(k)) doneCount += n;
      byStatus[k] = n;
    }
    out[String(p._id)] = {
      total,
      done: doneCount,
      byStatus,
      columns: cols.map((col) => ({ ...col, count: byStatus[col.key] || 0 })),
      completion: total ? Math.round((doneCount / total) * 100) : 0,
    };
  }
  return out;
}

const shape = (p, stats) => ({ ...p.toObject(), columns: columnsOf(p), ...(stats ? { stats } : {}) });
const startOfTodayUTC = () => new Date(new Date().toISOString().slice(0, 10));

const pChanged = (req, projectId, what) =>
  emit([`project:${projectId}`, `ws:${req.params.workspaceId}`], 'project:changed', { projectId: String(projectId), what }, req);

router.use('/:projectId/sprints', sprintRoutes);
router.use('/:projectId', timelineRoutes); // /timeline and /milestones

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { archived = 'false', status, search } = req.query;
    const filter = { workspace: req.params.workspaceId, archived: archived === 'true' };
    if (status) filter.status = status;
    if (search) filter.name = new RegExp(escapeRegex(search), 'i');
    const projects = await Project.find(filter).sort('-updatedAt').populate(POPULATE);
    const stats = await statsFor(req.params.workspaceId, projects);
    res.json({ projects: projects.map((p) => shape(p, stats[String(p._id)])) });
  })
);

router.post(
  '/',
  requireRole('member'),
  validate(projectSchema),
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const owner = req.body.owner || String(req.user._id);
    const members = (req.body.members || []).filter((m) => m !== owner);
    await assertWorkspaceUsers(wid, [owner, ...members]);
    const project = await Project.create({ ...req.body, owner, members, workspace: wid, createdBy: req.user._id, columns: DEFAULT_COLUMNS });
    await logActivity({ workspace: wid, project: project._id, actor: req.user._id, action: 'project_created', text: `created project “${project.name}”` });
    pChanged(req, project._id, 'created');
    await project.populate(POPULATE);
    res.status(201).json({ project: shape(project) });
  })
);

router.get(
  '/:projectId',
  asyncHandler(async (req, res) => {
    const project = await (await getProject(req)).populate(POPULATE);
    const stats = (await statsFor(req.params.workspaceId, [project]))[String(project._id)];
    stats.overdue = await Task.countDocuments({
      workspace: req.params.workspaceId,
      project: project._id,
      parent: null,
      status: { $nin: doneKeys(project) },
      dueDate: { $lt: startOfTodayUTC() },
    });
    res.json({ project: shape(project, stats), canManage: canManage(req, project) });
  })
);

router.patch(
  '/:projectId',
  requireRole('member'),
  validate(projectSchema.partial()),
  asyncHandler(async (req, res) => {
    const project = await getProject(req);
    if (!canManage(req, project)) throw new ApiError(403, 'Only the project owner or an admin can edit this project');
    const wid = req.params.workspaceId;
    const owner = req.body.owner || String(project.owner);
    const members = (req.body.members || project.members.map(String)).filter((m) => String(m) !== owner);
    if (req.body.owner && owner !== String(project.owner) && RANK[req.role] < RANK.admin)
      throw new ApiError(403, 'Only admins can change the project owner');
    await assertWorkspaceUsers(wid, [owner, ...members]);
    Object.assign(project, req.body, { owner, members });
    await project.save();
    await logActivity({ workspace: wid, project: project._id, actor: req.user._id, action: 'project_updated', text: 'updated the project details' });
    pChanged(req, project._id, 'updated');
    await project.populate(POPULATE);
    res.json({ project: shape(project) });
  })
);

// Replace the workflow (board columns). Existing columns are matched by key; tasks that sit in a
// removed column are moved to the first remaining column of the same category (else the first column).
router.put(
  '/:projectId/columns',
  requireRole('member'),
  validate(columnsSchema),
  asyncHandler(async (req, res) => {
    const project = await getProject(req);
    if (!canManage(req, project)) throw new ApiError(403, 'Only the project owner or an admin can change the workflow');
    const existing = columnsOf(project);
    const existingKeys = new Set(existing.map((c) => c.key));
    const incoming = req.body.columns;

    const names = new Set();
    const keys = new Set();
    const next = incoming.map((c) => {
      if (c.key && !existingKeys.has(c.key)) throw new ApiError(400, 'Unknown column key');
      const lower = c.name.toLowerCase();
      if (names.has(lower)) throw new ApiError(400, `Column name "${c.name}" is used twice`);
      names.add(lower);
      const key = c.key || `c_${crypto.randomBytes(4).toString('hex')}`;
      if (keys.has(key)) throw new ApiError(400, 'A column was sent twice');
      keys.add(key);
      return { key, name: c.name, color: c.color, category: c.category };
    });
    if (!next.some((c) => c.category === 'done')) throw new ApiError(400, 'At least one column must be in the "Done" category');
    if (!next.some((c) => c.category !== 'done')) throw new ApiError(400, 'At least one column must be an open (To do / In progress) category');

    let moved = 0;
    for (const old of existing.filter((c) => !keys.has(c.key))) {
      const target = next.find((c) => c.category === old.category) || next[0];
      const r = await Task.updateMany({ workspace: req.params.workspaceId, project: project._id, status: old.key }, { $set: { status: target.key } });
      moved += r.modifiedCount;
    }
    project.columns = next;
    await project.save();
    await logActivity({ workspace: req.params.workspaceId, project: project._id, actor: req.user._id, action: 'columns_updated', text: `updated the workflow columns (${next.map((c) => c.name).join(' → ')})` });
    pChanged(req, project._id, 'columns');
    res.json({ columns: next, moved });
  })
);

for (const [action, value] of [['archive', true], ['unarchive', false]]) {
  router.post(
    `/:projectId/${action}`,
    requireRole('member'),
    asyncHandler(async (req, res) => {
      const project = await getProject(req);
      if (!canManage(req, project)) throw new ApiError(403, 'Only the project owner or an admin can do that');
      project.archived = value;
      await project.save();
      await logActivity({ workspace: req.params.workspaceId, project: project._id, actor: req.user._id, action: `project_${action}d`, text: `${action}d the project` });
      pChanged(req, project._id, 'archived');
      res.json({ archived: project.archived });
    })
  );
}

router.delete(
  '/:projectId',
  requireRole('member'),
  asyncHandler(async (req, res) => {
    const project = await getProject(req);
    if (!canManage(req, project)) throw new ApiError(403, 'Only the project owner or an admin can delete this project');
    await deleteProjectCascade(req.params.workspaceId, project._id);
    // logged without a project id so it survives the cascade and still shows in the workspace feed
    await logActivity({ workspace: req.params.workspaceId, actor: req.user._id, action: 'project_deleted', text: `deleted project “${project.name}”` });
    pChanged(req, project._id, 'deleted');
    res.json({ message: 'Project deleted' });
  })
);

export default router;
