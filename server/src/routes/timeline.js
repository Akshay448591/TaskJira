import { Router } from 'express';
import { z } from 'zod';
import { Task } from '../models/Task.js';
import { TaskLink } from '../models/TaskLink.js';
import { Milestone } from '../models/Milestone.js';
import { Project } from '../models/Project.js';
import { requireRole, checkIdParam } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { columnsOf, doneKeys } from '../services/workflow.js';
import { findConflicts, findCycles } from '../services/schedule.js';
import { logActivity } from '../services/activity.js';
import { emit } from '../realtime.js';

// mounted at /workspaces/:workspaceId/projects/:projectId   (adds /timeline and /milestones)
const router = Router({ mergeParams: true });
router.param('milestoneId', checkIdParam);

const milestoneSchema = z.object({
  name: z.string().trim().min(1, 'Milestone name is required').max(80),
  description: z.string().trim().max(500).optional(),
  date: z.coerce.date(),
  completed: z.boolean().optional(),
});

async function loadProject(req) {
  const p = await Project.findOne({ _id: req.params.projectId, workspace: req.params.workspaceId });
  if (!p) throw new ApiError(404, 'Project not found');
  return p;
}

// Everything the Gantt view needs in one call, including detected conflicts and dependency cycles.
router.get(
  '/timeline',
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const project = await loadProject(req);
    const done = new Set(doneKeys(project));
    const tasks = await Task.find({ project: project._id, workspace: wid, parent: null })
      .select('number title status priority startDate dueDate assignee storyPoints sprint completedAt')
      .populate('assignee', 'name avatar')
      .sort('startDate createdAt')
      .lean();
    const ids = tasks.map((t) => t._id);
    const links = await TaskLink.find({ workspace: wid, type: 'blocks', from: { $in: ids }, to: { $in: ids } }).select('from to').lean();
    const milestones = await Milestone.find({ project: project._id, workspace: wid }).sort('date');
    const isDone = (t) => done.has(t.status);
    res.json({
      project: { _id: project._id, name: project.name, deadline: project.deadline, columns: columnsOf(project) },
      tasks,
      links: links.map((l) => ({ _id: l._id, from: String(l.from), to: String(l.to) })),
      milestones,
      conflicts: findConflicts({ tasks, links, isDone }),
      cycles: findCycles(links),
    });
  })
);

const changed = (req, project) =>
  emit([`project:${project._id}`, `ws:${req.params.workspaceId}`], 'project:changed', { projectId: String(project._id), what: 'milestone' }, req);

router.post(
  '/milestones',
  requireRole('member'),
  validate(milestoneSchema),
  asyncHandler(async (req, res) => {
    const project = await loadProject(req);
    const m = await Milestone.create({ ...req.body, workspace: req.params.workspaceId, project: project._id, createdBy: req.user._id });
    await logActivity({ workspace: req.params.workspaceId, project: project._id, actor: req.user._id, action: 'milestone_created', text: `added milestone “${m.name}”` });
    changed(req, project);
    res.status(201).json({ milestone: m });
  })
);

router.patch(
  '/milestones/:milestoneId',
  requireRole('member'),
  validate(milestoneSchema.partial()),
  asyncHandler(async (req, res) => {
    const project = await loadProject(req);
    const m = await Milestone.findOne({ _id: req.params.milestoneId, project: project._id, workspace: req.params.workspaceId });
    if (!m) throw new ApiError(404, 'Milestone not found');
    Object.assign(m, req.body);
    await m.save();
    changed(req, project);
    res.json({ milestone: m });
  })
);

router.delete(
  '/milestones/:milestoneId',
  requireRole('member'),
  asyncHandler(async (req, res) => {
    const project = await loadProject(req);
    const r = await Milestone.deleteOne({ _id: req.params.milestoneId, project: project._id, workspace: req.params.workspaceId });
    if (!r.deletedCount) throw new ApiError(404, 'Milestone not found');
    changed(req, project);
    res.json({ message: 'Milestone deleted' });
  })
);

export default router;
