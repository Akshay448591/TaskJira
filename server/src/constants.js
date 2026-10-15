export const ROLES = ['owner', 'admin', 'member', 'viewer'];
export const RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed'];

// Workflow columns. "category" drives completion % and "done" logic; keys are stable ids.
export const COLUMN_CATEGORIES = ['todo', 'in_progress', 'done'];
export const COLUMN_COLORS = ['slate', 'blue', 'amber', 'green', 'purple', 'red', 'pink', 'teal'];
export const DEFAULT_COLUMNS = [
  { key: 'todo', name: 'To do', color: 'slate', category: 'todo' },
  { key: 'in_progress', name: 'In progress', color: 'blue', category: 'in_progress' },
  { key: 'in_review', name: 'In review', color: 'amber', category: 'in_progress' },
  { key: 'done', name: 'Done', color: 'green', category: 'done' },
];

export const NOTIFICATION_TYPES = ['assigned', 'mentioned', 'comment', 'status_changed', 'due_soon'];
export const NOTIFICATION_DEFAULTS = {
  assigned: { inApp: true, email: true },
  mentioned: { inApp: true, email: true },
  comment: { inApp: true, email: false },
  status_changed: { inApp: true, email: false },
  due_soon: { inApp: true, email: true },
};
