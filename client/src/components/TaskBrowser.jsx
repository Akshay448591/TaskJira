import { useEffect, useMemo, useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { PRIORITIES, atLeast, columnsOf } from '../lib/constants.js';
import { useTaskQuery } from '../lib/useTaskQuery.js';
import { Alert, Field, Modal, Select } from './ui.jsx';
import Icon from './Icon.jsx';
import { toast } from '../lib/toast.jsx';
import FilterBar from './FilterBar.jsx';
import SavedViews from './SavedViews.jsx';
import ListView from './ListView.jsx';
import BoardView from './BoardView.jsx';
import CalendarView from './CalendarView.jsx';
import ColumnsEditor from './ColumnsEditor.jsx';
import TaskModal from './TaskModal.jsx';
import { useDebouncedCallback, useSocketEvent } from '../lib/realtime.js';

const TABS = [{ id: 'list', label: 'List', icon: 'list' }, { id: 'board', label: 'Board', icon: 'kanban' }, { id: 'calendar', label: 'Calendar', icon: 'calendar' }];

// Container for the List / Board / Calendar views. Used inside a project (project given) and for workspace-wide "All tasks".
export default function TaskBrowser({ project, onChanged }) {
  const { workspace, role, members } = useWorkspace();
  const base = `/workspaces/${workspace._id}`;
  const projectId = project?._id;
  const q = useTaskQuery({ defaultView: projectId ? 'board' : 'list' });
  const view = !projectId && q.view === 'board' ? 'list' : q.view; // boards are per project
  const [reload, setReload] = useState(0);
  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingCols, setEditingCols] = useState(false);
  const openId = q.sp.get('task');
  const canCreate = atLeast(role, 'member') && !project?.archived;

  useEffect(() => { if (!projectId) api.get(`${base}/projects`).then((r) => setProjects(r.data.projects)).catch(() => {}); }, [base, projectId]);
  useEffect(() => { api.get(`${base}/tasks/labels`, { params: projectId ? { project: projectId } : {} }).then((r) => setLabels(r.data.labels)).catch(() => {}); }, [base, projectId, reload]);

  const statusOptions = useMemo(() => {
    const cols = projectId ? columnsOf(project) : projects.flatMap((p) => columnsOf(p));
    const seen = new Map();
    for (const c of cols) if (!seen.has(c.key)) seen.set(c.key, { value: c.key, label: c.name });
    return [...seen.values()];
  }, [project, projectId, projects]);

  const open = (id) => q.set({ task: id }, { resetPage: false, replace: false });
  const close = () => q.set({ task: '' }, { resetPage: false });
  const changed = () => { setReload((r) => r + 1); onChanged?.(); };
  // live updates from teammates: refresh the views (bursts are coalesced)
  const live = useDebouncedCallback(changed, 400);
  useSocketEvent('task:changed', (e) => { if (!projectId || e.projectId === projectId) live(); });
  useSocketEvent('project:changed', (e) => { if (!projectId || e.projectId === projectId) live(); });

  const common = { q, projectId, reload, onOpen: open };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md bg-slate-100 p-0.5">
          {TABS.filter((t) => projectId || t.id !== 'board').map((t) => (
            <button key={t.id} onClick={() => q.set({ view: t.id, page: '' }, { resetPage: false })} className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${view === t.id ? 'bg-white text-slate-900 shadow-[0_0_0_1px_rgb(var(--c-slate-200))]' : 'text-slate-600 hover:text-slate-900'}`}><Icon name={t.icon} size={14} />{t.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedViews q={q} view={view} projectId={projectId} />
          {project && view === 'board' && project.canManage && <button className="btn-secondary" onClick={() => setEditingCols(true)}><Icon name="columns" size={14} />Columns</button>}
          {canCreate && <button className="btn-secondary" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New task</button>}
        </div>
      </div>

      <FilterBar q={q} members={members} projects={projectId ? null : projects} statusOptions={statusOptions} labels={labels} hideStatus={view === 'board'} hideDue={view === 'calendar'} />

      {view === 'list' && <ListView {...common} />}
      {view === 'board' && project && <BoardView {...common} project={project} onMutated={onChanged} />}
      {view === 'calendar' && <CalendarView {...common} projectArchived={project?.archived} />}

      {creating && <NewTask project={project} projects={projects} onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); changed(); toast.success('Task created'); open(t._id); }} />}
      {editingCols && <ColumnsEditor project={project} onClose={() => setEditingCols(false)} onSaved={() => { setEditingCols(false); changed(); }} />}
      {openId && <TaskModal key={openId} taskId={openId} onClose={close} onChanged={changed} onOpenTask={open} />}
    </div>
  );
}

function NewTask({ project, projects, onClose, onCreated }) {
  const { workspace, members } = useWorkspace();
  const [form, setForm] = useState({ title: '', description: '', project: project?._id || '', status: '', priority: 'medium', assignee: '', dueDate: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (!project && projects.length && !form.project) setForm((f) => ({ ...f, project: projects.find((p) => !p.archived)?._id || '' })); }, [project, projects, form.project]);
  const chosen = project || projects.find((p) => p._id === form.project);
  const cols = columnsOf(chosen);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/workspaces/${workspace._id}/tasks`, { ...form, status: form.status || undefined, assignee: form.assignee || null, dueDate: form.dueDate || null });
      onCreated(data.task);
    } catch (x) { setError(errMsg(x)); }
  };
  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Title"><input className="input" required autoFocus value={form.title} onChange={(e) => set('title')(e.target.value)} /></Field>
        {!project && <Field label="Project"><Select options={projects.filter((p) => !p.archived).map((p) => ({ value: p._id, label: p.name }))} value={form.project} onChange={(v) => setForm((f) => ({ ...f, project: v, status: '' }))} /></Field>}
        <Field label="Description"><textarea className="input" rows={3} value={form.description} onChange={(e) => set('description')(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status"><Select options={cols.map((c) => ({ value: c.key, label: c.name }))} value={form.status || cols[0].key} onChange={set('status')} /></Field>
          <Field label="Priority"><Select options={PRIORITIES} value={form.priority} onChange={set('priority')} /></Field>
          <Field label="Assignee"><Select options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.user._id, label: m.user.name }))]} value={form.assignee} onChange={set('assignee')} /></Field>
          <Field label="Due date"><input type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate')(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!form.project}>Create task</button></div>
      </form>
    </Modal>
  );
}
