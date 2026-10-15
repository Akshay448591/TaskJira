import { Router } from 'express';
import path from 'path';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { Membership } from '../models/Membership.js';
import { Comment } from '../models/Comment.js';
import { Activity } from '../models/Activity.js';
import { TaskLink } from '../models/TaskLink.js';
import { User } from '../models/User.js';
import { requireRole, checkIdParam } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { attachmentUpload, removeFile, ATTACH_DIR } from '../middleware/upload.js';
import { ApiError, asyncHandler, escapeRegex } from '../utils/ApiError.js';
import { PRIORITIES, RANK } from '../constants.js';
import { columnsOf, columnName, doneKeys, isDone } from '../services/workflow.js';
import { Sprint } from '../models/Sprint.js';
import { logSprintTransition } from '../services/sprints.js';
import { findConflicts, wouldCreateCycle } from '../services/schedule.js';
import { emit } from '../realtime.js';
import { notify, findMentionedUsers, mentionsIn } from '../services/notify.js';
import { logActivity } from '../services/activity.js';
import { deleteTasksCascade } from '../services/cascade.js';

const router = Router({ mergeParams: true });
for (const p of ['taskId', 'commentId', 'attId', 'linkId']) router.param(p, checkIdParam);

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const labels = z.array(z.string().trim().min(1).max(30)).max(10);

