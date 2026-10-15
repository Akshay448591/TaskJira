import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { fmtDate, todayKey } from '../lib/constants.js';
import { useDebouncedCallback, useSocketEvent } from '../lib/realtime.js';
import { Alert, Select, Spinner } from '../components/ui.jsx';
import { Bar, BarChart, LineChart } from '../components/Charts.jsx';

const ago = (n) => { const d = new Date(`${todayKey()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const PRESETS = [['7 days', 6], ['30 days', 29], ['90 days', 89], ['12 months', 364]];
const EXPORTS = [['tasks', 'Tasks (created in range)'], ['workload', 'Workload by member'], ['projects', 'Project progress'], ['trends', 'Completion trend'], ['velocity', 'Sprint velocity']];

function Kpi({ label, value, hint, tone = '' }) {
  return <div className="card p-4"><div className="text-xs text-slate-500">{label}</div><div className={`text-3xl font-medium ${tone}`}>{value}</div>{hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}</div>;
}

export default function AnalyticsPage() {
  const { workspace } = useWorkspace();
  const [sp, setSp] = useSearchParams();
  const project = sp.get('project') || '';
  const from = sp.get('from') || ago(29);
  const to = sp.get('to') || todayKey();
  const sprint = sp.get('sprint') || '';
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('points');
  const w = `/workspaces/${workspace._id}`;
  const set = (patch) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); if ('project' in patch) n.delete('sprint'); return n; }, { replace: true });

  useEffect(() => { api.get(`${w}/projects`).then((r) => setProjects(r.data.projects)).catch(() => {}); }, [w]);
  const load = useCallback(async () => {
    try { setData((await api.get(`${w}/analytics`, { params: { project: project || undefined, from, to, sprint: sprint || undefined } })).data); setError(''); }
    catch (e) { setError(errMsg(e)); setData(null); }
  }, [w, project, from, to, sprint]);
  useEffect(() => { load(); }, [load]);
  const live = useDebouncedCallback(load, 800); // numbers update as the team works
  useSocketEvent('task:changed', live);
  useSocketEvent('project:changed', live);

  const exportCsv = async (type) => {
    await api.get('/auth/me'); // refresh the cookie first: a plain navigation cannot retry
    const q = new URLSearchParams({ type, from, to, ...(project ? { project } : {}), ...(sprint ? { sprint } : {}) });
    window.location.href = `/api${w}/analytics/export?${q}`;
  };

  const k = data?.kpis;
  const bd = data?.burndown && (metric === 'tasks' ? data.burndown.tasks : data.burndown);
  const maxOpen = Math.max(1, ...(data?.workload || []).map((x) => x.open));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="page-title">Analytics & reports</h1><p className="text-sm text-slate-500">{fmtDate(from)} → {fmtDate(to)}{data && data.trends.length > 92 ? ' · weekly buckets' : ''}</p></div>
        <div className="relative">
          <details className="group"><summary className="btn-secondary cursor-pointer list-none"><Icon name="download" size={14} />Export CSV</summary>
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-slate-200 bg-white py-1 shadow-pop">{EXPORTS.map(([t, l]) => <button key={t} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => exportCsv(t)}>{l}</button>)}</div>
          </details>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div className="w-48"><label className="text-xs text-slate-500">Project</label><Select options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p._id, label: p.name }))]} value={project} onChange={(v) => set({ project: v })} /></div>
        <div><label className="text-xs text-slate-500">From</label><input type="date" className="input" value={from} max={to} onChange={(e) => e.target.value && set({ from: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">To</label><input type="date" className="input" value={to} min={from} max={todayKey()} onChange={(e) => e.target.value && set({ to: e.target.value })} /></div>
        <div className="flex gap-1">{PRESETS.map(([l, n]) => <button key={l} className="btn-secondary !px-2 !py-1.5 text-xs" onClick={() => set({ from: ago(n), to: todayKey() })}>{l}</button>)}</div>
      </div>
      <Alert>{error}</Alert>
      {!data ? (error ? null : <Spinner />) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Tasks created" value={k.created} hint="created in the range" />
            <Kpi label="Completion rate" value={`${k.completionRate}%`} hint={`${k.completed} of ${k.created} created tasks are done`} tone="text-green-600" />
            <Kpi label="Overdue rate" value={`${k.overdueRate}%`} hint={`${k.overdue} created in range are overdue now`} tone={k.overdue ? 'text-red-600' : ''} />
            <Kpi label="On-time delivery" value={`${k.onTimeRate}%`} hint="finished on or before the due date" />
            <Kpi label="Completed in range" value={k.completedInRange} hint="finished in the range, whenever created" />
            <Kpi label="Open now" value={k.openNow} hint="all open tasks (snapshot)" />
            <Kpi label="Overdue now" value={k.overdueNow} hint="all open tasks past their due date" tone={k.overdueNow ? 'text-red-600' : ''} />
            <Kpi label="Avg. sprint velocity" value={data.averageVelocity} hint={`${data.velocity.length} sprint(s) completed in range`} />
          </div>

          <section className="card p-4"><h2 className="mb-2 font-medium">Completion trend</h2>
            <LineChart labels={data.trends.map((t) => t.date)} series={[{ name: 'Created', color: '#1F3A68', values: data.trends.map((t) => t.created) }, { name: 'Completed', color: '#3E8463', values: data.trends.map((t) => t.completed) }, { name: 'Open at end of day', color: '#A76F1B', dashed: true, values: data.trends.map((t) => t.open) }]} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-4"><h2 className="mb-3 font-medium">Workload by team member</h2>
              {data.workload.length === 0 ? <p className="text-sm text-slate-400">No tasks.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="pb-1">Member</th><th>Open</th><th>Overdue</th><th>Pts</th><th>Done in range</th></tr></thead>
                  <tbody>{data.workload.map((r) => <tr key={r.userId || 'none'} className="border-t border-slate-100"><td className="py-2 pr-2">{r.name}<Bar value={r.open} max={maxOpen} className="mt-1" color={r.overdue ? 'bg-red-400' : 'bg-brand-500'} /></td><td>{r.open}</td><td className={r.overdue ? 'font-medium text-red-600' : ''}>{r.overdue}</td><td>{r.openPoints}</td><td>{r.completedInRange}</td></tr>)}</tbody></table>
              )}
            </section>
            <section className="card p-4"><h2 className="mb-3 font-medium">Project progress</h2>
              {data.projects.length === 0 ? <p className="text-sm text-slate-400">No projects.</p> : data.projects.map((p) => (
                <div key={p.projectId} className="mb-3 last:mb-0"><div className="flex justify-between text-sm"><span className="font-medium">{p.name}{p.archived ? ' (archived)' : ''}</span><span>{p.completion}% · {p.done}/{p.total}{p.overdue ? <span className="text-red-600"> · {p.overdue} overdue</span> : null}</span></div><Bar value={p.done} max={p.total} color="bg-green-500" className="mt-1" /></div>
              ))}
            </section>
          </div>

          <section className="card p-4"><h2 className="mb-1 font-medium">Sprint velocity</h2>
            {data.velocity.length === 0 ? <p className="text-sm text-slate-400">No sprint was completed in this range.</p> : (
              <BarChart groups={data.velocity.map((v) => ({ label: v.name, bars: [{ name: 'Committed pts', color: '#D3CFC7', value: v.committed }, { name: 'Completed pts', color: '#1F3A68', value: v.completed }] }))} />
            )}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">Sprint burndown{data.burnSprint ? ` · ${data.burnSprint.name}` : ''}</h2>
              {project && data.sprints.length > 0 && (
                <div className="flex items-center gap-2"><div className="w-44"><Select options={data.sprints.map((s) => ({ value: s._id, label: `${s.name} (${s.status})` }))} value={sprint || data.burnSprint?._id || ''} onChange={(v) => set({ sprint: v })} /></div>
                  <div className="flex gap-1 text-xs">{['points', 'tasks'].map((m) => <button key={m} onClick={() => setMetric(m)} className={`rounded px-2 py-1 ${metric === m ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>{m}</button>)}</div></div>
              )}
            </div>
            {!project ? <p className="text-sm text-slate-400">Pick a project above to see its sprint burndown.</p> : !bd?.started ? <p className="text-sm text-slate-400">No sprint has been started in this project yet.</p> : (
              <>
                {data.burnSprint?.goal && <p className="mb-1 text-sm text-slate-600"><b>Goal:</b> {data.burnSprint.goal}</p>}
                <LineChart labels={bd.days.map((d) => d.date)} series={[{ name: 'Ideal', color: '#8C867B', dashed: true, values: bd.days.map((d) => d.ideal) }, { name: `Remaining ${metric}`, color: '#1F3A68', values: bd.days.map((d) => d.actual) }]} />
                <p className="text-xs text-slate-400">Committed {bd.committed} {metric} · remaining {bd.remaining}</p>
              </>
            )}
          </section>
          <p className="text-xs text-slate-400">Definitions: rates use the tasks <b>created</b> in the range; “done” means sitting in a Done-category column of the task’s project; overdue = open and past the due date; workload, open and overdue-now are live snapshots. Subtasks are not counted.</p>
        </>
      )}
    </div>
  );
}
