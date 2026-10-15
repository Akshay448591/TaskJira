import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { PRIORITIES, PROJECT_STATUSES, atLeast, fmtDate, isOverdue, lookup, toInputDate } from '../lib/constants.js';
import { Alert, Avatar, Badge, Empty, Field, Loading, Modal, PriorityTag, ProjectStatusTag, Select, Spinner } from '../components/ui.jsx';
import { useDebouncedCallback, useSocketEvent } from '../lib/realtime.js';

export function ProjectForm({ project, onClose, onSaved }) {
  const { workspace, members, role } = useWorkspace();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: project?.name || '', description: project?.description || '', status: project?.status || 'planning',
    priority: project?.priority || 'medium', deadline: toInputDate(project?.deadline),
    owner: project?.owner?._id || user._id, members: (project?.members || []).map((m) => m._id),
  });
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const toggle = (id) => setForm({ ...form, members: form.members.includes(id) ? form.members.filter((x) => x !== id) : [...form.members, id] });

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...form, deadline: form.deadline || null };
    try {
      const url = `/workspaces/${workspace._id}/projects`;
      if (project) await api.patch(`${url}/${project._id}`, body); else await api.post(url, body);
      onSaved();
    } catch (x) { setError(errMsg(x)); }
  };
  const ownerLocked = project && !atLeast(role, 'admin');

  return (
    <Modal title={project ? 'Edit project' : 'New project'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Name"><input className="input" required minLength={2} autoFocus value={form.name} onChange={(e) => set('name')(e.target.value)} /></Field>
        <Field label="Description"><textarea className="input" rows={3} value={form.description} onChange={(e) => set('description')(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status"><Select options={PROJECT_STATUSES} value={form.status} onChange={set('status')} /></Field>
          <Field label="Priority"><Select options={PRIORITIES} value={form.priority} onChange={set('priority')} /></Field>
          <Field label="Deadline"><input type="date" className="input" value={form.deadline} onChange={(e) => set('deadline')(e.target.value)} /></Field>
          <Field label="Project owner"><Select disabled={ownerLocked} options={members.map((m) => ({ value: m.user._id, label: m.user.name }))} value={form.owner} onChange={set('owner')} /></Field>
        </div>
        <Field label="Team members">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {members.filter((m) => m.user._id !== form.owner).map((m) => (
              <label key={m.user._id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.members.includes(m.user._id)} onChange={() => toggle(m.user._id)} />{m.user.name} <span className="text-xs text-slate-400">{m.user.email}</span></label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary">{project ? 'Save' : 'Create project'}</button></div>
      </form>
    </Modal>
  );
}

export default function ProjectsPage() {
  const { workspace, role } = useWorkspace();
  const { user } = useAuth();
  const base = `/workspaces/${workspace._id}/projects`;
  const [projects, setProjects] = useState(null);
  const [archived, setArchived] = useState(false);
  const [sp, setSp] = useSearchParams();
  const [editing, setEditing] = useState(sp.get('new') ? 'new' : null); // null | 'new' | project (?new=1 comes from the command palette)
  const closeForm = () => { setEditing(null); if (sp.get('new')) setSp({}, { replace: true }); };
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setProjects((await api.get(base, { params: { archived } })).data.projects); } catch (e) { setError(errMsg(e)); }
  }, [base, archived]);
  useEffect(() => { setProjects(null); load(); }, [load]);
  const live = useDebouncedCallback(load, 500); // another teammate created/changed a project or task
  useSocketEvent('project:changed', live);
  useSocketEvent('task:changed', live);

  const canManage = (p) => atLeast(role, 'admin') || p.owner?._id === user._id;
  const act = async (fn) => { try { await fn(); load(); } catch (e) { setError(errMsg(e)); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Projects</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived</label>
          {atLeast(role, 'member') && <button className="btn-secondary" onClick={() => setEditing('new')}><Icon name="plus" size={14} />New project</button>}
        </div>
      </div>
      <Alert>{error}</Alert>
      {!projects ? <Loading variant="cards" /> : projects.length === 0 ? <Empty icon="folder" title={archived ? 'No archived projects' : 'No projects yet'}>{archived ? 'Archived projects will show up here.' : 'Create a project to start planning work with your team.'}</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <div key={p._id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/w/${workspace._id}/projects/${p._id}`} className="font-medium hover:text-brand-600">{p.name}</Link>
                <ProjectStatusTag value={p.status} />
              </div>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">{p.description || 'No description'}</p>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{p.stats.done}/{p.stats.total} tasks done</span><span>{p.stats.completion}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${p.stats.completion}%` }} /></div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1"><Avatar user={p.owner} size={6} title={`Owner: ${p.owner?.name}`} />{p.members.length > 0 && <span>+{p.members.length}</span>}</div>
                <div className="flex items-center gap-2"><PriorityTag value={p.priority} /><span className={isOverdue(p.deadline, p.status === 'completed' ? 'done' : '') ? 'text-red-600' : ''}>{p.deadline ? `Due ${fmtDate(p.deadline)}` : 'No deadline'}</span></div>
              </div>
              {canManage(p) && (
                <div className="mt-3 flex gap-1 border-t border-slate-100 pt-3">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(p)}>Edit</button>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => act(() => api.post(`${base}/${p._id}/${p.archived ? 'unarchive' : 'archive'}`))}>{p.archived ? 'Unarchive' : 'Archive'}</button>
                  <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={() => window.confirm(`Delete "${p.name}" and all its tasks?`) && act(() => api.delete(`${base}/${p._id}`))}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <ProjectForm project={editing === 'new' ? null : editing} onClose={closeForm} onSaved={() => { closeForm(); load(); }} />}
    </div>
  );
}
