import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { PRIORITIES, colInfo, fmtDate, lookup } from '../lib/constants.js';
import { Alert, Avatar, Badge, Empty, PriorityTag, Select, Spinner, StatusTag } from '../components/ui.jsx';

const TYPES = [{ id: '', label: 'All' }, { id: 'tasks', label: 'Tasks' }, { id: 'projects', label: 'Projects' }, { id: 'users', label: 'People' }, { id: 'comments', label: 'Comments' }];
const SORTS = [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'updated', label: 'Recently updated' }, { value: 'due', label: 'Due date' }];

function Hl({ text = '', q }) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-yellow-200 px-0.5">{p}</mark> : <span key={i}>{p}</span>));
}
const snippet = (text, q) => {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  const start = Math.max(0, i - 40);
  return (start > 0 ? '…' : '') + text.slice(start, start + 140) + (text.length > start + 140 ? '…' : '');
};

// Everything is in the URL (?q=&type=&sort=&priority=) so a search can be shared as a link.
export default function SearchPage() {
  const { workspace } = useWorkspace();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const type = sp.get('type') || '';
  const sort = sp.get('sort') || 'newest';
  const priority = sp.get('priority') || '';
  const [text, setText] = useState(q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const w = workspace._id;

  useEffect(() => setText(q), [q]);
  const set = (patch) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); return n; }, { replace: true });

  useEffect(() => {
    if (!q.trim()) { setData(null); return; }
    let alive = true;
    setLoading(true);
    api.get(`/workspaces/${w}/search`, { params: { q, types: type || undefined, limit: type ? 50 : 8, sort, priority: priority || undefined } })
      .then((r) => alive && (setData(r.data), setError('')))
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [w, q, type, sort, priority]);

  const total = data ? (data.tasks?.length || 0) + (data.projects?.length || 0) + (data.users?.length || 0) + (data.comments?.length || 0) : 0;
  const taskLink = (t) => `/w/${w}/projects/${t.project?._id || t.project}?task=${t._id || t.id}`;

  return (
    <div className="space-y-4">
      <h1 className="page-title">Search</h1>
      <form onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }} className="flex gap-2">
        <input className="input" autoFocus placeholder="Search tasks, projects, people and comments…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary">Search</button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5">{TYPES.map((t) => <button key={t.id} onClick={() => set({ type: t.id })} className={`rounded px-3 py-1.5 text-sm font-medium ${type === t.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t.label}</button>)}</div>
        <div className="w-44"><Select options={SORTS} value={sort} onChange={(v) => set({ sort: v === 'newest' ? '' : v })} /></div>
        <div className="w-36"><Select options={[{ value: '', label: 'Any priority' }, ...PRIORITIES]} value={priority} onChange={(v) => set({ priority: v })} /></div>
        <span className="text-xs text-slate-400">Priority filter and "Due date" sort apply to tasks.</span>
      </div>
      <Alert>{error}</Alert>
      {loading && !data ? <Spinner /> : !q.trim() ? <Empty>Type something to search. Tip: press <kbd className="rounded border px-1">⌘/Ctrl</kbd>+<kbd className="rounded border px-1">K</kbd> anywhere for the command palette.</Empty> : data && total === 0 ? <Empty>No results for “{q}”.</Empty> : data && (
        <div className="space-y-6">
          {data.tasks?.length > 0 && (
            <section><h2 className="mb-2 font-medium">Tasks ({data.tasks.length})</h2>
              <div className="card divide-y divide-slate-100">{data.tasks.map((t) => (
                <Link key={t._id} to={taskLink(t)} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                  <span className="text-xs text-slate-400">#{t.number}</span>
                  <span className="min-w-0 flex-1 truncate font-medium"><Hl text={t.title} q={q} /> <span className="font-normal text-slate-400">· {t.project?.name}</span></span>
                  <StatusTag col={colInfo(t.project, t.status)} />
                  <PriorityTag value={t.priority} />
                  {t.dueDate && <span className="text-xs text-slate-500">{fmtDate(t.dueDate)}</span>}
                </Link>))}</div></section>
          )}
          {data.projects?.length > 0 && (
            <section><h2 className="mb-2 font-medium">Projects ({data.projects.length})</h2>
              <div className="card divide-y divide-slate-100">{data.projects.map((p) => (
                <Link key={p._id} to={`/w/${w}/projects/${p._id}`} className="block p-3 hover:bg-slate-50"><div className="font-medium"><Hl text={p.name} q={q} />{p.archived && <Badge cls="ml-2 bg-slate-200 text-slate-600">Archived</Badge>}</div>{p.description && <div className="truncate text-sm text-slate-500">{p.description}</div>}</Link>))}</div></section>
          )}
          {data.users?.length > 0 && (
            <section><h2 className="mb-2 font-medium">People ({data.users.length})</h2>
              <div className="card divide-y divide-slate-100">{data.users.map((u) => (
                <Link key={u._id} to={`/w/${w}/tasks?assignee=${u._id}&view=list`} className="flex items-center gap-3 p-3 hover:bg-slate-50"><Avatar user={u} size={8} /><div className="flex-1"><div className="font-medium"><Hl text={u.name} q={q} /></div><div className="text-xs text-slate-500"><Hl text={u.email} q={q} /></div></div><Badge cls="bg-brand-50 text-brand-700 capitalize">{u.role}</Badge><span className="text-xs text-slate-400">View their tasks →</span></Link>))}</div></section>
          )}
          {data.comments?.length > 0 && (
            <section><h2 className="mb-2 font-medium">Comments ({data.comments.length})</h2>
              <div className="card divide-y divide-slate-100">{data.comments.map((c) => (
                <Link key={c._id} to={taskLink(c.task)} className="block p-3 hover:bg-slate-50"><div className="text-sm"><Hl text={snippet(c.body, q)} q={q} /></div><div className="mt-1 text-xs text-slate-400">{c.author?.name} on #{c.task.number} {c.task.title} · {fmtDate(c.createdAt)}</div></Link>))}</div></section>
          )}
        </div>
      )}
    </div>
  );
}
