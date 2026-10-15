// Static class names (Tailwind needs to see full strings) for workflow column colors.
export const COLORS = {
  slate: { badge: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400', top: 'border-t-slate-400', dot: 'bg-slate-400', hollow: true },
  blue: { badge: 'bg-blue-50 text-blue-800', bar: 'bg-blue-500', top: 'border-t-blue-500', dot: 'bg-blue-500' },
  amber: { badge: 'bg-amber-50 text-amber-800', bar: 'bg-amber-500', top: 'border-t-amber-500', dot: 'bg-amber-500' },
  green: { badge: 'bg-green-50 text-green-800', bar: 'bg-green-500', top: 'border-t-green-500', dot: 'bg-green-600' },
  purple: { badge: 'bg-purple-50 text-purple-800', bar: 'bg-purple-500', top: 'border-t-purple-500', dot: 'bg-purple-500' },
  red: { badge: 'bg-red-50 text-red-800', bar: 'bg-red-500', top: 'border-t-red-500', dot: 'bg-red-600' },
  pink: { badge: 'bg-pink-50 text-pink-800', bar: 'bg-pink-500', top: 'border-t-pink-500', dot: 'bg-pink-500' },
  teal: { badge: 'bg-teal-50 text-teal-800', bar: 'bg-teal-500', top: 'border-t-teal-500', dot: 'bg-teal-500' },
};
export const COLOR_NAMES = ['slate', 'blue', 'amber', 'green', 'purple', 'red'];
export const CATEGORIES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];
export const DEFAULT_COLUMNS = [
  { key: 'todo', name: 'To do', color: 'slate', category: 'todo' },
  { key: 'in_progress', name: 'In progress', color: 'blue', category: 'in_progress' },
  { key: 'in_review', name: 'In review', color: 'amber', category: 'in_progress' },
  { key: 'done', name: 'Done', color: 'green', category: 'done' },
];

// project may be a populated project object (with columns) or undefined -> defaults
export const columnsOf = (project) => (project?.columns?.length ? project.columns : DEFAULT_COLUMNS);
export const colInfo = (project, key) => {
  const c = columnsOf(project).find((x) => x.key === key);
  const color = c?.color || 'slate';
  return { key, name: c?.name || key, color, category: c?.category || 'todo', cls: COLORS[color]?.badge || COLORS.slate.badge, dot: COLORS[color]?.dot || COLORS.slate.dot, hollow: !!(COLORS[color] || COLORS.slate).hollow, c: COLORS[color] || COLORS.slate };
};
export const isDoneStatus = (project, key) => colInfo(project, key).category === 'done';
export const doneKey = (project) => columnsOf(project).find((c) => c.category === 'done')?.key;
export const openKey = (project) => columnsOf(project).find((c) => c.category !== 'done')?.key;

export const PRIORITIES = [
  { value: 'low', label: 'Low', level: 1, cls: 'text-slate-500' },
  { value: 'medium', label: 'Medium', level: 2, cls: 'text-slate-600' },
  { value: 'high', label: 'High', level: 3, cls: 'text-slate-800' },
  { value: 'urgent', label: 'Urgent', level: 4, cls: 'text-red-600' },
];
export const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning', cls: 'text-slate-700', dot: 'bg-slate-400', hollow: true },
  { value: 'active', label: 'Active', cls: 'text-slate-700', dot: 'bg-green-600' },
  { value: 'on_hold', label: 'On hold', cls: 'text-slate-700', dot: 'bg-amber-500' },
  { value: 'completed', label: 'Completed', cls: 'text-slate-700', dot: 'bg-brand-600' },
];
export const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
export const atLeast = (role, min) => (ROLE_RANK[role] || 0) >= ROLE_RANK[min];
export const lookup = (list, value) => list.find((x) => x.value === value) || { label: value, cls: 'text-slate-600', dot: 'bg-slate-400', level: 1 };

// ---- dates ----
// Due dates are date-only values stored as UTC midnight, so they are always displayed/compared in UTC.
const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const fmtDateTime = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const todayKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; // the user's local "today"
};
export const isOverdue = (d, status) => !!d && status !== 'done' && toInputDate(d) < todayKey();
export const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const timeAgo = (d) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return fmtDateTime(d);
};

// Relative due-date presets are resolved at request time so saved views like "Next 7 days" stay relative.
export const DUE_OPTIONS = [
  { value: '', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'none', label: 'No due date' },
];
export function dueParams(due) {
  const n = new Date();
  const [y, m, d] = [n.getFullYear(), n.getMonth(), n.getDate()];
  const utc = (dd) => new Date(Date.UTC(y, m, dd)).toISOString();
  if (due === 'overdue') return { dueTo: utc(d), notDone: 'true' };
  if (due === 'today') return { dueFrom: utc(d), dueTo: utc(d + 1) };
  if (due === 'week') return { dueFrom: utc(d), dueTo: utc(d + 8) };
  if (due === 'none') return { noDue: 'true' };
  return {};
}

// ---- notifications / activity ----
export const NOTIFICATION_TYPES = [
  { value: 'assigned', label: 'Assigned to me', icon: 'user' },
  { value: 'mentioned', label: 'Mentions of me', icon: 'at-sign' },
  { value: 'comment', label: 'Comments on my tasks', icon: 'message-square' },
  { value: 'status_changed', label: 'Status changes on my tasks', icon: 'arrow-left-right' },
  { value: 'due_soon', label: 'Approaching deadlines', icon: 'clock' },
];
// returns an icon name for <Icon name={...} />
export const notifIcon = (t) => NOTIFICATION_TYPES.find((x) => x.value === t)?.icon || 'bell';

const FIELD = { title: 'title', status: 'status', priority: 'priority', assignee: 'assignee', dueDate: 'due date', startDate: 'start date', storyPoints: 'story points', sprint: 'sprint', labels: 'labels' };
const pv = (field, v) => (field === 'priority' ? lookup(PRIORITIES, v).label : v);
export const activityText = (a) =>
  a.field && a.from !== undefined && a.from !== null ? `changed ${FIELD[a.field] || a.field} from “${pv(a.field, a.from)}” to “${pv(a.field, a.to)}”` : a.text || a.action;

export const handleOf = (email) => (email || '').split('@')[0].toLowerCase();