const statusKey = z.string().regex(/^[\w-]{1,40}$/, 'Invalid status');
const createSchema = z.object({
  project: oid,
  parent: oid.nullable().optional(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(10000).optional(),
  status: statusKey.optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: oid.nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  labels: labels.optional(),
  position: z.number().finite().optional(),
  startDate: z.coerce.date().nullable().optional(),
  storyPoints: z.number().min(0).max(1000).nullable().optional(),
  sprint: oid.nullable().optional(),
});
const updateSchema = createSchema.omit({ project: true, parent: true }).partial();
const csv = (re) => z.string().max(200).regex(re);
const listQuery = z.object({
  project: oid.optional(),
  status: csv(/^[\w-]+(,[\w-]+)*$/).optional(), // comma separated column keys
  priority: csv(/^[a-z]+(,[a-z]+)*$/).optional(),
  assignee: z.union([oid, z.enum(['me', 'none'])]).optional(),
  label: z.string().max(30).optional(),
  search: z.string().trim().max(100).optional(),
  topLevel: z.enum(['true', 'false']).optional(),
  dueFrom: z.coerce.date().optional(), // inclusive
  dueTo: z.coerce.date().optional(), // exclusive
  noDue: z.enum(['true']).optional(),
  notDone: z.enum(['true']).optional(), // exclude tasks sitting in a Done column
  sort: z.enum(['number', 'title', 'dueDate', 'priority', 'updatedAt', 'createdAt', 'position']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(300).default(25),
});
const commentSchema = z.object({ body: z.string().trim().min(1, 'Comment cannot be empty').max(5000) });
const linkSchema = z.object({ type: z.enum(['blocks', 'blocked_by', 'relates_to']), targetId: oid });

const USER = 'name email avatar';
const POPULATE = [
  { path: 'assignee', select: USER },
  { path: 'reporter', select: USER },
  { path: 'project', select: 'name archived columns' },
];

const wsOf = (req) => req.params.workspaceId;

async function getTask(req) {
  // always scoped by workspace: a task id from another workspace is simply "not found"
  const task = await Task.findOne({ _id: req.params.taskId, workspace: wsOf(req) });
  if (!task) throw new ApiError(404, 'Task not found');
  return task;
}

async function assertAssignee(req, userId) {
  if (!userId) return;
  if (!(await Membership.exists({ workspace: wsOf(req), user: userId })))
    throw new ApiError(400, 'Assignee must be a member of this workspace');
}

async function nextNumber(workspace) {
  const ws = await Workspace.findByIdAndUpdate(workspace, { $inc: { taskCounter: 1 } }, { new: true });
  return ws.taskCounter;
}

const O = (id) => new mongoose.Types.ObjectId(String(id));

async function getProject(req, id) {
  const project = await Project.findOne({ _id: id, workspace: wsOf(req) });
  if (!project) throw new ApiError(404, 'Project not found');
  return project;
}

function assertStatus(project, key) {
  if (!columnsOf(project).some((c) => c.key === key)) throw new ApiError(400, 'That status does not exist in this project\'s workflow');
}

// new tasks / moved tasks go to the bottom of their column
async function nextPosition(project) {
  const last = await Task.findOne({ project }).sort('-position').select('position');
  return (last?.position ?? 0) + 1024;
}

// live update for everyone looking at this project (the originating tab is skipped via X-Socket-Id)
function rt(req, task, action) {
  const pid = String(task.project?._id || task.project);
  emit([`project:${pid}`, `ws:${wsOf(req)}`], 'task:changed', { action, taskId: String(task._id), projectId: pid, parent: task.parent ? String(task.parent) : null }, req);
}

// scheduling conflicts (finish-to-start dependencies) around the given tasks, as readable messages
async function conflictsFor(wid, taskIds) {
  const ids = taskIds.map(String);
  const links = await TaskLink.find({ workspace: wid, type: 'blocks', $or: [{ from: { $in: ids } }, { to: { $in: ids } }] }).select('from to').lean();
  if (!links.length) return [];
  const all = [...new Set(links.flatMap((l) => [String(l.from), String(l.to)]))];
  const tasks = await Task.find({ _id: { $in: all }, workspace: wid }).select('number title status project startDate dueDate').lean();
  const projects = await Project.find({ _id: { $in: [...new Set(tasks.map((t) => String(t.project)))] } }).select('columns');
  const doneBy = new Map(projects.map((p) => [String(p._id), new Set(doneKeys(p))]));
  const found = findConflicts({ tasks, links, isDone: (t) => doneBy.get(String(t.project))?.has(t.status) });
  return [...new Set(found.filter((c) => ids.includes(c.blocker) || ids.includes(c.blocked)).map((c) => c.message))];
}

async function assertSprint(req, task, sprintId, isSubtask) {
  if (!sprintId) return null;
  if (isSubtask) throw new ApiError(400, 'Subtasks follow their parent; put the parent task in the sprint');
  const sprint = await Sprint.findOne({ _id: sprintId, project: task.project, workspace: wsOf(req) });
  if (!sprint) throw new ApiError(404, 'Sprint not found in this project');
  if (sprint.status === 'completed') throw new ApiError(400, 'That sprint is already completed');
  return sprint;
}

const sameDate = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

// ---------- list + search + sort + filter + paginate ----------
router.get(
  '/labels',
  asyncHandler(async (req, res) => {
    const filter = { workspace: wsOf(req) };
    if (req.query.project && /^[a-f\d]{24}$/i.test(String(req.query.project))) filter.project = req.query.project;
    const labels = await Task.distinct('labels', filter);
    res.json({ labels: labels.sort((a, b) => a.localeCompare(b)) });
  })
);

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const filter = { workspace: O(wsOf(req)) };
    if (q.project) filter.project = O(q.project);
    if (q.status) filter.status = { $in: q.status.split(',') };
    if (q.priority) filter.priority = { $in: q.priority.split(',').filter((s) => PRIORITIES.includes(s)) };
    if (q.assignee === 'me') filter.assignee = req.user._id;
    else if (q.assignee === 'none') filter.assignee = null;
    else if (q.assignee) filter.assignee = O(q.assignee);
    if (q.label) filter.labels = q.label;
    if (q.topLevel === 'true') filter.parent = null;
    if (q.noDue) filter.dueDate = null;
    else if (q.dueFrom || q.dueTo) filter.dueDate = { ...(q.dueFrom && { $gte: q.dueFrom }), ...(q.dueTo && { $lt: q.dueTo }) };
    if (q.notDone) {
      const projects = await Project.find({ workspace: wsOf(req), ...(q.project ? { _id: q.project } : {}) }).select('columns');
      filter.$nor = projects.map((p) => ({ project: p._id, status: { $in: doneKeys(p) } }));
      if (!filter.$nor.length) delete filter.$nor;
    }
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      const or = [{ title: rx }, { description: rx }, { labels: rx }];
      const num = q.search.replace(/^#/, '');
      if (/^\d+$/.test(num)) or.push({ number: Number(num) });
      filter.$or = or;
    }

        const dir = q.dir === 'asc' ? 1 : -1;
    // priorityRank / noDue are stored helper fields (see Task model) so sorting needs no aggregation tricks
    const sort = {
      number: { number: dir },
      title: { title: dir },
      dueDate: { noDue: 1, dueDate: dir }, // tasks without a due date always last
      priority: { priorityRank: dir },
      updatedAt: { updatedAt: dir },
      createdAt: { createdAt: dir },
      position: { position: dir, createdAt: 1 },
    }[q.sort];
    sort._id = dir;
    let query = Task.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).populate(POPULATE).lean();
    if (q.sort === 'title') query = query.collation({ locale: 'en', strength: 2 });
    const [docs, total] = await Promise.all([query, Task.countDocuments(filter)]);

    const ids = docs.map((t) => t._id);
    const subs = await Task.find({ parent: { $in: ids }, workspace: wsOf(req) }).select('parent status project').lean();
    const projectDocs = await Project.find({ _id: { $in: [...new Set(docs.map((t) => String(t.project?._id || t.project)))] } }).select('columns');
    const doneByProject = Object.fromEntries(projectDocs.map((p) => [String(p._id), new Set(doneKeys(p))]));
    const subMap = {};
    for (const st of subs) {
      const m = (subMap[String(st.parent)] ||= { total: 0, done: 0 });
      m.total++;
      if (doneByProject[String(st.project)]?.has(st.status)) m.done++;
    }
    res.json({
      total,
      page: q.page,
      limit: q.limit,
      pages: Math.max(1, Math.ceil(total / q.limit)),
      tasks: docs.map((t) => {
        return { ...t, subtaskTotal: subMap[String(t._id)]?.total || 0, subtaskDone: subMap[String(t._id)]?.done || 0 };
      }),
    });
  })
);

