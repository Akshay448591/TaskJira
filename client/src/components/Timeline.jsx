import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { atLeast, colInfo, fmtDate, todayKey, toInputDate } from '../lib/constants.js';
import { useDebouncedCallback, useSocketEvent } from '../lib/realtime.js';
import { Alert, Avatar, Field, Modal, Spinner } from './ui.jsx';

const DAY = 86400000;
const LEFT = 250; // width of the sticky task-name column
const ROW = 34;
const HEAD = 56;
const ZOOMS = [{ id: 'day', label: 'Days', w: 44 }, { id: 'week', label: 'Weeks', w: 22 }, { id: 'month', label: 'Months', w: 9 }];
const idx = (d) => Math.floor(new Date(d).getTime() / DAY); // UTC day number (due dates are stored as UTC midnight)

// Gantt-style timeline: task bars (start -> due), milestones, project deadline, dependency arrows,
// scheduling conflicts and dependency cycles. Drag a bar sideways to reschedule it.
export default function Timeline({ project, onOpen, onChanged }) {
  const { workspace, role } = useWorkspace();
  const base = `/workspaces/${workspace._id}/projects/${project._id}`;
  const canEdit = atLeast(role, 'member') && !project.archived;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState([]);
  const [zoom, setZoom] = useState('week');
  const [ms, setMs] = useState(null); // milestone being edited / created
  const [drag, setDrag] = useState(null); // { id, x0, dx }
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const scroller = useRef();
  const dayW = ZOOMS.find((z) => z.id === zoom).w;

  const load = useCallback(async () => {
    try { setData((await api.get(`${base}/timeline`)).data); setError(''); } catch (e) { setError(errMsg(e)); }
  }, [base]);
  useEffect(() => { load(); }, [load]);
  const live = useDebouncedCallback(load, 500);
  useSocketEvent('task:changed', (e) => e.projectId === project._id && live());
  useSocketEvent('project:changed', (e) => e.projectId === project._id && live());

  const model = useMemo(() => {
    if (!data) return null;
    const today = idx(`${todayKey()}T00:00:00Z`);
    const scheduled = [];
    const unscheduled = [];
    for (const t of data.tasks) {
      if (!t.startDate && !t.dueDate) { unscheduled.push(t); continue; }
      let s = idx(t.startDate || t.dueDate);
      let e = idx(t.dueDate || t.startDate);
      if (e < s) [s, e] = [e, s];
      scheduled.push({ ...t, s, e, dueOnly: !t.startDate });
    }
    scheduled.sort((a, b) => a.s - b.s || a.e - b.e);
    const points = [today, ...scheduled.flatMap((t) => [t.s, t.e]), ...data.milestones.map((m) => idx(m.date))];
    if (data.project.deadline) points.push(idx(data.project.deadline));
    const min = Math.min(...points) - 3;
    const max = Math.max(...points, min + 30) + 10;
    return { today, scheduled, unscheduled, min, max, days: max - min + 1 };
  }, [data]);

  useEffect(() => { if (model && scroller.current) scroller.current.scrollLeft = Math.max(0, (model.today - model.min) * dayW - 160); }, [!!model, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- drag a bar to reschedule (optimistic, rolled back on failure) -----
  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => setDrag((d) => d && { ...d, dx: e.clientX - d.x0 });
    const up = async () => {
      const d = drag;
      setDrag(null);
      const task = data.tasks.find((t) => t._id === d.id);
      const days = Math.round(d.dx / dayW);
      if (Math.abs(d.dx) < 4) { onOpen(d.id); return; }
      if (!days || !task) return;
      const shift = (v) => (v ? new Date(new Date(v).getTime() + days * DAY).toISOString() : null);
      const body = { startDate: shift(task.startDate)?.slice(0, 10) ?? null, dueDate: shift(task.dueDate)?.slice(0, 10) ?? null };
      const prev = { startDate: task.startDate, dueDate: task.dueDate };
      setData((cur) => ({ ...cur, tasks: cur.tasks.map((t) => (t._id === d.id ? { ...t, startDate: shift(task.startDate), dueDate: shift(task.dueDate) } : t)) }));
      try {
        const { data: r } = await api.patch(`/workspaces/${workspace._id}/tasks/${d.id}`, body);
        setWarn(r.warnings || []); setError(''); load(); onChanged?.();
      } catch (e) {
        setData((cur) => ({ ...cur, tasks: cur.tasks.map((t) => (t._id === d.id ? { ...t, ...prev } : t)) }));
        setError(`Could not reschedule - it was put back. ${errMsg(e)}`);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [drag, data, dayW]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !model) return error ? <Alert>{error}</Alert> : <Spinner />;
  const { scheduled, unscheduled, min, days } = model;
  const chartW = days * dayW;
  const x = (d) => (d - min) * dayW;
  const rowIndex = new Map(scheduled.map((t, i) => [t._id, i]));
  const byId = new Map(data.tasks.map((t) => [t._id, t]));
  const conflictBlocked = new Set(data.conflicts.filter((c) => c.severity === 'error').map((c) => c.blocked));
  const conflictPairs = new Set(data.conflicts.filter((c) => c.severity === 'error').map((c) => `${c.blocker}>${c.blocked}`));
  const cycleEdges = new Set(data.cycles.flatMap((c) => c.map((id, i) => `${id}>${c[(i + 1) % c.length]}`)));
  const height = HEAD + ROW * (scheduled.length + 1);
  const tName = (id) => { const t = byId.get(id); return t ? `#${t.number} ${t.title}` : id; };

  // header: months + days
  const months = [];
  for (let d = min; d < min + days; d++) {
    const dt = new Date(d * DAY);
    const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, label: dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }), start: d, n: 0 });
    months[months.length - 1].n++;
  }

  const arrow = (l) => {
    const a = rowIndex.get(l.from), b = rowIndex.get(l.to);
    if (a === undefined || b === undefined) return null;
    const A = scheduled[a], B = scheduled[b];
    const x1 = x(A.e + 1), y1 = HEAD + ROW + a * ROW + ROW / 2;
    const x2 = x(B.s), y2 = HEAD + ROW + b * ROW + ROW / 2;
    const bad = conflictPairs.has(`${l.from}>${l.to}`) || cycleEdges.has(`${l.from}>${l.to}`);
    const ym = y1 + (y2 >= y1 ? ROW / 2 : -ROW / 2);
    const pts = x2 >= x1 + 12 ? [[x1, y1], [x1 + 8, y1], [x1 + 8, y2], [x2, y2]] : [[x1, y1], [x1 + 8, y1], [x1 + 8, ym], [x2 - 8, ym], [x2 - 8, y2], [x2, y2]];
    return <polyline key={l._id} fill="none" stroke={bad ? '#97392B' : '#6B665E'} strokeWidth="1.5" strokeDasharray={cycleEdges.has(`${l.from}>${l.to}`) ? '4 3' : undefined} markerEnd={bad ? 'url(#arrow-bad)' : 'url(#arrow)'} points={pts.map((p) => p.join(',')).join(' ')} />;
  };

  return (
    <div className="space-y-3">
      <Alert>{error}</Alert>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5">{ZOOMS.map((z) => <button key={z.id} onClick={() => setZoom(z.id)} className={`rounded px-3 py-1 text-sm ${zoom === z.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{z.label}</button>)}</div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, (model.today - min) * dayW - 160))}>Today</button>
          {canEdit && <button className="btn-secondary" onClick={() => setMs({ name: '', date: todayKey(), description: '', completed: false })}><Icon name="plus" size={14} />Milestone</button>}
        </div>
      </div>

      {warn.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"><b>Scheduling conflict after that change:</b><ul className="ml-4 list-disc">{warn.map((w) => <li key={w}>{w}</li>)}</ul></div>}
      {(data.conflicts.length > 0 || data.cycles.length > 0) && (
        <div className="card space-y-2 border-red-200 p-4 text-sm">
          <b className="text-red-700">Schedule issues ({data.conflicts.length + data.cycles.length})</b>
          {data.cycles.map((c, i) => <div key={i} className="rounded bg-red-50 px-2 py-1 text-red-700"><Icon name="refresh-cw" size={13} className="mr-1.5 inline" />Dependency cycle: {[...c, c[0]].map(tName).join(' → ')}</div>)}
          {data.conflicts.map((c, i) => <button key={i} onClick={() => onOpen(c.blocked)} className={`block w-full rounded px-2 py-1 text-left ${c.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}><Icon name="triangle-alert" size={13} className="mr-1.5 inline" />{c.message}</button>)}
        </div>
      )}

      {scheduled.length === 0 && data.milestones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No scheduled tasks yet. Give tasks a start date and a due date (in the task details) and they appear here.</div>
      ) : (
        <div ref={scroller} className="card overflow-x-auto" style={{ cursor: drag ? 'grabbing' : 'default' }}>
          <div className="relative" style={{ width: LEFT + chartW, height }}>
            {/* header */}
            <div className="sticky left-0 top-0 z-20 flex border-b border-slate-200 bg-slate-50" style={{ height: HEAD, width: LEFT + chartW }}>
              <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-slate-200 bg-slate-50 px-3 pb-2 text-xs font-medium text-slate-500" style={{ width: LEFT }}>Task</div>
              <div className="relative" style={{ width: chartW }}>
                {months.map((m) => <div key={m.key} className="absolute top-0 border-l border-slate-200 px-2 text-xs font-medium text-slate-600" style={{ left: x(m.start), width: m.n * dayW, height: 28, lineHeight: '28px' }}>{m.label}</div>)}
                {Array.from({ length: days }, (_, i) => {
                  const d = min + i; const dt = new Date(d * DAY);
                  const show = dayW >= 22 || dt.getUTCDay() === 1;
                  return show ? <div key={d} className={`absolute text-center text-[10px] ${d === model.today ? 'font-medium text-brand-600' : 'text-slate-400'}`} style={{ left: x(d), width: dayW, top: 32 }}>{dt.getUTCDate()}</div> : null;
                })}
              </div>
            </div>

            {/* vertical guides: today, project deadline, milestones */}
            <div className="pointer-events-none absolute" style={{ left: LEFT, top: HEAD, width: chartW, height: height - HEAD }}>
              {Array.from({ length: days }, (_, i) => { const d = min + i; const wk = new Date(d * DAY).getUTCDay(); return wk === 0 || wk === 6 ? <div key={d} className="absolute top-0 bg-slate-50" style={{ left: x(d), width: dayW, height: '100%' }} /> : null; })}
              <div className="absolute top-0 border-l-2 border-brand-500" style={{ left: x(model.today) + dayW / 2, height: '100%' }} title="Today" />
              {data.project.deadline && <div className="absolute top-0 border-l-2 border-red-500" style={{ left: x(idx(data.project.deadline)) + dayW, height: '100%' }} title={`Project deadline ${fmtDate(data.project.deadline)}`}><span className="absolute -top-0.5 left-1 whitespace-nowrap rounded bg-red-500 px-1 text-[10px] text-white">Deadline</span></div>}
              {data.milestones.map((m) => <div key={m._id} className="absolute top-0 border-l border-dashed border-amber-400" style={{ left: x(idx(m.date)) + dayW / 2, height: '100%' }} />)}
            </div>

            {/* milestone row */}
            <div className="absolute flex" style={{ top: HEAD, height: ROW, width: LEFT + chartW }}>
              <div className="sticky left-0 z-10 flex shrink-0 items-center border-b border-r border-slate-100 bg-white px-3 text-xs font-medium text-slate-500" style={{ width: LEFT }}><Icon name="diamond" size={12} className="mr-1.5" />Milestones</div>
              <div className="relative border-b border-slate-100" style={{ width: chartW }}>
                {data.milestones.map((m) => (
                  <button key={m._id} onClick={() => canEdit && setMs({ ...m, date: toInputDate(m.date) })} title={`${m.name} · ${fmtDate(m.date)}${m.completed ? ' (done)' : ''}`} className="absolute flex items-center gap-1 whitespace-nowrap text-xs" style={{ left: x(idx(m.date)) + dayW / 2 - 7, top: 8 }}>
                    <span className={`inline-block h-3.5 w-3.5 rotate-45 ${m.completed ? 'bg-green-500' : 'bg-amber-500'}`} />{m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* task rows */}
            {scheduled.map((t, i) => {
              const col = colInfo(project, t.status);
              const dx = drag?.id === t._id ? Math.round(drag.dx / dayW) * dayW : 0;
              const left = x(t.s) + dx;
              const w = Math.max(dayW * (t.e - t.s + 1), 10);
              const done = col.category === 'done';
              const late = !done && t.e < model.today;
              return (
                <div key={t._id} className="absolute flex" style={{ top: HEAD + ROW + i * ROW, height: ROW, width: LEFT + chartW }}>
                  <button onClick={() => onOpen(t._id)} className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-b border-r border-slate-100 bg-white px-3 text-left text-sm hover:bg-slate-50" style={{ width: LEFT }}>
                    <span className="text-xs text-slate-400">#{t.number}</span><span className={`min-w-0 flex-1 truncate ${done ? 'text-slate-400 line-through' : ''}`}>{t.title}</span>
                    {conflictBlocked.has(t._id) && <span title="Scheduling conflict" className="text-amber-600"><Icon name="triangle-alert" size={13} /></span>}
                    {t.assignee && <Avatar user={t.assignee} size={5} />}
                  </button>
                  <div className="relative border-b border-slate-100" style={{ width: chartW }}>
                    <div
                      onMouseDown={(e) => canEdit && e.button === 0 && (e.preventDefault(), setDrag({ id: t._id, x0: e.clientX, dx: 0 }))}
                      onClick={() => !canEdit && onOpen(t._id)}
                      title={`${t.title}\n${t.startDate ? fmtDate(t.startDate) : '—'} → ${t.dueDate ? fmtDate(t.dueDate) : '—'} · ${col.name}`}
                      className={`absolute flex items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-xs text-white ${col.c.bar} ${done ? 'opacity-60' : ''} ${conflictBlocked.has(t._id) ? 'ring-2 ring-red-500' : late ? 'ring-2 ring-red-300' : ''} ${canEdit ? 'cursor-grab' : 'cursor-pointer'} ${t.dueOnly ? 'border-2 border-dashed border-white/70' : ''}`}
                      style={{ left, width: w, top: 6, height: ROW - 12 }}
                    >{w > 70 ? t.title : ''}</div>
                  </div>
                </div>
              );
            })}

            {/* dependency arrows */}
            <svg className="pointer-events-none absolute" style={{ left: LEFT, top: 0 }} width={chartW} height={height}>
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#6B665E" /></marker>
                <marker id="arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#97392B" /></marker>
              </defs>
              {data.links.map(arrow)}
            </svg>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-slate-500" />today</span><span className="inline-flex items-center gap-1.5 text-red-600"><i className="inline-block h-0.5 w-4 bg-red-600" />project deadline</span><span className="inline-flex items-center gap-1.5 text-amber-700"><Icon name="diamond" size={12} />milestone</span><span className="inline-flex items-center gap-1.5"><Icon name="arrow-right" size={12} />dependency (blocker to blocked)</span><span className="text-red-600">red = conflict or cycle</span>{canEdit && <span>Drag a bar to reschedule</span>}
      </div>

      {unscheduled.length > 0 && (
        <div className="card">
          <button className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium" onClick={() => setShowUnscheduled(!showUnscheduled)}>Unscheduled tasks ({unscheduled.length})<Icon name={showUnscheduled ? 'chevron-down' : 'chevron-right'} size={16} className="text-slate-400" /></button>
          {showUnscheduled && <div className="divide-y divide-slate-100 border-t border-slate-100">{unscheduled.map((t) => <button key={t._id} onClick={() => onOpen(t._id)} className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"><span className="text-xs text-slate-400">#{t.number}</span> {t.title}</button>)}</div>}
        </div>
      )}

      {ms && <MilestoneModal base={base} initial={ms} onClose={() => setMs(null)} onSaved={() => { setMs(null); load(); }} />}
    </div>
  );
}

function MilestoneModal({ base, initial, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { name: f.name, date: f.date, description: f.description || '', completed: !!f.completed };
      if (f._id) await api.patch(`${base}/milestones/${f._id}`, body); else await api.post(`${base}/milestones`, body);
      onSaved();
    } catch (x) { setError(errMsg(x)); }
  };
  const del = async () => { if (!window.confirm('Delete this milestone?')) return; try { await api.delete(`${base}/milestones/${f._id}`); onSaved(); } catch (x) { setError(errMsg(x)); } };
  return (
    <Modal title={f._id ? 'Edit milestone' : 'New milestone'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Name"><input className="input" required autoFocus maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Date"><input type="date" required className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input" rows={2} maxLength={500} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.completed} onChange={(e) => setF({ ...f, completed: e.target.checked })} /> Reached</label>
        <div className="flex justify-between">{f._id ? <button type="button" className="btn-ghost text-red-600" onClick={del}>Delete</button> : <span />}<div className="flex gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary">Save</button></div></div>
      </form>
    </Modal>
  );
}
