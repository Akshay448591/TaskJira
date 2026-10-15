import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { atLeast } from '../lib/constants.js';
import { SAVED_KEYS } from '../lib/useTaskQuery.js';
import { Alert, Modal } from './ui.jsx';

// Saved filters + views (personal or shared with the workspace) and "copy shareable link".
export default function SavedViews({ q, view, projectId }) {
  const { workspace, role } = useWorkspace();
  const { user } = useAuth();
  const base = `/workspaces/${workspace._id}/views`;
  const [views, setViews] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', shared: false });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const box = useRef();

  const load = useCallback(async () => {
    try { setViews((await api.get(base, { params: projectId ? { project: projectId } : {} })).data.views); } catch { /* ignore */ }
  }, [base, projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const apply = (v) => {
    q.set({ ...Object.fromEntries(SAVED_KEYS.map((k) => [k, ''])), ...v.query, view: v.view, task: '', m: '' });
    setOpen(false);
  };
  const save = async (e) => {
    e.preventDefault();
    const query = Object.fromEntries(SAVED_KEYS.map((k) => [k, k === 'sort' ? q.sp.get('sort') || '' : k === 'dir' ? q.sp.get('dir') || '' : q.filters[k]]));
    try {
      await api.post(base, { name: form.name, view, project: projectId || null, query, shared: form.shared });
      setSaving(false); setForm({ name: '', shared: false }); setError(''); load();
    } catch (x) { setError(errMsg(x)); }
  };
  const del = async (v) => {
    if (!window.confirm(`Delete saved view "${v.name}"?`)) return;
    try { await api.delete(`${base}/${v._id}`); load(); } catch (x) { setError(errMsg(x)); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { window.prompt('Copy this link', window.location.href); }
  };

  return (
    <div className="relative flex gap-2" ref={box}>
      <button className="btn-secondary" onClick={() => setOpen((o) => !o)}><Icon name="star" size={14} />Saved views{views.length ? ` (${views.length})` : ''}</button>
      <button className="btn-secondary" onClick={copy} title="Copy a link to this exact view">{copied ? <Icon name="check" size={14} /> : <Icon name="link" size={14} />}{copied ? 'Copied' : 'Copy link'}</button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 shadow-pop">
          {views.length === 0 && <p className="px-2 py-2 text-sm text-slate-400">No saved views yet.</p>}
          {views.map((v) => (
            <div key={v._id} className="flex items-center gap-1 rounded px-2 py-1.5 hover:bg-slate-50">
              <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => apply(v)}>
                {v.name} <span className="text-xs text-slate-400">· {v.view}{v.shared ? ' · shared' : ''}</span>
              </button>
              {(v.owner?._id === user._id || atLeast(role, 'admin')) && <button className="text-slate-400 hover:text-red-600" aria-label="Delete saved view" onClick={() => del(v)}><Icon name="x" size={14} /></button>}
            </div>
          ))}
          <button className="btn-primary mt-2 w-full" onClick={() => { setSaving(true); setOpen(false); }}>Save current view…</button>
        </div>
      )}
      {saving && (
        <Modal title="Save current view" onClose={() => setSaving(false)}>
          <form onSubmit={save} className="space-y-4">
            <Alert>{error}</Alert>
            <input className="input" autoFocus required maxLength={60} placeholder="e.g. My urgent tasks" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <p className="text-xs text-slate-500">Saves the {view} view with the current search, filters and sorting.</p>
            {atLeast(role, 'member') && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} /> Share with everyone in this workspace</label>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setSaving(false)}>Cancel</button><button className="btn-primary">Save view</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
