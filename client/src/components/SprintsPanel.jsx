import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { PRIORITIES, atLeast, colInfo, fmtDate, isDoneStatus, lookup, toInputDate } from '../lib/constants.js';
import { useDebouncedCallback, useSocketEvent } from '../lib/realtime.js';
import { Alert, Avatar, Badge, Empty, Field, Modal, PriorityTag, Spinner, StatusTag } from './ui.jsx';
import { Bar, LineChart } from './Charts.jsx';

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Backlog + sprints. Drag tasks between lists (optimistic, with rollback) or use the "Move to" menu.
export default function SprintsPanel({ project, onOpen, onChanged }) {
  const { workspace, role } = useWorkspace();
  const base = `/workspaces/${workspace._id}/projects/${project._id}`;
  const canEdit = atLeast(role, 'member') && !project.archived;
  const [data, setData] = useState(null); // { sprints, backlog, canManage }
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // sprint being created/edited
  const [completing, setCompleting] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [adding, setAdding] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        api.get(`${base}/sprints`),
        api.get(`/workspaces/${workspace._id}/tasks`, { params: { project: project._id, topLevel: 'true', sort: 'position', dir: 'asc', limit: 300 } }),
      ]);
      setData(s.data); setTasks(t.data.tasks); setError('');
    } catch (e) { setError(errMsg(e)); }
  }, [base, workspace._id, project._id]);
  useEffect(() => { load(); }, [load]);
  const live = useDebouncedCallback(load, 500);
  useSocketEvent('task:changed', (e) => e.projectId === project._id && live());
  useSocketEvent('project:changed', (e) => e.projectId === project._id && live());

  const bySprint = useMemo(() => {
    const m = { backlog: [] };
    for (const s of data?.sprints || []) m[s._id] = [];
    for (const t of tasks || []) (m[t.sprint || 'backlog'] || m.backlog).push(t);
    return m;
  }, [data, tasks]);

  const run = async (fn) => { try { await fn(); await load(); onChanged?.(); } catch (e) { setError(errMsg(e)); } };

  async function moveTask(id, sprintId) {
    const t = tasks.find((x) => x._id === id);
    if (!t || (t.sprint || null) === (sprintId || null)) return;
    const prev = t.sprint || null;
    setTasks((cur) => cur.map((x) => (x._id === id ? { ...x, sprint: sprintId || null } : x))); // optimistic
    try { await api.patch(`/workspaces/${workspace._id}/tasks/${id}`, { sprint: sprintId || null }); load(); onChanged?.(); }
    catch (e) { setTasks((cur) => cur.map((x) => (x._id === id ? { ...x, sprint: prev } : x))); setError(`Could not move “${t.title}” - it was put back. ${errMsg(e)}`); }
  }
  const setPoints = (t, v) => run(() => api.patch(`/workspaces/${workspace._id}/tasks/${t._id}`, { storyPoints: v }));
  const addBacklog = async () => {
    if (!adding.trim()) return;
    await run(() => api.post(`/workspaces/${workspace._id}/tasks`, { project: project._id, title: adding.trim() }));
    setAdding('');
  };

  if (!data || !tasks) return error ? <Alert>{error}</Alert> : <Spinner />;
  const moveTargets = data.sprints.filter((s) => s.status !== 'completed');

  const taskRow = (t) => {
    const col = colInfo(project, t.status);
    const done = isDoneStatus(project, t.status);
    return (
      <div key={t._id} draggable={canEdit} onDragStart={(e) => { e.dataTransfer.setData('text/plain', t._id); setDragId(t._id); }} onDragEnd={() => { setDragId(null); setOverKey(null); }}
        className={`flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 ${dragId === t._id ? 'opacity-40' : 'hover:bg-slate-50'}`}>
        <span className="w-8 text-xs text-slate-400">#{t.number}</span>
        <button className={`min-w-0 flex-1 truncate text-left font-medium ${done ? 'text-slate-400 line-through' : ''}`} onClick={() => onOpen(t._id)}>{t.title}</button>
        <StatusTag col={col} />
        <PriorityTag value={t.priority} />
        {t.assignee ? <Avatar user={t.assignee} size={6} /> : <span className="w-6" />}
        <input type="number" min="0" max="1000" disabled={!canEdit} title="Story points" placeholder="pts" key={`${t._id}-${t.storyPoints}`} defaultValue={t.storyPoints ?? ''}
          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center text-xs" onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (t.storyPoints ?? null)) setPoints(t, v); }} />
        {canEdit && (
          <select className="w-28 rounded border border-slate-200 px-1 py-0.5 text-xs" value={t.sprint || ''} onChange={(e) => moveTask(t._id, e.target.value || null)} title="Move to…">
            <option value="">Backlog</option>
            {moveTargets.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        )}
      </div>
    );
  };

  const drop = (k, sprintId, children) => (
    <div key={k} onDragOver={(e) => { if (dragId && canEdit) { e.preventDefault(); setOverKey(k); } }} onDragLeave={() => setOverKey((o) => (o === k ? null : o))}
      onDrop={(e) => { e.preventDefault(); const id = dragId || e.dataTransfer.getData('text/plain'); setDragId(null); setOverKey(null); if (id) moveTask(id, sprintId); }}
      className={overKey === k ? 'rounded-lg ring-2 ring-brand-500/50' : ''}>{children}</div>
  );

  const ordered = [...data.sprints.filter((s) => s.status === 'active'), ...data.sprints.filter((s) => s.status === 'planned')];
  const completed = data.sprints.filter((s) => s.status === 'completed');
  const backlogTasks = bySprint.backlog.filter((t) => showDone || !isDoneStatus(project, t.status));

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Plan work in sprints. Drag tasks between the backlog and a sprint, or use “Move to”. Story points drive the burndown.</p>
        {data.canManage && !project.archived && <button className="btn-secondary" onClick={() => setForm({ name: `Sprint ${data.sprints.length + 1}`, goal: '', startDate: day(0), endDate: day(13) })}><Icon name="plus" size={14} />Create sprint</button>}
      </div>

      {ordered.map((s) => drop(s._id, s._id,
          <SprintCard sprint={s} project={project} canManage={data.canManage && !project.archived} base={base} tasks={bySprint[s._id]} renderRow={taskRow}
            onEdit={() => setForm({ ...s, startDate: toInputDate(s.startDate), endDate: toInputDate(s.endDate) })}
            onStart={() => run(() => api.post(`${base}/sprints/${s._id}/start`))}
            onComplete={() => setCompleting(s)}
            onDelete={() => window.confirm(`Delete “${s.name}”? Its tasks return to the backlog.`) && run(() => api.delete(`${base}/sprints/${s._id}`))} reloadKey={tasks} />
      ))}

      {drop('backlog', null,
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div><b>Backlog</b> <span className="text-sm text-slate-500">· {bySprint.backlog.filter((t) => !isDoneStatus(project, t.status)).length} open · {data.backlog.points} pts</span></div>
            <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done</label>
          </div>
          {backlogTasks.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">The backlog is empty.</p> : backlogTasks.map(taskRow)}
          {canEdit && <div className="border-t border-slate-100 p-3"><input className="input" placeholder="Add to backlog, press Enter" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBacklog()} /></div>}
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h3 className="mb-2 font-medium">Completed sprints</h3>
          <div className="card divide-y divide-slate-100">
            {completed.map((s) => (
              <div key={s._id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
                <b className="w-40">{s.name}</b>
                <span className="text-slate-500">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</span>
                <span>{s.completedPoints}/{s.committedPoints} pts</span>
                <span>{s.completedCount}/{s.committedCount} tasks</span>
                {s.carriedOver > 0 && <Badge cls="bg-amber-100 text-amber-700">{s.carriedOver} carried over</Badge>}
                {s.goal && <span className="text-slate-400">Goal: {s.goal}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!data.sprints.length && <Empty>No sprints yet. {data.canManage ? 'Create the first one to start planning.' : 'Ask the project owner or an admin to create one.'}</Empty>}

      {form && <SprintForm base={base} initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); onChanged?.(); }} />}
      {completing && <CompleteSprint base={base} sprint={completing} tasks={bySprint[completing._id] || []} project={project} planned={data.sprints.filter((x) => x.status === 'planned')} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); load(); onChanged?.(); }} />}
    </div>
  );
}

