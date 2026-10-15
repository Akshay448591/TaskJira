import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { Alert, Field } from '../components/ui.jsx';

export default function WorkspaceSettings() {
  const { workspace, setWorkspace, role } = useWorkspace();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: workspace.name, description: workspace.description || '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/workspaces/${workspace._id}`, form);
      setWorkspace(data.workspace);
      setMsg('Saved'); setError('');
    } catch (x) { setError(errMsg(x)); setMsg(''); }
  };
  const del = async () => {
    if (!window.confirm(`Delete "${workspace.name}" and ALL its projects and tasks? This cannot be undone.`)) return;
    try { await api.delete(`/workspaces/${workspace._id}`); navigate('/'); }
    catch (x) { setError(errMsg(x)); }
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="page-title">Workspace settings</h1>
      <form onSubmit={save} className="card space-y-4 p-5">
        <Alert>{error}</Alert><Alert tone="success">{msg}</Alert>
        <Field label="Name"><input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <button className="btn-primary">Save</button>
      </form>
      {role === 'owner' && (
        <div className="card border-red-200 p-5">
          <h2 className="font-medium text-red-700">Danger zone</h2>
          <p className="my-2 text-sm text-slate-600">Deleting a workspace removes all projects, tasks, comments and attachments.</p>
          <button className="btn-danger" onClick={del}>Delete workspace</button>
        </div>
      )}
    </div>
  );
}
