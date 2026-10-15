import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { COLORS, fmtDate } from '../lib/constants.js';
import { Avatar, Badge, Loading, PriorityTag, ProjectStatusTag } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import NotFound from './NotFound.jsx';
import { useCrumb } from '../components/AppShell.jsx';
import TaskBrowser from '../components/TaskBrowser.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import SprintsPanel from '../components/SprintsPanel.jsx';
import Timeline from '../components/Timeline.jsx';
import TaskModal from '../components/TaskModal.jsx';
import PresenceBar from '../components/PresenceBar.jsx';
import { useRoom, useSocketEvent, useViewing, useDebouncedCallback } from '../lib/realtime.js';
import { ProjectForm } from './ProjectsPage.jsx';

export default function ProjectPage() {
  const { projectId } = useParams();
  const { workspace } = useWorkspace();
  const navigate = useNavigate(); // eslint-disable-line no-unused-vars
  const [sp, setSp] = useSearchParams();
  const tab = ['activity', 'sprints', 'timeline'].includes(sp.get('tab')) ? sp.get('tab') : 'tasks';
  const openId = sp.get('task');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try { setData((await api.get(`/workspaces/${workspace._id}/projects/${projectId}`)).data); }
    catch (e) { setError(errMsg(e)); }
  }, [workspace._id, projectId]);
  useEffect(() => { setData(null); load(); }, [load]);

  // live: project room (task / sprint / timeline events) + presence
  useRoom('project', projectId);
  useViewing('projectId', projectId);
  const liveStats = useDebouncedCallback(load, 500);
  useSocketEvent('project:changed', (e) => { if (e.projectId === projectId) liveStats(); });
  const openTask = (id) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('task', id); return n; });
  const closeTask = () => setSp((prev) => { const n = new URLSearchParams(prev); n.delete('task'); return n; });

  useCrumb(data?.project.name);
  if (error) return <NotFound title="Project not found" message={error} showPath={false} to={`/w/${workspace._id}`} toLabel="Back to projects" />;
  if (!data) return <Loading />;
  const p = data.project;
  const s = p.stats;
  const setTab = (t) => setSp((prev) => { const n = new URLSearchParams(prev); t === 'tasks' ? n.delete('tab') : n.set('tab', t); return n; }, { replace: true });

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">{p.name}</h1>
            <ProjectStatusTag value={p.status} />
            <PriorityTag value={p.priority} />
            {p.archived && <Badge cls="bg-slate-200 text-slate-600">Archived</Badge>}
          </div>
          {data.canManage && <button className="btn-secondary" onClick={() => setEditing(true)}>Edit project</button>}
        </div>
        {p.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{p.description}</p>}
        <div className="mt-2"><PresenceBar projectId={projectId} label="Viewing this project" /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-2 flex items-end justify-between"><span className="text-sm font-medium">Completion</span><span className="text-2xl font-medium text-brand-600">{s.completion}%</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500 transition-all" style={{ width: `${s.completion}%` }} /></div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            <div><div className="text-2xl font-medium">{s.total}</div><div className="text-xs text-slate-500">Total tasks</div></div>
            {s.columns.map((c) => (
              <div key={c.key}>
                <div className="text-2xl font-medium">{c.count}</div>
                <div className="flex items-center gap-1 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${COLORS[c.color]?.dot || 'bg-slate-400'}`} />{c.name}</div>
              </div>
            ))}
          </div>
          {s.overdue > 0 && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-600"><Icon name="triangle-alert" size={14} />{s.overdue} overdue task{s.overdue > 1 ? 's' : ''}</p>}
        </div>
        <div className="card space-y-3 p-4 text-sm">
          <div><div className="text-xs text-slate-500">Deadline</div>{p.deadline ? fmtDate(p.deadline) : '—'}</div>
          <div><div className="mb-1 text-xs text-slate-500">Owner</div><div className="flex items-center gap-2"><Avatar user={p.owner} size={7} />{p.owner?.name}</div></div>
          <div><div className="mb-1 text-xs text-slate-500">Team</div>{p.members.length ? <div className="flex flex-wrap gap-1">{p.members.map((m) => <Avatar key={m._id} user={m} size={7} />)}</div> : '—'}</div>
        </div>
      </div>

      <div className="flex gap-5 border-b border-slate-200 text-sm">
        {[['tasks', 'Tasks'], ['sprints', 'Sprints & backlog'], ['timeline', 'Timeline'], ['activity', 'Activity']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`-mb-px border-b-2 pb-2 font-medium ${tab === id ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
        ))}
      </div>

      {tab === 'tasks' && <TaskBrowser project={{ ...p, canManage: data.canManage }} onChanged={load} />}
      {tab === 'sprints' && <SprintsPanel project={p} onOpen={openTask} onChanged={load} />}
      {tab === 'timeline' && <Timeline project={p} onOpen={openTask} onChanged={load} />}
      {tab === 'activity' && <ActivityFeed projectId={p._id} />}
      {openId && tab !== 'tasks' && <TaskModal key={openId} taskId={openId} onClose={closeTask} onChanged={load} onOpenTask={openTask} />}
      {editing && <ProjectForm project={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}
