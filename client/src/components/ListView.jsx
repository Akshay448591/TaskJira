import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { colInfo, fmtDate, isOverdue } from '../lib/constants.js';
import { Alert, Avatar, Badge, Empty, Loading, PriorityTag, StatusTag } from './ui.jsx';
import Icon from './Icon.jsx';

const PAGE_SIZE = 25;

// Sortable, filterable, paginated table. Sorting and page live in the URL.
export default function ListView({ q, projectId, reload, onOpen }) {
  const { workspace } = useWorkspace();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const params = q.apiParams({ project: projectId || q.filters.project || undefined, topLevel: q.filters.q ? undefined : 'true', sort: q.sort, dir: q.dir, page: q.page, limit: PAGE_SIZE });
  const key = JSON.stringify(params);

  useEffect(() => {
    let alive = true;
    api.get(`/workspaces/${workspace._id}/tasks`, { params }).then((r) => alive && (setData(r.data), setError(''))).catch((e) => alive && setError(errMsg(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace._id, key, reload]);

  const sortBy = (field) => q.set({ sort: field, dir: q.sort === field && q.dir === 'asc' ? 'desc' : 'asc' }, { resetPage: true });
  const Th = ({ field, children }) => (
    <th className="px-3 py-2">
      {field ? <button className="inline-flex items-center gap-1 font-medium hover:text-slate-900" onClick={() => sortBy(field)}>{children}{q.sort === field && <Icon name={q.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />}</button> : children}
    </th>
  );

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading variant="list" />;
  if (!data.tasks.length) return <Empty>No tasks match your filters.</Empty>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <tr><Th field="number">#</Th><Th field="title">Title</Th>{!projectId && <Th>Project</Th>}<Th>Status</Th><Th field="priority">Priority</Th><Th>Assignee</Th><Th field="dueDate">Due</Th><Th field="updatedAt">Updated</Th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.tasks.map((t) => {
            const col = colInfo(t.project, t.status);
            return (
              <tr key={t._id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(t._id)}>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{t.number}</td>
                <td className="px-3 py-2">
                  <span className="font-medium">{t.title}</span>
                  {t.parent && <Badge cls="ml-2 bg-slate-100 text-slate-500">subtask</Badge>}
                  {t.subtaskTotal > 0 && <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs text-slate-500"><Icon name="list-checks" size={13} />{t.subtaskDone}/{t.subtaskTotal}</span>}
                  {t.labels.map((l) => <Badge key={l} cls="ml-1 bg-brand-50 text-brand-700">{l}</Badge>)}
                </td>
                {!projectId && <td className="px-3 py-2 text-slate-500">{t.project?.name}</td>}
                <td className="px-3 py-2"><StatusTag col={col} /></td>
                <td className="px-3 py-2"><PriorityTag value={t.priority} /></td>
                <td className="px-3 py-2">{t.assignee ? <div className="flex items-center gap-2"><Avatar user={t.assignee} size={6} />{t.assignee.name}</div> : <span className="text-slate-400">—</span>}</td>
                <td className={`px-3 py-2 ${isOverdue(t.dueDate, col.category === 'done' ? 'done' : '') ? 'font-medium text-red-600' : 'text-slate-500'}`}>{fmtDate(t.dueDate)}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(t.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        <span>{data.total} task{data.total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary !h-7 !px-2" disabled={q.page <= 1} onClick={() => q.set({ page: q.page - 1 }, { resetPage: false })}><Icon name="chevron-left" size={14} />Prev</button>
          <span>Page {data.page} of {data.pages}</span>
          <button className="btn-secondary !h-7 !px-2" disabled={q.page >= data.pages} onClick={() => q.set({ page: q.page + 1 }, { resetPage: false })}>Next<Icon name="chevron-right" size={14} /></button>
        </div>
      </div>
    </div>
  );
}
