import { useEffect, useMemo, useRef, useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { COLORS, PRIORITIES, atLeast, columnsOf, fmtDate, isOverdue, lookup } from '../lib/constants.js';
import { Alert, Avatar, Badge, Loading, PriorityTag, StatusDot } from './ui.jsx';
import Icon from './Icon.jsx';
import { toast } from '../lib/toast.jsx';

const GAP = 1024;

// Kanban board. Native HTML5 drag & drop; moves are applied optimistically and rolled back if the API fails.
export default function BoardView({ q, project, reload, onOpen, onMutated }) {
  const { workspace, role } = useWorkspace();
  const base = `/workspaces/${workspace._id}/tasks`;
  const columns = columnsOf(project);
  const canEdit = atLeast(role, 'member') && !project.archived;
  const [tasks, setTasks] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { col, index }
  const [adding, setAdding] = useState({}); // column key -> draft title
  const inflight = useRef(0); // own moves still being saved
  const skipped = useRef(false); // a live refresh arrived while a move was in flight
  const [bump, setBump] = useState(0);

  const params = q.apiParams({ project: project._id, topLevel: 'true', sort: 'position', dir: 'asc', limit: 300 });
  delete params.status; // the board already shows every column
  const key = JSON.stringify(params);

  useEffect(() => {
    let alive = true;
    api.get(base, { params }).then((r) => {
      if (!alive) return;
      if (inflight.current > 0) { skipped.current = true; return; } // don't clobber an optimistic move; refetch afterwards
      setTasks(r.data.tasks); setTotal(r.data.total); setError('');
    }).catch((e) => alive && setError(errMsg(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, key, reload, bump]);

  const byCol = useMemo(() => {
    const m = Object.fromEntries(columns.map((c) => [c.key, []]));
    for (const t of tasks || []) (m[t.status] || m[columns[0].key]).push(t);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.position - b.position || new Date(a.createdAt) - new Date(b.createdAt));
    return m;
  }, [tasks, columns]);

  const endDrag = () => { setDragId(null); setOver(null); };

  async function move(id, col, rawIndex) {
    const task = tasks.find((t) => t._id === id);
    const list = byCol[col].filter((t) => t._id !== id);
    const origin = byCol[col].findIndex((t) => t._id === id);
    let index = rawIndex;
    if (origin !== -1 && origin < index) index -= 1; // removing the card shifts later slots up
    if (task.status === col && origin === index) return; // dropped where it already is
    const before = list[index - 1]?.position;
    const after = list[index]?.position;
    const position = before != null && after != null ? (before + after) / 2 : before != null ? before + GAP : after != null ? after - GAP : GAP;

    const snapshot = { status: task.status, position: task.position };
    setTasks((cur) => cur.map((t) => (t._id === id ? { ...t, status: col, position } : t))); // optimistic
    inflight.current += 1;
    try {
      await api.patch(`${base}/${id}`, { status: col, position });
      setError('');
      onMutated?.(); // refresh project completion numbers
    } catch (e) {
      setTasks((cur) => cur.map((t) => (t._id === id ? { ...t, ...snapshot } : t))); // rollback
      toast.error(`Couldn't move “${task.title}”`, { description: `It was put back. ${errMsg(e)}` });
    } finally {
      inflight.current -= 1;
      if (inflight.current === 0 && skipped.current) { skipped.current = false; setBump((b) => b + 1); }
    }
  }

  async function quickAdd(col) {
    const title = (adding[col] || '').trim();
    if (!title) return;
    try {
      const { data } = await api.post(base, { project: project._id, title, status: col });
      setTasks((cur) => [...cur, data.task]);
      setAdding((a) => ({ ...a, [col]: '' }));
      onMutated?.();
    } catch (e) { toast.error("Couldn't add the task", { description: errMsg(e) }); }
  }

  if (!tasks) return error ? <Alert>{error}</Alert> : <Loading variant="board" />;
  return (
    <div className="space-y-2">
      <Alert>{error}</Alert>
      {total > tasks.length && <Alert tone="info">Showing the first {tasks.length} of {total} tasks - narrow it down with filters.</Alert>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((col) => {
          const list = byCol[col.key];
          const cc = COLORS[col.color] || COLORS.slate;
          const isOver = over?.col === col.key && dragId;
          return (
            <div key={col.key} className={`flex w-72 shrink-0 flex-col rounded-lg bg-slate-100 ${isOver ? 'ring-2 ring-brand-500/30' : ''}`}>
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium"><StatusDot dot={cc.dot} hollow={cc.hollow} />{col.name}<span className="tnum text-xs font-normal text-slate-500">{list.length}</span></div>
                {col.category === 'done' && <Icon name="check" size={14} className="text-green-600" />}
              </div>
              <div
                className="flex min-h-[80px] flex-1 flex-col gap-2 px-2 pb-2"
                onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setOver({ col: col.key, index: list.length }); }}
                onDrop={(e) => { e.preventDefault(); const id = dragId || e.dataTransfer.getData('text/plain'); if (id && over?.col === col.key) move(id, col.key, over.index); endDrag(); }}
              >
                {list.map((t, i) => (
                  <div key={t._id}>
                    {isOver && over.index === i && <div className="mb-2 h-1 rounded bg-brand-500" />}
                    <Card
                      task={t} project={project} draggable={canEdit} dragging={dragId === t._id} onOpen={() => onOpen(t._id)}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t._id); e.dataTransfer.effectAllowed = 'move'; setDragId(t._id); }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault(); e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setOver({ col: col.key, index: i + (e.clientY > r.top + r.height / 2 ? 1 : 0) });
                      }}
                    />
                  </div>
                ))}
                {isOver && over.index >= list.length && <div className="h-1 rounded bg-brand-500" />}
                {canEdit && (
                  <input
                    className="input !bg-white/80 text-xs" placeholder="Add a task, press Enter"
                    value={adding[col.key] || ''}
                    onChange={(e) => setAdding((a) => ({ ...a, [col.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && quickAdd(col.key)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!canEdit && <p className="text-xs text-slate-400">{project.archived ? 'This project is archived.' : 'You have view-only access, so cards cannot be moved.'}</p>}
      <p className="text-xs text-slate-500">Drag cards between columns or reorder them inside a column. On touch screens, change the status inside the task.</p>
    </div>
  );
}

function Card({ task: t, project, draggable, dragging, onOpen, ...drag }) {
  const done = columnsOf(project).find((c) => c.key === t.status)?.category === 'done';
  return (
    <div
      draggable={draggable} onClick={onOpen} {...drag}
      className={`card cursor-pointer p-2.5 transition-colors hover:border-slate-300 ${dragging ? 'opacity-40' : ''} ${draggable ? 'active:cursor-grabbing' : ''}`}
    >
      <div className="font-mono text-[11px] text-slate-400">#{t.number}</div>
      <div className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : ''}`}>{t.title}</div>
      {t.labels.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{t.labels.map((l) => <Badge key={l} cls="bg-brand-50 text-brand-700">{l}</Badge>)}</div>}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PriorityTag value={t.priority} label={false} />
          {t.dueDate && <span className={`inline-flex items-center gap-1 text-xs ${isOverdue(t.dueDate, done ? 'done' : '') ? 'font-medium text-red-600' : 'text-slate-500'}`}><Icon name="calendar" size={12} />{fmtDate(t.dueDate)}</span>}
          {t.subtaskTotal > 0 && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Icon name="list-checks" size={13} />{t.subtaskDone}/{t.subtaskTotal}</span>}
        </div>
        {t.assignee && <Avatar user={t.assignee} size={6} />}
      </div>
    </div>
  );
}