// ---------- create ----------
router.post(
  '/',
  requireRole('member'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const wid = wsOf(req);
    const b = req.body;
    const project = await getProject(req, b.project);
    if (project.archived) throw new ApiError(400, 'This project is archived');
    const status = b.status ?? columnsOf(project)[0].key;
    assertStatus(project, status);
    await assertAssignee(req, b.assignee);
    if (b.parent) {
      const parent = await Task.findOne({ _id: b.parent, workspace: wid, project: project._id });
      if (!parent) throw new ApiError(404, 'Parent task not found');
      if (parent.parent) throw new ApiError(400, 'Subtasks cannot have their own subtasks');
    }
    if (b.startDate && b.dueDate && b.startDate > b.dueDate) throw new ApiError(400, 'The start date must be on or before the due date');
    await assertSprint(req, { project: project._id }, b.sprint, !!b.parent);
    const task = await Task.create({
      ...b,
      completedAt: isDone(project, status) ? new Date() : null,
      status,
      position: b.position ?? (await nextPosition(project._id)),
      workspace: wid,
      number: await nextNumber(wid),
      reporter: req.user._id,
    });
    const base = { workspace: wid, project: project._id, actor: req.user._id };
    await logActivity({ ...base, task: task._id, action: 'created', text: `created ${b.parent ? 'subtask' : 'task'} “${task.title}”` });
    if (b.parent) await logActivity({ ...base, task: b.parent, action: 'subtask_added', text: `added subtask “${task.title}”` });

    const ctx = { workspace: wid, project: project._id, task: task._id, actor: req.user };
    if (task.assignee) await notify({ ...ctx, type: 'assigned', recipients: [task.assignee], message: `assigned you to “${task.title}”` });
    const mentioned = await findMentionedUsers(wid, task.description);
    await notify({ ...ctx, type: 'mentioned', recipients: mentioned, message: `mentioned you in “${task.title}”` });

    if (task.sprint) await logSprintTransition({ sprint: null, points: 0, done: false }, { sprint: task.sprint, points: task.storyPoints || 0, done: isDone(project, status) }, task._id);
    rt(req, task, 'created');
    await task.populate(POPULATE);
    res.status(201).json({ task, warnings: [] });
  })
);

