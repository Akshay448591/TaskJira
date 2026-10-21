import { describe, it, expect } from 'vitest';
import {
  columnsOf,
  colInfo,
  isDoneStatus,
  doneKey,
  openKey,
  atLeast,
  fmtDate,
  toInputDate,
  DEFAULT_COLUMNS,
} from '../lib/constants.js';

describe('Client Constants and Helpers', () => {
  it('columnsOf returns DEFAULT_COLUMNS when project is null or undefined', () => {
    expect(columnsOf(null)).toEqual(DEFAULT_COLUMNS);
    expect(columnsOf({})).toEqual(DEFAULT_COLUMNS);
  });

  it('columnsOf returns custom columns when provided on project', () => {
    const custom = [{ key: 'backlog', name: 'Backlog', category: 'todo', color: 'slate' }];
    expect(columnsOf({ columns: custom })).toEqual(custom);
  });

  it('colInfo retrieves column metadata and styling classes', () => {
    const info = colInfo(null, 'in_progress');
    expect(info.name).toBe('In progress');
    expect(info.category).toBe('in_progress');
    expect(info.color).toBe('blue');
  });

  it('isDoneStatus accurately flags done category columns', () => {
    expect(isDoneStatus(null, 'done')).toBe(true);
    expect(isDoneStatus(null, 'todo')).toBe(false);
    expect(isDoneStatus(null, 'in_progress')).toBe(false);
  });

  it('doneKey and openKey resolve correct column keys', () => {
    expect(doneKey(null)).toBe('done');
    expect(openKey(null)).toBe('todo');
  });

  it('atLeast checks hierarchical role ranking accurately', () => {
    expect(atLeast('owner', 'viewer')).toBe(true);
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('admin', 'member')).toBe(true);
    expect(atLeast('member', 'admin')).toBe(false);
    expect(atLeast('viewer', 'member')).toBe(false);
  });

  it('fmtDate formats UTC dates correctly or returns dash for null', () => {
    expect(fmtDate(null)).toBe('—');
    const formatted = fmtDate('2026-10-21T00:00:00.000Z');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('21');
  });

  it('toInputDate converts ISO strings to YYYY-MM-DD format', () => {
    expect(toInputDate(null)).toBe('');
    expect(toInputDate('2026-10-21T12:30:00.000Z')).toBe('2026-10-21');
  });
});
