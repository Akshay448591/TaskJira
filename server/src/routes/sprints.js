import { Router } from 'express';
import { z } from 'zod';
import { Sprint } from '../models/Sprint.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { requireRole, checkIdParam } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { RANK } from '../constants.js';
import { doneKeys } from '../services/workflow.js';
import { burndown, logSprint, progressOf, dayKey } from '../services/sprints.js';
import { logActivity } from '../services/activity.js';
import { emit } from '../realtime.js';

// mounted at /workspaces/:workspaceId/projects/:projectId/sprints
const router = Router({ mergeParams: true });
router.param('sprintId', checkIdParam);

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const date = z.coerce.date();
const sprintSchema = z.object({
  name: z.string().trim().min(1, 'Sprint name is required').max(80),
  goal: z.string().trim().max(1000).optional(),
  startDate: date,
  endDate: date,
});
const completeSchema = z.object({
  to: z.enum(['backlog', 'existing', 'new']).default('backlog'), // where unfinished tasks go
  sprintId: oid.optional(),
  next: sprintSchema.partial({ goal: true }).optional(),
});

const checkDates = (s, e) => { if (e < s) throw new ApiError(400, 'The end date must be on or after the start date'); };

router.use(
  asyncHandler(async (req, res, next) => {
    const project = await Project.findOne({ _id: req.params.projectId, workspace: req.params.workspaceId });
    if (!project) throw new ApiError(404, 'Project not found');
    req.project = project;
    next();
  })
);
const canManage = (req) => RANK[req.role] >= RANK.admin || String(req.project.owner) === String(req.user._id);
const manage = (req, res, next) => (canManage(req) ? next() : next(new ApiError(403, 'Only the project owner or an admin can manage sprints')));
const getSprint = async (req) => {
  const s = await Sprint.findOne({ _id: req.params.sprintId, project: req.project._id, workspace: req.params.workspaceId });
  if (!s) throw new ApiError(404, 'Sprint not found');
  return s;
};
const changed = (req, what, extra = {}) => {
  const wid = req.params.workspaceId;
  emit([`project:${req.project._id}`, `ws:${wid}`], 'project:changed', { projectId: String(req.project._id), what, ...extra }, req);
};
const shape = (s, progress) => {
  const o = s.toObject();
  delete o.log; // can be large; the burndown endpoint derives from it
  return { ...o, progress };
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const done = new Set(doneKeys(req.project));
    const [sprints, tasks, backlog] = await Promise.all([
      Sprint.find({ project: req.project._id, workspace: wid }).select('-log'),
      Task.find({ project: req.project._id, workspace: wid, parent: null, sprint: { $ne: null } }).select('sprint status storyPoints').lean(),
      Task.find({ project: req.project._id, workspace: wid, parent: null, sprint: null }).select('status storyPoints').lean(),
    ]);
    const order = { active: 0, planned: 1, completed: 2 };
    sprints.sort((a, b) => order[a.status] - order[b.status] || (a.status === 'completed' ? b.endDate - a.endDate : a.startDate - b.startDate));
    res.json({
      sprints: sprints.map((s) => shape(s, progressOf(tasks.filter((t) => String(t.sprint) === String(s._id)), (t) => done.has(t.status)))),
      backlog: progressOf(backlog, (t) => done.has(t.status)),
      canManage: canManage(req),
    });
  })
);

router.post(
  '/',
  requireRole('member'),
  manage,
  validate(sprintSchema),
  asyncHandler(async (req, res) => {
    checkDates(req.body.startDate, req.body.endDate);
    const sprint = await Sprint.create({ ...req.body, workspace: req.params.workspaceId, project: req.project._id, createdBy: req.user._id });
    await logActivity({ workspace: req.params.workspaceId, project: req.project._id, actor: req.user._id, action: 'sprint_created', text: `created sprint “${sprint.name}”` });
    changed(req, 'sprint');
    res.status(201).json({ sprint: shape(sprint, progressOf([], () => false)) });
  })
);

router.get(
  '/:sprintId',
  validate(z.object({ metric: z.enum(['points', 'tasks']).default('points') }), 'query'),
  asyncHandler(async (req, res) => {
    const sprint = await getSprint(req);
    const done = new Set(doneKeys(req.project));
    const tasks = await Task.find({ sprint: sprint._id, workspace: req.params.workspaceId }).populate('assignee', 'name avatar').sort('position');
    res.json({
      sprint: shape(sprint, progressOf(tasks, (t) => done.has(t.status))),
      tasks,
      burndown: burndown(sprint, req.query.metric),
    });
  })
);

