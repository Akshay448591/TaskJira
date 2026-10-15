import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Sprint } from '../models/Sprint.js';
import { Membership } from '../models/Membership.js';
import { doneKeys } from './workflow.js';
import { burndown } from './sprints.js';

const DAY = 24 * 60 * 60 * 1000;
const key = (d) => new Date(d).toISOString().slice(0, 10);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
export const todayKey = () => key(new Date());

export function parseRange(from, to) {
  const end = to || todayKey();
  const start = from || key(new Date(new Date(`${end}T00:00:00Z`).getTime() - 29 * DAY));
  return { from: start, to: end };
}

/**
 * All numbers are computed in JS from lean task documents (done-ness depends on each project's own workflow columns).
 *  - "cohort" = tasks CREATED in the range  -> completion / overdue / on-time rates
 *  - "events" = things that HAPPENED in the range -> created/completed trend, velocity
 *  - "snapshot" = state right now -> workload, project progress
 */
export async function buildAnalytics({ workspace, projectId, from, to, sprintId }) {
  const range = parseRange(from, to);
  const rangeStart = new Date(`${range.from}T00:00:00Z`);
  const rangeEnd = new Date(new Date(`${range.to}T00:00:00Z`).getTime() + DAY); // exclusive
  const projects = await Project.find({ workspace, ...(projectId ? { _id: projectId } : {}) }).select('name columns archived deadline');
  const projectIds = projects.map((p) => p._id);
  const doneSets = new Map(projects.map((p) => [String(p._id), new Set(doneKeys(p))]));
  const raw = await Task.find({ workspace, parent: null, project: { $in: projectIds } })
    .select('number title project status priority assignee reporter dueDate startDate createdAt completedAt updatedAt storyPoints sprint labels')
    .lean();
  const today = new Date(`${todayKey()}T00:00:00Z`);

  const tasks = raw.map((t) => {
    const done = doneSets.get(String(t.project)).has(t.status);
    const completedAt = done ? t.completedAt || t.updatedAt : null;
    const overdue = !done && !!t.dueDate && t.dueDate < today;
    return { ...t, done, completedAt, overdue };
  });
  const inRange = (d) => d && d >= rangeStart && d < rangeEnd;

  // ----- cohort KPIs -----
  const cohort = tasks.filter((t) => inRange(t.createdAt));
  const cohortDone = cohort.filter((t) => t.done);
  const withDue = cohortDone.filter((t) => t.dueDate);
  const onTime = withDue.filter((t) => t.completedAt < new Date(t.dueDate.getTime() + DAY));
  const kpis = {
    created: cohort.length,
    completed: cohortDone.length,
    completionRate: pct(cohortDone.length, cohort.length),
    overdue: cohort.filter((t) => t.overdue).length,
    overdueRate: pct(cohort.filter((t) => t.overdue).length, cohort.length),
    onTimeRate: pct(onTime.length, withDue.length),
    completedInRange: tasks.filter((t) => inRange(t.completedAt)).length, // regardless of when created
    openNow: tasks.filter((t) => !t.done).length,
    overdueNow: tasks.filter((t) => t.overdue).length,
  };

  // ----- workload (snapshot of open work + what each person finished in range) -----
  const members = await Membership.find({ workspace }).populate('user', 'name email');
  const nameOf = new Map(members.filter((m) => m.user).map((m) => [String(m.user._id), m.user.name]));
  const load = new Map();
  const row = (id) => {
    if (!load.has(id)) load.set(id, { userId: id === 'none' ? null : id, name: id === 'none' ? 'Unassigned' : nameOf.get(id) || 'Former member', open: 0, overdue: 0, openPoints: 0, completedInRange: 0 });
    return load.get(id);
  };
  for (const t of tasks) {
    const r = row(t.assignee ? String(t.assignee) : 'none');
    if (!t.done) { r.open++; r.openPoints += t.storyPoints || 0; if (t.overdue) r.overdue++; }
    if (inRange(t.completedAt)) r.completedInRange++;
  }
  const workload = [...load.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  // ----- project progress (snapshot) -----
  const projectsOut = projects.map((p) => {
    const mine = tasks.filter((t) => String(t.project) === String(p._id));
    const done = mine.filter((t) => t.done).length;
    return {
      projectId: String(p._id), name: p.name, archived: p.archived, deadline: p.deadline, total: mine.length, done,
      completion: pct(done, mine.length), overdue: mine.filter((t) => t.overdue).length,
      openPoints: mine.filter((t) => !t.done).reduce((s, t) => s + (t.storyPoints || 0), 0),
    };
  });

  // ----- trends: daily buckets up to 92 days, else weekly -----
  const days = Math.round((rangeEnd - rangeStart) / DAY);
  const step = days > 92 ? 7 : 1;
  const trends = [];
  for (let i = 0; i < days; i += step) {
    const s = new Date(rangeStart.getTime() + i * DAY);
    const e = new Date(Math.min(rangeEnd.getTime(), s.getTime() + step * DAY));
    trends.push({
      date: key(s),
      created: tasks.filter((t) => t.createdAt >= s && t.createdAt < e).length,
      completed: tasks.filter((t) => t.completedAt && t.completedAt >= s && t.completedAt < e).length,
      open: tasks.filter((t) => t.createdAt < e && (!t.completedAt || t.completedAt >= e)).length,
    });
  }

  // ----- sprints: velocity + burndown -----
  const allSprints = await Sprint.find({ workspace, project: { $in: projectIds } }).select('-log').sort('startDate');
  const pname = new Map(projects.map((p) => [String(p._id), p.name]));
  const velocity = allSprints
    .filter((s) => s.status === 'completed' && inRange(s.completedAt))
    .map((s) => ({ sprintId: String(s._id), name: s.name, project: pname.get(String(s.project)), completedAt: s.completedAt, committed: s.committedPoints, completed: s.completedPoints, committedCount: s.committedCount, completedCount: s.completedCount, carriedOver: s.carriedOver }));
  const averageVelocity = velocity.length ? Math.round((velocity.reduce((a, v) => a + v.completed, 0) / velocity.length) * 10) / 10 : 0;

  let burn = null;
  let burnSprint = null;
  if (projectId) {
    const pick = sprintId ? allSprints.find((s) => String(s._id) === sprintId) : allSprints.find((s) => s.status === 'active') || [...allSprints].reverse().find((s) => s.status === 'completed');
    if (pick) {
      const full = await Sprint.findById(pick._id);
      burnSprint = { _id: String(pick._id), name: pick.name, status: pick.status, startDate: pick.startDate, endDate: pick.endDate, goal: pick.goal };
      burn = burndown(full, 'points');
      burn.tasks = burndown(full, 'tasks');
    }
  }

  return {
    range, projectId: projectId || null, kpis, workload, projects: projectsOut, trends, velocity, averageVelocity,
    sprints: allSprints.map((s) => ({ _id: String(s._id), name: s.name, status: s.status })), burnSprint, burndown: burn,
    _tasks: tasks, _cohort: cohort, _pname: pname, _nameOf: nameOf,
  };
}
