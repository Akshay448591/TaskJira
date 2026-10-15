import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { doneKeys } from './workflow.js';
import { notify } from './notify.js';

const DAY = 24 * 60 * 60 * 1000;
const sameDate = (a, b) => a && b && new Date(a).getTime() === new Date(b).getTime();

/**
 * Sends one "due soon" alert (due within ~24h) and one "overdue" alert per due date to the assignee.
 * Due dates are date-only (stored as UTC midnight); a task is due until the end of that UTC day.
 */
export async function runDeadlineCheck(now = new Date()) {
  let sent = 0;
  const projects = await Project.find({ archived: false }).select('workspace name columns');
  for (const p of projects) {
    const tasks = await Task.find({
      project: p._id,
      status: { $nin: doneKeys(p) },
      assignee: { $ne: null },
      dueDate: { $ne: null, $lte: new Date(now.getTime() + DAY), $gte: new Date(now.getTime() - 7 * DAY) },
    });
    for (const t of tasks) {
      const overdue = t.dueDate.getTime() + DAY <= now.getTime();
      const flag = overdue ? 'overdueNotifiedFor' : 'dueSoonNotifiedFor';
      if (sameDate(t[flag], t.dueDate)) continue;
      const day = t.dueDate.toISOString().slice(0, 10);
      const today = new Date(now).toISOString().slice(0, 10);
      const when = day === today ? 'today' : day < today ? `(was due ${day})` : 'tomorrow';
      const message = overdue ? `“${t.title}” is overdue ${when}` : `“${t.title}” is due ${when}`;
      await Task.updateOne({ _id: t._id }, { $set: { [flag]: t.dueDate } });
      await notify({ workspace: t.workspace, project: t.project, task: t._id, type: 'due_soon', recipients: [t.assignee], message });
      sent++;
    }
  }
  return sent;
}

export function startScheduler() {
  const run = () => runDeadlineCheck().catch((e) => console.error('deadline check failed:', e.message));
  setTimeout(run, 30 * 1000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}