// ---------- read ----------
router.get(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const wid = wsOf(req);
    const task = await (await getTask(req)).populate(POPULATE);
    const [subtasks, links, parent] = await Promise.all([
      Task.find({ parent: task._id, workspace: wid }).sort('createdAt').populate('assignee', USER),
      TaskLink.find({ workspace: wid, $or: [{ from: task._id }, { to: task._id }] })
        .populate({ path: 'from', select: 'title number status project', populate: { path: 'project', select: 'columns' } })
        .populate({ path: 'to', select: 'title number status project', populate: { path: 'project', select: 'columns' } }),
      task.parent ? Task.findOne({ _id: task.parent, workspace: wid }).select('title number') : null,
    ]);
    const mapped = links
      .filter((l) => l.from && l.to)
      .map((l) => {
        const outgoing = String(l.from._id) === String(task._id);
        return {
          _id: l._id,
          type: l.type === 'relates_to' ? 'relates_to' : outgoing ? 'blocks' : 'blocked_by',
          task: outgoing ? l.to : l.from,
        };
      });
    res.json({ task, subtasks, parent, links: mapped });
  })
);

// ---------- update (also used for board drag & drop: status + position) ----------
router.patch(
  '/:taskId',
  requireRole('member'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const project = await Project.findOne({ _id: task.project, workspace: wsOf(req) });
    const b = req.body;
    if ('assignee' in b) await assertAssignee(req, b.assignee);
    const changes = [];
    const base = { workspace: wsOf(req), project: task.project, task: task._id, actor: req.user._id };
    const oldDescription = task.description;
    const oldAssignee = task.assignee ? String(task.assignee) : null;
    const before = { sprint: task.sprint, points: task.storyPoints || 0, done: isDone(project, task.status) };
    const oldSprintId = task.sprint ? String(task.sprint) : null;
    let statusChange = null;

    for (const f of ['title', 'priority']) {
      if (f in b && b[f] !== task[f]) {
        changes.push({ action: 'updated', field: f, from: String(task[f]), to: String(b[f]) });
        task[f] = b[f];
      }
    }
    if ('status' in b && b.status !== task.status) {
      assertStatus(project, b.status);
      statusChange = { from: columnName(project, task.status), to: columnName(project, b.status) };
      changes.push({ action: 'updated', field: 'status', ...statusChange });
      task.status = b.status;
      task.completedAt = isDone(project, b.status) ? task.completedAt || new Date() : null;
      // changed column without an explicit position (e.g. from the task modal): go to the bottom
      if (!('position' in b)) task.position = await nextPosition(task.project);
    }
    if ('position' in b) task.position = b.position;
    if ('description' in b && b.description !== task.description) {
      changes.push({ action: 'updated', field: 'description', text: 'updated the description' });
      task.description = b.description;
    }
    if ('dueDate' in b && !sameDate(b.dueDate, task.dueDate)) {
      changes.push({
        action: 'updated',
        field: 'dueDate',
        from: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : 'none',
        to: b.dueDate ? b.dueDate.toISOString().slice(0, 10) : 'none',
      });
      task.dueDate = b.dueDate;
    }
    if ('labels' in b && JSON.stringify(b.labels) !== JSON.stringify(task.labels)) {
      changes.push({ action: 'updated', field: 'labels', from: task.labels.join(', ') || 'none', to: b.labels.join(', ') || 'none' });
      task.labels = b.labels;
    }
    if ('assignee' in b && String(b.assignee || '') !== String(task.assignee || '')) {
      const users = await User.find({ _id: { $in: [task.assignee, b.assignee].filter(Boolean) } }).select('name');
      const nameOf = (id) => users.find((u) => String(u._id) === String(id))?.name || 'unassigned';
      changes.push({ action: 'updated', field: 'assignee', from: nameOf(task.assignee), to: nameOf(b.assignee) });
      task.assignee = b.assignee;
    }
    if ('storyPoints' in b && (b.storyPoints ?? null) !== (task.storyPoints ?? null)) {
      changes.push({ action: 'updated', field: 'storyPoints', from: String(task.storyPoints ?? 'none'), to: String(b.storyPoints ?? 'none') });
      task.storyPoints = b.storyPoints;
    }
    if ('startDate' in b && !sameDate(b.startDate, task.startDate)) {
      changes.push({ action: 'updated', field: 'startDate', from: task.startDate ? task.startDate.toISOString().slice(0, 10) : 'none', to: b.startDate ? b.startDate.toISOString().slice(0, 10) : 'none' });
      task.startDate = b.startDate;
    }
    if ('sprint' in b && String(b.sprint || '') !== oldSprintId) {
      await assertSprint(req, task, b.sprint, !!task.parent);
      const named = await Sprint.find({ _id: { $in: [oldSprintId, b.sprint].filter(Boolean) } }).select('name');
      const nm = (id) => named.find((x) => String(x._id) === String(id))?.name || 'Backlog';
      changes.push({ action: 'updated', field: 'sprint', from: nm(oldSprintId), to: b.sprint ? nm(b.sprint) : 'Backlog' });
      task.sprint = b.sprint;
    }
    if (task.startDate && task.dueDate && task.startDate > task.dueDate) throw new ApiError(400, 'The start date must be on or before the due date');
    await task.save();
    for (const c of changes) await logActivity({ ...base, ...c });
    await logSprintTransition(before, { sprint: task.sprint, points: task.storyPoints || 0, done: isDone(project, task.status) }, task._id);
    const scheduleTouched = changes.some((c) => ['startDate', 'dueDate', 'status'].includes(c.field));
    const warnings = scheduleTouched ? await conflictsFor(wsOf(req), [task._id]) : [];
    rt(req, task, 'updated');

    // ----- notifications -----
    const ctx = { workspace: wsOf(req), project: task.project, task: task._id, actor: req.user };
    const newAssignee = task.assignee ? String(task.assignee) : null;
    if (newAssignee && newAssignee !== oldAssignee)
      await notify({ ...ctx, type: 'assigned', recipients: [newAssignee], message: `assigned you to “${task.title}”` });
    if (statusChange)
      await notify({ ...ctx, type: 'status_changed', recipients: [task.assignee, task.reporter], message: `moved “${task.title}” from ${statusChange.from} to ${statusChange.to}` });
    if ('description' in b && b.description !== oldDescription) {
      const before = mentionsIn(oldDescription);
      const fresh = [...mentionsIn(task.description)].filter((h) => !before.has(h));
      if (fresh.length) {
        const ids = await findMentionedUsers(wsOf(req), fresh.map((h) => `@${h}`).join(' '));
        await notify({ ...ctx, type: 'mentioned', recipients: ids, message: `mentioned you in “${task.title}”` });
      }
    }

    await task.populate(POPULATE);
    res.json({ task, warnings });
  })
);

