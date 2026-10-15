import { useState } from 'react';
import Icon from './Icon.jsx';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { CATEGORIES, COLORS, COLOR_NAMES, columnsOf } from '../lib/constants.js';
import { Alert, Modal } from './ui.jsx';

// Customize the workflow: rename, recolor, reorder, add and remove columns (states).
export default function ColumnsEditor({ project, onClose, onSaved }) {
  const { workspace } = useWorkspace();
  const counts = Object.fromEntries((project.stats?.columns || []).map((c) => [c.key, c.count]));
  const [cols, setCols] = useState(columnsOf(project).map((c) => ({ ...c })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const upd = (i, patch) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i, d) => setCols((cs) => { const n = [...cs]; const j = i + d; if (j < 0 || j >= n.length) return cs; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remove = (i) => {
    const c = cols[i];
    if (counts[c.key] && !window.confirm(`"${c.name}" has ${counts[c.key]} task(s). They will move to the first remaining ${c.category === 'done' ? 'Done' : 'open'} column. Continue?`)) return;
    setCols((cs) => cs.filter((_, j) => j !== i));
  };
  const add = () => setCols((cs) => [...cs, { name: '', color: 'slate', category: 'in_progress' }]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.put(`/workspaces/${workspace._id}/projects/${project._id}/columns`, { columns: cols.map((c) => ({ ...(c.key ? { key: c.key } : {}), name: c.name, color: c.color, category: c.category })) });
      onSaved();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal wide title="Customize workflow columns" onClose={onClose}>
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <p className="text-sm text-slate-500">Columns are the workflow states of this project. The <b>category</b> decides what counts towards completion: tasks in a <b>Done</b> column are finished.</p>
        {cols.map((c, i) => (
          <div key={c.key || `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
            <div className="flex flex-col"><button className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><Icon name="chevron-up" size={14} /></button><button className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === cols.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><Icon name="chevron-down" size={14} /></button></div>
            <input className="input !w-44" maxLength={30} placeholder="Column name" value={c.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <select className="input !w-36" value={c.category} onChange={(e) => upd(i, { category: e.target.value })}>{CATEGORIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
            <div className="flex gap-1">{COLOR_NAMES.map((n) => <button key={n} type="button" title={n} onClick={() => upd(i, { color: n })} className={`h-5 w-5 rounded-full ${COLORS[n].dot} ${c.color === n ? 'ring-2 ring-slate-800 ring-offset-1' : ''}`} />)}</div>
            <span className="ml-auto text-xs text-slate-400">{c.key && counts[c.key] ? `${counts[c.key]} tasks` : ''}</span>
            <button className="btn-ghost text-red-600 disabled:opacity-30" disabled={cols.length <= 2} onClick={() => remove(i)}>Remove</button>
          </div>
        ))}
        <div className="flex justify-between">
          <button className="btn-secondary" onClick={add} disabled={cols.length >= 12}><Icon name="plus" size={14} />Add column</button>
          <div className="flex gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save workflow'}</button></div>
        </div>
      </div>
    </Modal>
  );
}
