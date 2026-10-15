import { Sprint } from '../models/Sprint.js';

export const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const DAY = 24 * 60 * 60 * 1000;

export async function logSprint(sprintId, entries) {
  if (!entries.length) return;
  await Sprint.updateOne({ _id: sprintId }, { $push: { log: { $each: entries } } });
}

/**
 * Called whenever a task changes sprint, story points or done-state. Only ACTIVE sprints keep a log
 * (planned sprints have no burndown yet; completed sprints are frozen).
 */
export async function logSprintTransition(before, after, taskId) {
  const sameSprint = String(before.sprint || '') === String(after.sprint || '');
  const now = new Date();
  const e = (type, points, count) => ({ at: now, type, points, count, task: taskId });
  const plan = new Map();
  const add = (sid, entry) => plan.set(String(sid), [...(plan.get(String(sid)) || []), entry]);

  if (before.sprint && !sameSprint) {
    add(before.sprint, e('scope', -before.points, -1));
    if (before.done) add(before.sprint, e('done', -before.points, -1));
  }
  if (after.sprint && !sameSprint) {
    add(after.sprint, e('scope', after.points, 1));
    if (after.done) add(after.sprint, e('done', after.points, 1));
  }
  if (sameSprint && after.sprint) {
    if (after.points !== before.points) add(after.sprint, e('scope', after.points - before.points, 0));
    if (!before.done && after.done) add(after.sprint, e('done', after.points, 1));
    else if (before.done && !after.done) add(after.sprint, e('done', -before.points, -1));
    else if (before.done && after.done && after.points !== before.points) add(after.sprint, e('done', after.points - before.points, 0));
  }
  if (!plan.size) return;
  const active = await Sprint.find({ _id: { $in: [...plan.keys()] }, status: 'active' }).select('_id');
  for (const s of active) await logSprint(s._id, plan.get(String(s._id)));
}

/** Burndown series rebuilt from the sprint log. metric: 'points' | 'tasks' */
export function burndown(sprint, metric = 'points', now = new Date()) {
  const field = metric === 'tasks' ? 'count' : 'points';
  if (!sprint.startedAt) return { metric, committed: 0, remaining: null, days: [], started: false };
  const log = sprint.log || [];
  const sumAt = (type, cutoff) => log.filter((l) => l.type === type && new Date(l.at) < cutoff).reduce((s, l) => s + (l[field] || 0), 0);
  const startedAt = new Date(sprint.startedAt);
  const committed = log.filter((l) => l.type === 'scope' && new Date(l.at) <= startedAt).reduce((s, l) => s + (l[field] || 0), 0);
  const cap = sprint.completedAt ? new Date(sprint.completedAt) : now;

  const first = new Date(`${dayKey(sprint.startDate)}T00:00:00Z`);
  const last = new Date(`${dayKey(sprint.endDate)}T00:00:00Z`);
  const n = Math.max(1, Math.round((last - first) / DAY));
  const days = [];
  for (let i = 0; i <= n; i++) {
    const start = new Date(first.getTime() + i * DAY);
    const end = new Date(start.getTime() + DAY);
    const ideal = n === 0 ? 0 : Math.max(0, +(committed * (1 - i / n)).toFixed(2));
    let actual = null;
    if (start <= cap && end > startedAt) {
      const cutoff = end < cap ? end : new Date(cap.getTime() + 1);
      actual = Math.max(0, sumAt('scope', cutoff) - sumAt('done', cutoff));
    }
    days.push({ date: dayKey(start), ideal, actual });
  }
  const remaining = Math.max(0, sumAt('scope', new Date(cap.getTime() + 1)) - sumAt('done', new Date(cap.getTime() + 1)));
  return { metric, committed, remaining, scope: sumAt('scope', new Date(cap.getTime() + 1)), days, started: true };
}

/** Progress numbers for a sprint from its current tasks. */
export function progressOf(tasks, doneOf) {
  const out = { taskCount: tasks.length, doneCount: 0, points: 0, donePoints: 0 };
  for (const t of tasks) {
    out.points += t.storyPoints || 0;
    if (doneOf(t)) { out.doneCount++; out.donePoints += t.storyPoints || 0; }
  }
  out.percent = out.points ? Math.round((out.donePoints / out.points) * 100) : out.taskCount ? Math.round((out.doneCount / out.taskCount) * 100) : 0;
  return out;
}