// ---------- delete / duplicate ----------
router.delete(
  '/:taskId',
  requireRole('member'),
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    if (RANK[req.role] < RANK.admin && String(task.reporter) !== String(req.user._id))
      throw new ApiError(403, 'Only the reporter or an admin can delete this task');
    const proj = await Project.findById(task.project).select('columns');
    await logSprintTransition({ sprint: task.sprint, points: task.storyPoints || 0, done: isDone(proj, task.status) }, { sprint: null, points: 0, done: false }, task._id);
    await deleteTasksCascade({ workspace: wsOf(req), $or: [{ _id: task._id }, { parent: task._id }] });
    rt(req, task, 'deleted');
    res.json({ message: 'Task deleted' });
  })
);

router.post(
  '/:taskId/duplicate',
  requireRole('member'),
  asyncHandler(async (req, res) => {
    const wid = wsOf(req);
    const src = await getTask(req);
    const project = await Project.findOne({ _id: src.project, workspace: wid });
    const copyOne = async (t, parent, title) =>
      Task.create({
        workspace: wid,
        project: t.project,
        parent,
        number: await nextNumber(wid),
        title,
        description: t.description,
        status: columnsOf(project)[0].key,
        position: await nextPosition(t.project),
        priority: t.priority,
        assignee: t.assignee,
        reporter: req.user._id,
        dueDate: t.dueDate,
        labels: t.labels,
      });
    const copy = await copyOne(src, src.parent, `${src.title} (copy)`);
    if (!src.parent) {
      const subs = await Task.find({ parent: src._id, workspace: wid }).sort('createdAt');
      for (const s of subs) await copyOne(s, copy._id, s.title);
    }
    await logActivity({ workspace: wid, project: src.project, task: copy._id, actor: req.user._id, action: 'duplicated', text: `duplicated #${src.number}` });
    rt(req, copy, 'created');
    await copy.populate(POPULATE);
    res.status(201).json({ task: copy });
  })
);

