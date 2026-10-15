import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { activityText, fmtDateTime } from '../lib/constants.js';
import { Alert, Avatar, Empty, Select, Spinner } from './ui.jsx';

// "Who changed what, and when" for a project or the whole workspace.
export default function ActivityFeed({ projectId }) {
  const { workspace, members } = useWorkspace();
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [actor, setActor] = useState('');
  const [project, setProject] = useState('');
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { if (!projectId) api.get(`/workspaces/${workspace._id}/projects`, { params: { archived: 'false' } }).then((r) => setProjects(r.data.projects)).catch(() => {}); }, [workspace._id, projectId]);

  const load = useCallback(async (p, replace) => {
    try {
      const { data } = await api.get(`/workspaces/${workspace._id}/activity`, { params: { page: p, limit: 30, actor: actor || undefined, project: projectId || project || undefined } });
      setItems((cur) => (replace ? data.activity : [...(cur || []), ...data.activity]));
      setPages(data.pages); setPage(p); setError('');
    } catch (e) { setError(errMsg(e)); }
  }, [workspace._id, actor, project, projectId]);
  useEffect(() => { setItems(null); load(1, true); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="w-44"><Select options={[{ value: '', label: 'Everyone' }, ...members.map((m) => ({ value: m.user._id, label: m.user.name }))]} value={actor} onChange={setActor} /></div>
        {!projectId && <div className="w-44"><Select options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p._id, label: p.name }))]} value={project} onChange={setProject} /></div>}
      </div>
      <Alert>{error}</Alert>
      {!items ? <Spinner /> : items.length === 0 ? <Empty>No activity yet.</Empty> : (
        <div className="card divide-y divide-slate-100">
          {items.map((a) => (
            <div key={a._id} className="flex gap-3 p-3 text-sm">
              <Avatar user={a.actor} size={8} />
              <div className="min-w-0 flex-1">
                <div>
                  <b>{a.actor?.name || 'Someone'}</b> {activityText(a)}{' '}
                  {a.task && <Link className="font-medium text-brand-600 hover:underline" to={`/w/${workspace._id}/projects/${a.task.project}?task=${a.task._id}`}>#{a.task.number} {a.task.title}</Link>}
                </div>
                <div className="text-xs text-slate-400">{fmtDateTime(a.createdAt)}{a.project && !projectId && <> · <Link className="hover:underline" to={`/w/${workspace._id}/projects/${a.project._id}`}>{a.project.name}</Link></>}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {items && page < pages && <button className="btn-secondary w-full" onClick={() => load(page + 1, false)}>Load more</button>}
    </div>
  );
}
