import { useEffect, useMemo, useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { atLeast, colInfo, todayKey } from '../lib/constants.js';
import Icon from './Icon.jsx';
import { Alert, Spinner } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Month calendar of due dates. Drag a task onto another day to change its deadline.
export default function CalendarView({ q, projectId, projectArchived, reload, onOpen }) {
  const { workspace, role } = useWorkspace();
  const base = `/workspaces/${workspace._id}/tasks`;
  const canEdit = atLeast(role, 'member') && !projectArchived;
  const now = new Date();
  const month = q.sp.get('m') || `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, mo] = month.split('-').map(Number);

  const days = useMemo(() => {
    const startDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
    return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, mo - 1, 1 - startDow + i)));
  }, [y, mo]);

  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);

  const params = q.apiParams({
    project: projectId || q.filters.project || undefined,
    dueFrom: days[0].toISOString(), dueTo: new Date(days[41].getTime() + 86400000).toISOString(),
    noDue: undefined, notDone: undefined, sort: 'dueDate', dir: 'asc', limit: 300,
  });
  const key = JSON.stringify(params);
  useEffect(() => {
    let alive = true;
    api.get(base, { params }).then((r) => alive && (setTasks(r.data.tasks), setError(''))).catch((e) => alive && setError(errMsg(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, key, reload]);

  const byDay = useMemo(() => {
    const m = {};
    for (const t of tasks || []) (m[t.dueDate.slice(0, 10)] ||= []).push(t);
    return m;
  }, [tasks]);

  const go = (delta) => { const d = new Date(Date.UTC(y, mo - 1 + delta, 1)); q.set({ m: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}` }, { resetPage: false }); };
  const today = todayKey();

  async function reschedule(id, dayKey) {
    const task = tasks.find((t) => t._id === id);
    if (!task || task.dueDate.slice(0, 10) === dayKey) return;
    const prev = task.dueDate;
    setTasks((cur) => cur.map((t) => (t._id === id ? { ...t, dueDate: `${dayKey}T00:00:00.000Z` } : t))); // optimistic
    try { await api.patch(`${base}/${id}`, { dueDate: dayKey }); setError(''); }
    catch (e) { setTasks((cur) => cur.map((t) => (t._id === id ? { ...t, dueDate: prev } : t))); setError(`Could not change the deadline - reverted. ${errMsg(e)}`); }
  }

  if (!tasks) return error ? <Alert>{error}</Alert> : <Spinner />;
  return (
    <div className="space-y-2">
      <Alert>{error}</Alert>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">{new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
        <div className="flex gap-2"><button className="btn-secondary" onClick={() => go(-1)} aria-label="Previous month"><Icon name="chevron-left" size={16} /></button><button className="btn-secondary" onClick={() => q.set({ m: '' }, { resetPage: false })}>Today</button><button className="btn-secondary" onClick={() => go(1)} aria-label="Next month"><Icon name="chevron-right" size={16} /></button></div>
      </div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium uppercase text-slate-500">{DOW.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = d.toISOString().slice(0, 10);
            const inMonth = d.getUTCMonth() === mo - 1;
            return (
              <div
                key={k}
                onDragOver={(e) => { if (dragId && canEdit) { e.preventDefault(); setOverDay(k); } }}
                onDrop={(e) => { e.preventDefault(); const id = dragId || e.dataTransfer.getData('text/plain'); if (id) reschedule(id, k); setDragId(null); setOverDay(null); }}
                className={`min-h-[108px] border-b border-r border-slate-100 p-1 ${inMonth ? 'bg-white' : 'bg-slate-50/70'} ${overDay === k ? 'bg-brand-50' : ''}`}
              >
                <div className={`mb-1 text-right text-xs ${k === today ? 'inline-block rounded-full bg-brand-600 px-1.5 font-medium text-white' : inMonth ? 'text-slate-500' : 'text-slate-300'}`}>{d.getUTCDate()}</div>
                <div className="max-h-24 space-y-1 overflow-y-auto">
                  {(byDay[k] || []).map((t) => {
                    const col = colInfo(t.project, t.status);
                    const late = k < today && col.category !== 'done';
                    return (
                      <button
                        key={t._id} draggable={canEdit} title={`${t.title} · ${col.name}`}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t._id); setDragId(t._id); }}
                        onDragEnd={() => { setDragId(null); setOverDay(null); }}
                        onClick={() => onOpen(t._id)}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs ${col.cls} ${late ? 'ring-1 ring-red-400' : ''} ${col.category === 'done' ? 'line-through opacity-70' : ''}`}
                      >#{t.number} {t.title}</button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-400">Colors follow each task's workflow status; a red outline means overdue. {canEdit ? 'Drag a task onto another day to change its due date.' : ''}</p>
    </div>
  );
}