// ---------- comments ----------
router.get(
  '/:taskId/comments',
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const comments = await Comment.find({ task: task._id, workspace: wsOf(req) }).sort('createdAt').populate('author', USER);
    res.json({ comments });
  })
);

router.post(
  '/:taskId/comments',
  requireRole('member'),
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const comment = await Comment.create({ workspace: wsOf(req), task: task._id, author: req.user._id, body: req.body.body });
    await logActivity({ workspace: wsOf(req), project: task.project, task: task._id, actor: req.user._id, action: 'commented', text: 'added a comment' });
    const ctx = { workspace: wsOf(req), project: task.project, task: task._id, actor: req.user };
    const mentioned = await findMentionedUsers(wsOf(req), comment.body);
    await notify({ ...ctx, type: 'mentioned', recipients: mentioned, message: `mentioned you in a comment on “${task.title}”` });
    const others = [task.assignee, task.reporter].filter((id) => id && !mentioned.includes(String(id)));
    await notify({ ...ctx, type: 'comment', recipients: others, message: `commented on “${task.title}”` });
    await comment.populate('author', USER);
    emit(`task:${task._id}`, 'comment:created', { taskId: String(task._id), comment }, req);
    res.status(201).json({ comment });
  })
);

router.delete(
  '/:taskId/comments/:commentId',
  requireRole('member'),
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const comment = await Comment.findOne({ _id: req.params.commentId, task: task._id, workspace: wsOf(req) });
    if (!comment) throw new ApiError(404, 'Comment not found');
    if (RANK[req.role] < RANK.admin && String(comment.author) !== String(req.user._id))
      throw new ApiError(403, 'You can only delete your own comments');
    await comment.deleteOne();
    emit(`task:${task._id}`, 'comment:deleted', { taskId: String(task._id), commentId: String(comment._id) }, req);
    res.json({ message: 'Comment deleted' });
  })
);

// ---------- activity ----------
router.get(
  '/:taskId/activity',
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const activity = await Activity.find({ task: task._id, workspace: wsOf(req) }).sort('-createdAt').limit(100).populate('actor', USER);
    res.json({ activity });
  })
);

// ---------- attachments ----------
router.post(
  '/:taskId/attachments',
  requireRole('member'),
  asyncHandler(async (req, res, next) => {
    await getTask(req); // reject before storing any file for a task that isn't ours
    next();
  }),
  attachmentUpload.array('files', 5),
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    if (!req.files?.length) throw new ApiError(400, 'No files uploaded');
    for (const f of req.files) {
      task.attachments.push({
        filename: f.filename,
        originalName: path.basename(f.originalname).slice(0, 200),
        mimetype: f.mimetype,
        size: f.size,
        uploadedBy: req.user._id,
      });
    }
    await task.save();
    const names = req.files.map((f) => f.originalname).join(', ');
    await logActivity({ workspace: wsOf(req), project: task.project, task: task._id, actor: req.user._id, action: 'attachment_added', text: `attached ${names}` });
    rt(req, task, 'updated');
    res.status(201).json({ attachments: task.attachments });
  })
);

