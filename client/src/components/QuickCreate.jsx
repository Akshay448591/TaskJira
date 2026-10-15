import { useEffect, useRef, useState } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { PRIORITIES } from '../lib/constants.js';
import { Alert, Modal, Select } from './ui.jsx';

// Fast capture: C anywhere (or the sidebar button). "Create" keeps the dialog open for rapid entry.
export default function QuickCreate({ onClose }) {
  const { workspace, members } = useWorkspace();
  const navigate = useNavigate();
  const match = useMatch('/w/:workspaceId/projects/:projectId');
  const lastKey = `tj:lastProject:${workspace._id}`;
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ title: '', project: match?.params.projectId || localStorage.getItem(lastKey) || '', priority: 'medium', assignee: '', dueDate: '' });
  const [error, setError] = useState('');
  const [made, setMade] = useState(null);
  const title = useRef();

  useEffect(() => {
    api.get(`/workspaces/${workspace._id}/projects`).then((r) => {
      setProjects(r.data.projects);
      setForm((f) => (r.data.projects.some((p) => p._id === f.project) ? f : { ...f, project: r.data.projects[0]?._id || '' }));
    }).catch((e) => setError(errMsg(e)));
  }, [workspace._id]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const create = async (openAfter) => {
    if (!form.title.trim() || !form.project) return;
    try {
      const { data } = await api.post(`/workspaces/${workspace._id}/tasks`, { ...form, assignee: form.assignee || null, dueDate: form.dueDate || null });
      localStorage.setItem(lastKey, form.project);
      if (openAfter) { onClose(); navigate(`/w/${workspace._id}/projects/${form.project}?task=${data.task._id}`); return; }
      setMade(data.task); setError(''); setForm((f) => ({ ...f, title: '' })); title.current?.focus();
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <Modal title="Quick create task" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create(false); }} className="space-y-3">
        <Alert>{error}</Alert>
        {made && <Alert tone="success">Created #{made.number} “{made.title}” · <Link className="underline" onClick={onClose} to={`/w/${workspace._id}/projects/${form.project}?task=${made._id}`}>open</Link></Alert>}
        <input ref={title} className="input" autoFocus required placeholder="What needs to be done?" value={form.title} onChange={(e) => set('title')(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select options={projects.filter((p) => !p.archived).map((p) => ({ value: p._id, label: p.name }))} value={form.project} onChange={set('project')} />
          <Select options={PRIORITIES} value={form.priority} onChange={set('priority')} />
          <Select options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.user._id, label: m.user.name }))]} value={form.assignee} onChange={set('assignee')} />
          <input type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Enter = create & keep going</span>
          <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => create(true)}>Create & open</button><button className="btn-primary" disabled={!form.project}>Create</button></div>
        </div>
      </form>
    </Modal>
  );
}
