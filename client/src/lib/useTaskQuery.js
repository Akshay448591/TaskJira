import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dueParams } from './constants.js';

// All list/board/calendar state lives in the URL, so every view is shareable and survives refresh.
export const FILTER_KEYS = ['q', 'status', 'priority', 'assignee', 'label', 'due', 'project'];
export const SAVED_KEYS = [...FILTER_KEYS, 'sort', 'dir'];

export function useTaskQuery({ defaultView = 'list' } = {}) {
  const [sp, setSp] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) || '']));
  const sort = sp.get('sort') || 'createdAt';
  const dir = sp.get('dir') || 'desc';
  const view = sp.get('view') || defaultView;
  const page = Math.max(1, Number(sp.get('page')) || 1);

  const set = useCallback(
    (patch, { resetPage = true, replace = true } = {}) =>
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) (v === '' || v == null ? n.delete(k) : n.set(k, String(v)));
          if (resetPage && !('page' in patch)) n.delete('page');
          return n;
        },
        { replace }
      ),
    [setSp]
  );

  // translate the URL filters into API parameters
  const apiParams = (extra = {}) => {
    const p = {};
    if (filters.q) p.search = filters.q;
    for (const k of ['status', 'priority', 'assignee', 'label', 'project']) if (filters[k]) p[k] = filters[k];
    return { ...p, ...dueParams(filters.due), ...extra };
  };
  const activeCount = FILTER_KEYS.filter((k) => filters[k]).length;
  const clear = () => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])));
  return { sp, filters, sort, dir, view, page, set, apiParams, activeCount, clear };
}
