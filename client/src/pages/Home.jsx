import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { Alert, Badge, Empty, Field, Modal, Spinner } from '../components/ui.jsx';

export default function Home() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState(null);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = useCallback(async () => {
    try {
      const [w, i] = await Promise.all([api.get('/workspaces'), api.get('/invitations/mine')]);
      setWorkspaces(w.data.workspaces);
      setInvites(i.data.invitations);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/workspaces', form);
      navigate(`/w/${data.workspace._id}`);
    } catch (err) {
      setError(errMsg(err));
    }
  };
  const respond = async (id, action) => {
    try {
      const { data } = await api.post(`/invitations/${id}/${action}`);
      if (action === 'accept') navigate(`/w/${data.workspaceId}`);
      else load();
    } catch (err) {
      setError(errMsg(err));
      load();
    }
  };

  if (!workspaces) return <Spinner />;
  return (
    <div className="space-y-8">
      <Alert>{error}</Alert>
      {invites.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-medium">Pending invitations</h2>
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i._id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{i.workspace.name}</div>
                  <div className="text-sm text-slate-500">Invited by {i.invitedBy?.name} as <b>{i.role}</b></div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => respond(i._id, 'accept')}>Accept</button>
                  <button className="btn-secondary" onClick={() => respond(i._id, 'reject')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Your workspaces</h2>
          <button className="btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New workspace</button>
        </div>
        {workspaces.length === 0 ? (
          <Empty>You are not in any workspace yet. Create one to get started.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((w) => (
              <Link key={w._id} to={`/w/${w._id}`} className="card p-5 transition hover:border-slate-300">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{w.name}</h3>
                  <Badge cls="bg-brand-50 text-brand-700 capitalize">{w.role}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{w.description || 'No description'}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
      {creating && (
        <Modal title="New workspace" onClose={() => setCreating(false)}>
          <form onSubmit={create} className="space-y-4">
            <Field label="Name"><input className="input" required autoFocus minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn-primary">Create</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
