import { useEffect, useState } from 'react';
import { DUE_OPTIONS, PRIORITIES } from '../lib/constants.js';
import { Select } from './ui.jsx';

export default function FilterBar({ q, members, projects, statusOptions, labels, hideStatus, hideDue }) {
  const [text, setText] = useState(q.filters.q);
  useEffect(() => setText(q.filters.q), [q.filters.q]); // keep in sync when a saved view / link changes the URL
  useEffect(() => {
    const t = setTimeout(() => text !== q.filters.q && q.set({ q: text }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const f = q.filters;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input !w-56" placeholder="Search tasks, #number, label…" value={text} onChange={(e) => setText(e.target.value)} />
      {projects && <div className="w-40"><Select options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p._id, label: p.name }))]} value={f.project} onChange={(v) => q.set({ project: v, status: '' })} /></div>}
      {!hideStatus && <div className="w-36"><Select options={[{ value: '', label: 'Any status' }, ...statusOptions]} value={f.status} onChange={(v) => q.set({ status: v })} /></div>}
      <div className="w-32"><Select options={[{ value: '', label: 'Any priority' }, ...PRIORITIES]} value={f.priority} onChange={(v) => q.set({ priority: v })} /></div>
      <div className="w-40"><Select options={[{ value: '', label: 'Any assignee' }, { value: 'me', label: 'Assigned to me' }, { value: 'none', label: 'Unassigned' }, ...members.map((m) => ({ value: m.user._id, label: m.user.name }))]} value={f.assignee} onChange={(v) => q.set({ assignee: v })} /></div>
      <div className="w-32"><Select options={[{ value: '', label: 'Any label' }, ...labels.map((l) => ({ value: l, label: l }))]} value={f.label} onChange={(v) => q.set({ label: v })} /></div>
      {!hideDue && <div className="w-36"><Select options={DUE_OPTIONS} value={f.due} onChange={(v) => q.set({ due: v })} /></div>}
      {q.activeCount > 0 && <button className="btn-ghost text-xs" onClick={q.clear}>Clear filters ({q.activeCount})</button>}
    </div>
  );
}