function SprintCard({ sprint: s, project, canManage, base, tasks, renderRow, onEdit, onStart, onComplete, onDelete, reloadKey }) {
  const [open, setOpen] = useState(true);
  const p = s.progress;
  const active = s.status === 'active';
  return (
    <div className={`card overflow-hidden ${active ? 'border-brand-500' : ''}`}>
      <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(!open)} className="text-slate-400 hover:text-slate-700" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} /></button>
            <b>{s.name}</b>
            <Badge cls={active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}>{active ? 'Active' : 'Planned'}</Badge>
            <span className="text-xs text-slate-500">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</span>
          </div>
          {canManage && (
            <div className="flex gap-1">
              {!active && <button className="btn-primary !py-1 text-xs" onClick={onStart}>Start sprint</button>}
              {active && <button className="btn-primary !py-1 text-xs" onClick={onComplete}>Complete sprint</button>}
              <button className="btn-secondary !py-1 text-xs" onClick={onEdit}>Edit</button>
              {!active && <button className="btn-ghost !py-1 text-xs text-red-600" onClick={onDelete}>Delete</button>}
            </div>
          )}
        </div>
        {s.goal && <p className="text-sm text-slate-600"><b>Goal:</b> {s.goal}</p>}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="w-48"><Bar value={p.donePoints || p.doneCount} max={p.points || p.taskCount} color="bg-green-500" /></div>
          <span>{p.donePoints}/{p.points} pts · {p.doneCount}/{p.taskCount} tasks · {p.percent}%</span>
        </div>
      </div>
      {open && (
        <>
          {active && <Burndown base={base} sprint={s} reloadKey={reloadKey} />}
          {tasks.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Drag tasks here from the backlog.</p> : tasks.map(renderRow)}
        </>
      )}
    </div>
  );
}