router.patch(
  '/:sprintId',
  requireRole('member'),
  manage,
  validate(sprintSchema.partial()),
  asyncHandler(async (req, res) => {
    const sprint = await getSprint(req);
    if (sprint.status === 'completed') throw new ApiError(400, 'A completed sprint cannot be edited');
    const b = req.body;
    checkDates(b.startDate || sprint.startDate, b.endDate || sprint.endDate);
    Object.assign(sprint, b);
    await sprint.save();
    changed(req, 'sprint');
    res.json({ sprint: shape(sprint) });
  })
);

router.post(
  '/:sprintId/start',
  requireRole('member'),
  manage,
  asyncHandler(async (req, res) => {
    const sprint = await getSprint(req);
    if (sprint.status !== 'planned') throw new ApiError(400, 'Only a planned sprint can be started');
    if (await Sprint.exists({ project: req.project._id, status: 'active' })) throw new ApiError(400, 'Another sprint is already active. Complete it first.');
    const done = new Set(doneKeys(req.project));
    const tasks = await Task.find({ sprint: sprint._id, parent: null }).select('status storyPoints').lean();
    const now = new Date();
    const entries = [];
    for (const t of tasks) {
      const p = t.storyPoints || 0;
      entries.push({ at: now, type: 'scope', points: p, count: 1, task: t._id });
      if (done.has(t.status)) entries.push({ at: now, type: 'done', points: p, count: 1, task: t._id });
    }
    sprint.status = 'active';
    sprint.startedAt = now;
    sprint.committedPoints = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
    sprint.committedCount = tasks.length;
    sprint.log = entries;
    await sprint.save();
    await logActivity({ workspace: req.params.workspaceId, project: req.project._id, actor: req.user._id, action: 'sprint_started', text: `started sprint “${sprint.name}” (${tasks.length} tasks, ${sprint.committedPoints} points)` });
    changed(req, 'sprint');
    res.json({ sprint: shape(sprint) });
  })
);

// Complete: unfinished tasks are carried over to the backlog, an existing planned sprint, or a brand-new sprint.
router.post(
  '/:sprintId/complete',
  requireRole('member'),
  manage,
  validate(completeSchema),
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const sprint = await getSprint(req);
    if (sprint.status !== 'active') throw new ApiError(400, 'Only an active sprint can be completed');
    const { to, sprintId, next } = req.body;

    let target = null;
    if (to === 'existing') {
      target = await Sprint.findOne({ _id: sprintId, project: req.project._id, workspace: wid, status: 'planned' });
      if (!target) throw new ApiError(400, 'Choose a planned sprint in this project to carry the unfinished tasks over to');
    } else if (to === 'new') {
      if (!next) throw new ApiError(400, 'Give the new sprint a name and dates');
      checkDates(next.startDate, next.endDate);
      target = await Sprint.create({ ...next, goal: '', workspace: wid, project: req.project._id, createdBy: req.user._id });
    }

    const done = new Set(doneKeys(req.project));
    const tasks = await Task.find({ sprint: sprint._id, parent: null }).select('status storyPoints').lean();
    const finished = tasks.filter((t) => done.has(t.status));
    const unfinished = tasks.filter((t) => !done.has(t.status));
    if (unfinished.length) await Task.updateMany({ _id: { $in: unfinished.map((t) => t._id) } }, { $set: { sprint: target ? target._id : null } });

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    sprint.completedPoints = finished.reduce((s, t) => s + (t.storyPoints || 0), 0);
    sprint.completedCount = finished.length;
    sprint.carriedOver = unfinished.length;
    await sprint.save();
    await logActivity({
      workspace: wid, project: req.project._id, actor: req.user._id, action: 'sprint_completed',
      text: `completed sprint “${sprint.name}”: ${finished.length} done (${sprint.completedPoints} pts), ${unfinished.length} carried over to ${target ? `“${target.name}”` : 'the backlog'}`,
    });
    changed(req, 'sprint');
    emit([`project:${req.project._id}`, `ws:${wid}`], 'task:changed', { projectId: String(req.project._id), bulk: true }, req);
    res.json({ sprint: shape(sprint), carriedOver: unfinished.length, target: target ? { _id: target._id, name: target.name } : null });
  })
);

router.delete(
  '/:sprintId',
  requireRole('member'),
  manage,
  asyncHandler(async (req, res) => {
    const sprint = await getSprint(req);
    if (sprint.status !== 'planned') throw new ApiError(400, 'Only planned sprints can be deleted (its tasks go back to the backlog)');
    await Task.updateMany({ sprint: sprint._id }, { $set: { sprint: null } });
    await sprint.deleteOne();
    changed(req, 'sprint');
    emit([`project:${req.project._id}`, `ws:${req.params.workspaceId}`], 'task:changed', { projectId: String(req.project._id), bulk: true }, req);
    res.json({ message: 'Sprint deleted' });
  })
);

export { logSprint, dayKey }; // (re-exported for tests)
export default router;