router.get(
  '/:taskId/attachments/:attId',
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const att = task.attachments.id(req.params.attId);
    if (!att) throw new ApiError(404, 'Attachment not found');
    res.download(path.join(ATTACH_DIR, path.basename(att.filename)), att.originalName);
  })
);

router.delete(
  '/:taskId/attachments/:attId',
  requireRole('member'),
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const att = task.attachments.id(req.params.attId);
    if (!att) throw new ApiError(404, 'Attachment not found');
    await removeFile(ATTACH_DIR, att.filename);
    const name = att.originalName;
    att.deleteOne();
    await task.save();
    await logActivity({ workspace: wsOf(req), project: task.project, task: task._id, actor: req.user._id, action: 'attachment_removed', text: `removed attachment ${name}` });
    rt(req, task, 'updated');
    res.json({ attachments: task.attachments });
  })
);

// ---------- relationships ----------
router.post(
  '/:taskId/links',
  requireRole('member'),
  validate(linkSchema),
  asyncHandler(async (req, res) => {
    const wid = wsOf(req);
    const task = await getTask(req);
    const { type, targetId } = req.body;
    if (String(task._id) === targetId) throw new ApiError(400, 'A task cannot be linked to itself');
    const target = await Task.findOne({ _id: targetId, workspace: wid });
    if (!target) throw new ApiError(404, 'Target task not found in this workspace');

    // normalise: "blocked by" is stored as the target blocking this task
    const [from, to, kind] = type === 'blocked_by' ? [target._id, task._id, 'blocks'] : [task._id, target._id, type === 'blocks' ? 'blocks' : 'relates_to'];
    const dupFilter =
      kind === 'relates_to'
        ? { $or: [{ from, to, type: kind }, { from: to, to: from, type: kind }] }
        : { from, to, type: kind };
    if (await TaskLink.exists(dupFilter)) throw new ApiError(409, 'These tasks are already linked that way');
    if (kind === 'blocks') {
      // reject any dependency cycle (A blocks B blocks C blocks A ...), not just direct reversals
      const edges = await TaskLink.find({ workspace: wid, type: 'blocks' }).select('from to').lean();
      const path = wouldCreateCycle(edges, from, to);
      if (path) {
        const ts = await Task.find({ _id: { $in: [String(from), ...path] } }).select('number title').lean();
        const name = (id) => { const t = ts.find((x) => String(x._id) === String(id)); return t ? `#${t.number} ${t.title}` : id; };
        throw new ApiError(400, `That would create a dependency cycle: ${[String(from), ...path].map(name).join(' → ')}`);
      }
    }

    const link = await TaskLink.create({ workspace: wid, from, to, type: kind, createdBy: req.user._id });
    const label = { blocks: 'blocks', blocked_by: 'is blocked by', relates_to: 'relates to' }[type];
    await logActivity({ workspace: wid, project: task.project, task: task._id, actor: req.user._id, action: 'link_added', text: `marked this as ${label} #${target.number} ${target.title}` });
    rt(req, task, 'updated');
    rt(req, target, 'updated');
    res.status(201).json({ id: link._id, warnings: kind === 'blocks' ? await conflictsFor(wid, [task._id, target._id]) : [] });
  })
);

router.delete(
  '/:taskId/links/:linkId',
  requireRole('member'),
  asyncHandler(async (req, res) => {
    const task = await getTask(req);
    const link = await TaskLink.findOneAndDelete({
      _id: req.params.linkId,
      workspace: wsOf(req),
      $or: [{ from: task._id }, { to: task._id }],
    });
    if (!link) throw new ApiError(404, 'Link not found');
    await logActivity({ workspace: wsOf(req), project: task.project, task: task._id, actor: req.user._id, action: 'link_removed', text: 'removed a task link' });
    rt(req, task, 'updated');
    res.json({ message: 'Link removed' });
  })
);

export default router;
