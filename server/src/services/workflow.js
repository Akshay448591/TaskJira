import { DEFAULT_COLUMNS } from '../constants.js';

// Projects created before custom workflows have no columns stored: fall back to the defaults.
export const columnsOf = (project) =>
  project?.columns?.length ? project.columns.map((c) => (c.toObject ? c.toObject() : c)) : DEFAULT_COLUMNS;

export const doneKeys = (project) => columnsOf(project).filter((c) => c.category === 'done').map((c) => c.key);
export const columnName = (project, key) => columnsOf(project).find((c) => c.key === key)?.name || key;
export const isDone = (project, key) => doneKeys(project).includes(key);
