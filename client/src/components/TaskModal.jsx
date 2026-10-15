import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { PRIORITIES, activityText, atLeast, colInfo, columnsOf, doneKey, fmtDateTime, fmtSize, isDoneStatus, openKey, toInputDate } from '../lib/constants.js';
import { Alert, Avatar, Badge, Drawer, Field, Loading, Select, StatusTag } from './ui.jsx';
import Icon from './Icon.jsx';
import { useCrumb } from './AppShell.jsx';
import { toast } from '../lib/toast.jsx';
import MentionTextarea, { Mentions } from './MentionTextarea.jsx';
import PresenceBar from './PresenceBar.jsx';
import { useDebouncedCallback, useRoom, useSocketEvent, useViewing } from '../lib/realtime.js';

const LINK_LABEL = { blocks: 'Blocks', blocked_by: 'Blocked by', relates_to: 'Relates to' };

// mode 'drawer' (default): slide-over panel; mode 'page': the same content as a full page.
export default function TaskModal({ taskId, onClose, onChanged, onOpenTask, mode = 'drawer' }) {
  const { workspace, role, members } = useWorkspace();
  const { user } = useAuth();
  const base = `/workspaces/${workspace._id}/tasks`;
  const url = `${base}/${taskId}`;
  const canEdit = atLeast(role, 'member');
  const isAdmin = atLeast(role, 'admin');

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('comments');
  const [tick, setTick] = useState(0); // bumps to refresh comments/activity
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [subTitle, setSubTitle] = useState('');

  const server = useRef({ title: '', desc: '' }); // last values from the server, to tell "unsaved edits" from "stale"
  const [warnings, setWarnings] = useState([]);
  const [sprints, setSprints] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get(url);
      setData(d);
      // live refresh must not wipe what the user is typing: only overwrite fields they have not edited.
      // Capture the previous server values first: React may run these updaters after the ref below is reassigned.
      const prev = server.current;
      setTitle((cur) => (cur === prev.title ? d.task.title : cur));
      setDesc((cur) => (cur === prev.desc ? d.task.description || '' : cur));
      server.current = { title: d.task.title, desc: d.task.description || '' };
    } catch (e) { setError(errMsg(e)); }
  }, [url]);
  useEffect(() => { load(); }, [load]);

  // live: join this task's room, tell teammates we are viewing it, refresh when it changes elsewhere
  useRoom('task', taskId);
  useViewing('taskId', taskId);
  const liveLoad = useDebouncedCallback(() => { load(); setTick((t) => t + 1); }, 300);
  useSocketEvent('task:changed', (e) => { if (e.taskId === taskId || e.parent === taskId) liveLoad(); });
  useSocketEvent('comment:created', (e) => { if (e.taskId === taskId) setTick((t) => t + 1); });

  const projectIdOf = data?.task.project?._id;
  useEffect(() => {
    if (!projectIdOf || !canEdit) return;
    api.get(`/workspaces/${workspace._id}/projects/${projectIdOf}/sprints`).then((r) => setSprints(r.data.sprints.filter((s) => s.status !== 'completed'))).catch(() => {});
  }, [projectIdOf, canEdit, workspace._id, tick]);

  const guard = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(errMsg(e)); } };
  const patch = (body) => guard(async () => {
    const { data: d } = await api.patch(url, body);
    setData((x) => ({ ...x, task: d.task }));
    server.current = { title: d.task.title, desc: d.task.description || '' };
    setTitle(d.task.title); setDesc(d.task.description || '');
    setWarnings(d.warnings || []);
    setTick((t) => t + 1); onChanged?.();
  });

  useCrumb(data ? `#${data.task.number} ${data.task.title}` : null);
  // a plain function (not a component) so inputs inside keep focus across re-renders
  const surface = (title, children) => (mode === 'page'
    ? <div className="mx-auto max-w-4xl"><div className="mb-4 text-sm text-slate-500">{title}</div>{children}</div>
    : <Drawer title={title} onClose={onClose} fullPageTo={`/w/${workspace._id}/task/${taskId}`}>{children}</Drawer>);
  if (!data) return surface('Task', error ? <Alert>{error}</Alert> : <Loading variant="inline" />);
  const { task, subtasks, links, parent } = data;

  const addLabel = () => {
    const l = labelInput.trim();
    if (l && !task.labels.includes(l)) patch({ labels: [...task.labels, l] });
    setLabelInput('');
  };
  const addSubtask = () => guard(async () => {
    if (!subTitle.trim()) return;
    await api.post(base, { project: task.project._id, parent: task._id, title: subTitle.trim() });
    setSubTitle(''); await load(); setTick((t) => t + 1); onChanged?.();
  });
  const toggleSub = (s) => guard(async () => {
    await api.patch(`${base}/${s._id}`, { status: isDoneStatus(task.project, s.status) ? openKey(task.project) : doneKey(task.project) });
    await load(); onChanged?.();
  });
  const duplicate = () => guard(async () => { const { data: d } = await api.post(`${url}/duplicate`); onChanged?.(); toast.success('Task duplicated'); onOpenTask(d.task._id); });
  const remove = () => guard(async () => {
    if (!window.confirm('Delete this task' + (subtasks.length ? ' and its subtasks' : '') + '?')) return;
    await api.delete(url); onChanged?.(); toast.success('Task deleted'); onClose();
  });
  const canDelete = canEdit && (isAdmin || task.reporter?._id === user._id);
  const doneSubs = subtasks.filter((s) => isDoneStatus(task.project, s.status)).length;

  return surface(`${task.project?.name || ''} · #${task.number}`, (
      <div className="space-y-5">
        <Alert>{error}</Alert>
        {warnings.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"><b>Scheduling conflict{warnings.length > 1 ? 's' : ''}:</b><ul className="ml-4 list-disc">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
        <PresenceBar taskId={taskId} label="Also viewing" />
        {parent && <button className="text-xs text-brand-600 hover:underline" onClick={() => onOpenTask(parent._id)}><Icon name="arrow-up" size={12} className="mr-1 inline" />Subtask of #{parent.number} {parent.title}</button>}
        <input className="w-full rounded-md border border-transparent px-2 py-1 text-xl font-medium tracking-tight hover:border-slate-200 focus:border-brand-500 focus:outline-none disabled:bg-transparent" disabled={!canEdit} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })} />

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="min-w-0 space-y-6">
            <section>
              <h3 className="mb-1 text-sm font-medium">Description</h3>
              <MentionTextarea rows={5} disabled={!canEdit} value={desc} members={members} placeholder="Add a description… use @name to mention a teammate" onChange={setDesc} />
              {canEdit && desc !== (task.description || '') && <div className="mt-2 flex gap-2"><button className="btn-primary" onClick={() => patch({ description: desc })}>Save</button><button className="btn-secondary" onClick={() => setDesc(task.description || '')}>Cancel</button></div>}
            </section>

            {!task.parent && (
              <section>
                <h3 className="mb-2 text-sm font-medium">Subtasks {subtasks.length > 0 && <span className="font-normal text-slate-400">({doneSubs}/{subtasks.length})</span>}</h3>
                {subtasks.length > 0 && <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-green-500" style={{ width: `${(doneSubs / subtasks.length) * 100}%` }} /></div>}
                <ul className="space-y-1">
                  {subtasks.map((s) => (
                    <li key={s._id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
                      <input type="checkbox" disabled={!canEdit} checked={isDoneStatus(task.project, s.status)} onChange={() => toggleSub(s)} />
                      <button className={`flex-1 text-left text-sm ${isDoneStatus(task.project, s.status) ? 'text-slate-400 line-through' : ''}`} onClick={() => onOpenTask(s._id)}>{s.title}</button>
                      {s.assignee && <Avatar user={s.assignee} size={5} />}
                    </li>
                  ))}
                </ul>
                {canEdit && <div className="mt-2 flex gap-2"><input className="input" placeholder="Add a subtask…" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSubtask()} /><button className="btn-secondary" onClick={addSubtask}>Add</button></div>}
              </section>
            )}

            <Links task={task} links={links} base={base} canEdit={canEdit} guard={guard} onWarn={setWarnings} reload={async () => { await load(); setTick((t) => t + 1); }} onOpenTask={onOpenTask} />
            <Attachments task={task} base={base} url={url} canEdit={canEdit} guard={guard} reload={async () => { await load(); setTick((t) => t + 1); }} />

            <section>
              <div className="mb-3 flex gap-4 border-b border-slate-200 text-sm">
                {['comments', 'activity'].map((t) => <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-2 capitalize ${tab === t ? 'border-brand-600 font-medium text-brand-600' : 'border-transparent text-slate-500'}`}>{t}</button>)}
              </div>
              {tab === 'comments' ? <Comments url={url} canEdit={canEdit} isAdmin={isAdmin} me={user._id} tick={tick} bump={() => setTick((t) => t + 1)} /> : <ActivityLog url={url} tick={tick} />}
            </section>
          </div>

          <aside className="space-y-4">
            <Field label="Status"><Select disabled={!canEdit} options={columnsOf(task.project).map((c) => ({ value: c.key, label: c.name }))} value={task.status} onChange={(v) => patch({ status: v })} /></Field>
            <Field label="Priority"><Select disabled={!canEdit} options={PRIORITIES} value={task.priority} onChange={(v) => patch({ priority: v })} /></Field>
            <Field label="Assignee"><Select disabled={!canEdit} options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.user._id, label: m.user.name }))]} value={task.assignee?._id || ''} onChange={(v) => patch({ assignee: v || null })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start date"><input type="date" className="input" disabled={!canEdit} value={toInputDate(task.startDate)} onChange={(e) => patch({ startDate: e.target.value || null })} /></Field>
              <Field label="Due date"><input type="date" className="input" disabled={!canEdit} value={toInputDate(task.dueDate)} onChange={(e) => patch({ dueDate: e.target.value || null })} /></Field>
            </div>
            <Field label="Story points"><input type="number" min="0" max="1000" className="input" disabled={!canEdit} defaultValue={task.storyPoints ?? ''} key={`sp-${task.storyPoints}`} onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (task.storyPoints ?? null)) patch({ storyPoints: v }); }} /></Field>
            {!task.parent && (
              <Field label="Sprint"><Select disabled={!canEdit} options={[{ value: '', label: 'Backlog' }, ...sprints.map((s) => ({ value: s._id, label: `${s.name}${s.status === 'active' ? ' (active)' : ''}` }))]} value={task.sprint || ''} onChange={(v) => patch({ sprint: v || null })} /></Field>
            )}
            <div><div className="mb-1 text-sm font-medium">Reporter</div><div className="flex items-center gap-2 text-sm"><Avatar user={task.reporter} size={6} />{task.reporter?.name}</div></div>
            <div>
              <div className="mb-1 text-sm font-medium">Labels</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {task.labels.map((l) => <Badge key={l} cls="bg-brand-50 text-brand-700">{l}{canEdit && <button className="ml-1 text-brand-500 hover:text-brand-700" aria-label={`Remove ${l}`} onClick={() => patch({ labels: task.labels.filter((x) => x !== l) })}><Icon name="x" size={12} /></button>}</Badge>)}
              </div>
              {canEdit && <input className="input" placeholder="Add label + Enter" maxLength={30} value={labelInput} onChange={(e) => setLabelInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())} />}
            </div>
            <div className="text-xs text-slate-400">Created {fmtDateTime(task.createdAt)}<br />Updated {fmtDateTime(task.updatedAt)}</div>
            {canEdit && (
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                <button className="btn-secondary" onClick={duplicate}>Duplicate</button>
                {canDelete && <button className="btn-danger" onClick={remove}>Delete task</button>}
              </div>
            )}
          </aside>
        </div>
      </div>
  ));
}

function Links({ task, links, base, canEdit, guard, reload, onOpenTask, onWarn }) {
  const [type, setType] = useState('blocks');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 1) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try { const { data } = await api.get(base, { params: { search: q.trim(), limit: 6 } }); setResults(data.tasks.filter((t) => t._id !== task._id)); } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, base, task._id]);

  const add = (target) => guard(async () => { const { data } = await api.post(`${base}/${task._id}/links`, { type, targetId: target._id }); onWarn?.(data.warnings || []); setQ(''); setResults([]); await reload(); });
  const del = (id) => guard(async () => { await api.delete(`${base}/${task._id}/links/${id}`); await reload(); });

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">Linked tasks</h3>
      {links.length === 0 && <p className="mb-2 text-sm text-slate-400">No linked tasks.</p>}
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l._id} className="flex items-center gap-2 text-sm">
            <Badge cls={l.type === 'blocked_by' ? 'bg-red-100 text-red-700' : l.type === 'blocks' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}>{LINK_LABEL[l.type]}</Badge>
            <button className="flex-1 truncate text-left hover:text-brand-600" onClick={() => onOpenTask(l.task._id)}>#{l.task.number} {l.task.title}</button>
            <StatusTag col={colInfo(l.task.project, l.task.status)} />
            {canEdit && <button className="text-slate-400 hover:text-red-600" aria-label="Remove link" onClick={() => del(l._id)}><Icon name="x" size={14} /></button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="relative mt-2 flex gap-2">
          <select className="input !w-36" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(LINK_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="input" placeholder="Search a task to link…" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.length > 0 && (
            <ul className="absolute left-40 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-pop">
              {results.map((t) => <li key={t._id}><button className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => add(t)}>#{t.number} {t.title}</button></li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Attachments({ task, base, url, canEdit, guard, reload }) {
  const ref = useRef();
  const upload = (e) => guard(async () => {
    const files = [...e.target.files];
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    await api.post(`${url}/attachments`, fd);
    e.target.value = '';
    await reload();
  });
  const download = (a) => guard(async () => {
    await api.get('/auth/me'); // makes sure the access cookie is fresh before the browser navigates
    window.location.href = `/api${base.replace('/api', '')}/${task._id}/attachments/${a._id}`;
  });
  const del = (a) => guard(async () => { await api.delete(`${url}/attachments/${a._id}`); await reload(); });

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Attachments</h3>
        {canEdit && <><button className="btn-secondary !py-1 text-xs" onClick={() => ref.current.click()}>Upload</button><input ref={ref} type="file" multiple className="hidden" onChange={upload} /></>}
      </div>
      {task.attachments.length === 0 ? <p className="text-sm text-slate-400">No attachments (max 10 MB each).</p> : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {task.attachments.map((a) => (
            <li key={a._id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <button className="flex-1 truncate text-left text-brand-600 hover:underline" onClick={() => download(a)}><Icon name="paperclip" size={13} className="mr-1.5 inline" />{a.originalName}</button>
              <span className="text-xs text-slate-400">{fmtSize(a.size)}</span>
              {canEdit && <button className="text-slate-400 hover:text-red-600" aria-label="Remove attachment" onClick={() => del(a)}><Icon name="x" size={14} /></button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Comments({ url, canEdit, isAdmin, me, tick, bump }) {
  const { members } = useWorkspace();
  const [comments, setComments] = useState(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setComments((await api.get(`${url}/comments`)).data.comments); } catch (e) { setError(errMsg(e)); } }, [url]);
  useEffect(() => { load(); }, [load, tick]);
  useSocketEvent('comment:deleted', (e) => setComments((c) => (c ? c.filter((x) => x._id !== e.commentId) : c)));

  const post = async () => {
    if (!body.trim()) return;
    try { await api.post(`${url}/comments`, { body }); setBody(''); await load(); bump(); } catch (e) { setError(errMsg(e)); }
  };
  const del = async (id) => { try { await api.delete(`${url}/comments/${id}`); await load(); } catch (e) { setError(errMsg(e)); } };

  return (
    <div className="space-y-3">
      <Alert>{error}</Alert>
      {!comments ? <Loading variant="inline" /> : comments.length === 0 ? <p className="text-sm text-slate-400">No comments yet.</p> : comments.map((c) => (
        <div key={c._id} className="flex gap-3">
          <Avatar user={c.author} size={8} />
          <div className="min-w-0 flex-1">
            <div className="text-sm"><b>{c.author?.name}</b> <span className="text-xs text-slate-400">{fmtDateTime(c.createdAt)}</span>{(isAdmin || c.author?._id === me) && canEdit && <button className="ml-2 text-xs text-slate-400 hover:text-red-600" onClick={() => del(c._id)}>delete</button>}</div>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700"><Mentions text={c.body} members={members} /></p>
          </div>
        </div>
      ))}
      {canEdit && <div className="space-y-2"><MentionTextarea rows={3} placeholder="Write a comment… use @name to mention a teammate" value={body} members={members} onChange={setBody} /><button className="btn-primary" onClick={post}>Comment</button></div>}
    </div>
  );
}

function ActivityLog({ url, tick }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`${url}/activity`).then((r) => setItems(r.data.activity)).catch(() => setItems([])); }, [url, tick]);
  if (!items) return <Loading variant="inline" />;
  if (!items.length) return <p className="text-sm text-slate-400">No activity yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a._id} className="flex gap-2 text-sm">
          <Avatar user={a.actor} size={6} />
          <div>
            <b>{a.actor?.name}</b>{' '}
            {activityText(a)}
            <div className="text-xs text-slate-400">{fmtDateTime(a.createdAt)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