function Burndown({ base, sprint, reloadKey }) {
  const [metric, setMetric] = useState('points');
  const [bd, setBd] = useState(null);
  useEffect(() => { api.get(`${base}/sprints/${sprint._id}`, { params: { metric } }).then((r) => setBd(r.data.burndown)).catch(() => {}); }, [base, sprint._id, metric, reloadKey]);
  if (!bd?.started) return null;
  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <b className="text-sm">Burndown</b>
        <div className="flex gap-1 text-xs">{['points', 'tasks'].map((m) => <button key={m} onClick={() => setMetric(m)} className={`rounded px-2 py-1 ${metric === m ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>{m}</button>)}</div>
      </div>
      <LineChart labels={bd.days.map((d) => d.date)} height={190} series={[{ name: 'Ideal', color: '#8C867B', dashed: true, values: bd.days.map((d) => d.ideal) }, { name: `Remaining ${metric}`, color: '#1F3A68', values: bd.days.map((d) => d.actual) }]} />
      <p className="text-xs text-slate-400">Committed {bd.committed} {metric}, remaining {bd.remaining}. Work added after the start raises the line.</p>
    </div>
  );
}

function SprintForm({ base, initial, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { name: f.name, goal: f.goal || '', startDate: f.startDate, endDate: f.endDate };
      if (f._id) await api.patch(`${base}/sprints/${f._id}`, body); else await api.post(`${base}/sprints`, body);
      onSaved();
    } catch (x) { setError(errMsg(x)); }
  };
  return (
    <Modal title={f._id ? 'Edit sprint' : 'Create sprint'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Name"><input className="input" required autoFocus maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Sprint goal"><textarea className="input" rows={2} maxLength={1000} value={f.goal || ''} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="What should this sprint achieve?" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><input type="date" required className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="End date"><input type="date" required className="input" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary">Save</button></div>
      </form>
    </Modal>
  );
}

function CompleteSprint({ base, sprint, tasks, project, planned, onClose, onDone }) {
  const unfinished = tasks.filter((t) => !isDoneStatus(project, t.status));
  const [to, setTo] = useState(unfinished.length ? (planned.length ? 'existing' : 'new') : 'backlog');
  const [sprintId, setSprintId] = useState(planned[0]?._id || '');
  const [next, setNext] = useState({ name: `Sprint ${Number(sprint.name.match(/\d+/)?.[0] || 0) + 1}`, startDate: day(1), endDate: day(14) });
  const [error, setError] = useState('');
  const submit = async () => {
    try { await api.post(`${base}/sprints/${sprint._id}/complete`, { to, sprintId: to === 'existing' ? sprintId : undefined, next: to === 'new' ? next : undefined }); onDone(); }
    catch (e) { setError(errMsg(e)); }
  };
  return (
    <Modal title={`Complete ${sprint.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Alert>{error}</Alert>
        <p className="text-sm"><b>{tasks.length - unfinished.length}</b> task(s) are done and stay in this sprint. <b>{unfinished.length}</b> unfinished.</p>
        {unfinished.length > 0 && (
          <div className="space-y-2 text-sm">
            <div className="font-medium">Move the unfinished tasks to:</div>
            <label className="flex items-center gap-2"><input type="radio" checked={to === 'backlog'} onChange={() => setTo('backlog')} /> The backlog</label>
            <label className={`flex items-center gap-2 ${planned.length ? '' : 'text-slate-400'}`}><input type="radio" disabled={!planned.length} checked={to === 'existing'} onChange={() => setTo('existing')} /> An existing planned sprint
              <select className="input !w-44" disabled={to !== 'existing'} value={sprintId} onChange={(e) => setSprintId(e.target.value)}>{planned.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
            <label className="flex items-center gap-2"><input type="radio" checked={to === 'new'} onChange={() => setTo('new')} /> A new sprint</label>
            {to === 'new' && (
              <div className="grid grid-cols-3 gap-2 pl-6">
                <input className="input" value={next.name} onChange={(e) => setNext({ ...next, name: e.target.value })} />
                <input type="date" className="input" value={next.startDate} onChange={(e) => setNext({ ...next, startDate: e.target.value })} />
                <input type="date" className="input" value={next.endDate} onChange={(e) => setNext({ ...next, endDate: e.target.value })} />
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Complete sprint</button></div>
      </div>
    </Modal>
  );
}
