import { Router } from 'express';
import { z } from 'zod';
import { buildAnalytics } from '../services/analytics.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { toCsv } from '../utils/csv.js';
import { User } from '../models/User.js';

const router = Router({ mergeParams: true });
const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const query = z.object({
  project: oid.optional(),
  sprint: oid.optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  type: z.enum(['tasks', 'workload', 'projects', 'trends', 'velocity']).default('tasks'),
});

function checkRange(range) {
  const a = new Date(range.from), b = new Date(range.to);
  if (Number.isNaN(+a) || Number.isNaN(+b)) throw new ApiError(400, 'Invalid date range');
  if (b < a) throw new ApiError(400, '"From" must be before "to"');
  if ((b - a) / 86400000 > 366) throw new ApiError(400, 'The date range can be at most one year');
}

router.get(
  '/',
  validate(query.omit({ type: true }), 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const data = await buildAnalytics({ workspace: req.params.workspaceId, projectId: q.project, from: q.from, to: q.to, sprintId: q.sprint });
    checkRange(data.range);
    const { _tasks, _cohort, _pname, _nameOf, ...out } = data; // eslint-disable-line no-unused-vars
    res.json(out);
  })
);

router.get(
  '/export',
  validate(query, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const data = await buildAnalytics({ workspace: req.params.workspaceId, projectId: q.project, from: q.from, to: q.to, sprintId: q.sprint });
    checkRange(data.range);
    let columns, rows;
    if (q.type === 'tasks') {
      const users = new Map((await User.find({ _id: { $in: [...new Set(data._cohort.flatMap((t) => [t.assignee, t.reporter]).filter(Boolean).map(String))] } }).select('name')).map((u) => [String(u._id), u.name]));
      columns = ['number', 'title', 'project', 'status', 'priority', 'assignee', 'reporter', 'storyPoints', 'created', 'startDate', 'dueDate', 'completed', 'overdue', 'labels'].map((k) => ({ key: k, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()) }));
      rows = data._cohort.map((t) => ({
        number: t.number, title: t.title, project: data._pname.get(String(t.project)), status: t.status, priority: t.priority,
        assignee: users.get(String(t.assignee)) || '', reporter: users.get(String(t.reporter)) || '', storyPoints: t.storyPoints ?? '',
        created: t.createdAt, startDate: t.startDate, dueDate: t.dueDate, completed: t.completedAt, overdue: t.overdue ? 'yes' : 'no', labels: (t.labels || []).join('; '),
      }));
    } else if (q.type === 'workload') {
      columns = [['name', 'Member'], ['open', 'Open tasks'], ['overdue', 'Overdue'], ['openPoints', 'Open story points'], ['completedInRange', 'Completed in range']].map(([key, label]) => ({ key, label }));
      rows = data.workload;
    } else if (q.type === 'projects') {
      columns = [['name', 'Project'], ['total', 'Tasks'], ['done', 'Done'], ['completion', 'Completion %'], ['overdue', 'Overdue'], ['openPoints', 'Open story points'], ['deadline', 'Deadline']].map(([key, label]) => ({ key, label }));
      rows = data.projects;
    } else if (q.type === 'trends') {
      columns = [['date', 'Date'], ['created', 'Created'], ['completed', 'Completed'], ['open', 'Open at end']].map(([key, label]) => ({ key, label }));
      rows = data.trends;
    } else {
      columns = [['name', 'Sprint'], ['project', 'Project'], ['completedAt', 'Completed on'], ['committed', 'Committed points'], ['completed', 'Completed points'], ['committedCount', 'Committed tasks'], ['completedCount', 'Completed tasks'], ['carriedOver', 'Carried over']].map(([key, label]) => ({ key, label }));
      rows = data.velocity;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="taskjira-${q.type}-${data.range.from}_${data.range.to}.csv"`);
    res.send(toCsv(columns, rows));
  })
);

export default router;
