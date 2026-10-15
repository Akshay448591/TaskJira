import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { ROLE_RANK, atLeast, fmtDate } from '../lib/constants.js';
import { Alert, Avatar, Badge, Field } from '../components/ui.jsx';

const ROLE_OPTS = ['admin', 'member', 'viewer'];

export default function MembersPage() {
  const { user } = useAuth();
  const { workspace, role, members, reloadMembers } = useWorkspace();
  const navigate = useNavigate();
  const base = `/workspaces/${workspace._id}`;
  const isAdmin = atLeast(role, 'admin');
  const [invites, setInvites] = useState([]);
  const [form, setForm] = useState({ email: '', role: 'member' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const loadInvites = useCallback(async () => {
    if (!isAdmin) return;
    try { setInvites((await api.get(`${base}/invitations`)).data.invitations); } catch (e) { setError(errMsg(e)); }
  }, [base, isAdmin]);
  useEffect(() => { loadInvites(); }, [loadInvites]);

  const run = async (fn, ok) => {
    setError(''); setMsg('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setError(errMsg(e)); }
  };
  const invite = (e) => { e.preventDefault(); run(async () => { await api.post(`${base}/invitations`, form); setForm({ ...form, email: '' }); await loadInvites(); }, 'Invitation sent'); };
  const revoke = (id) => run(async () => { await api.delete(`${base}/invitations/${id}`); await loadInvites(); }, 'Invitation revoked');
  const changeRole = (uid, r) => run(async () => { await api.patch(`${base}/members/${uid}`, { role: r }); await reloadMembers(); }, 'Role updated');
  const remove = (m) => {
    const self = m.user._id === user._id;
    if (!window.confirm(self ? 'Leave this workspace?' : `Remove ${m.user.name} from the workspace?`)) return;
    run(async () => { await api.delete(`${base}/members/${m.user._id}`); if (self) navigate('/'); else await reloadMembers(); }, self ? '' : 'Member removed');
  };
  // you can manage only people ranked strictly below you
  const canManage = (m) => isAdmin && ROLE_RANK[m.role] < ROLE_RANK[role];
  const grantable = ROLE_OPTS.filter((r) => ROLE_RANK[r] < ROLE_RANK[role]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Members</h1>
      <Alert>{error}</Alert><Alert tone="success">{msg}</Alert>

      {isAdmin && (
        <form onSubmit={invite} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1"><Field label="Invite by email"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="teammate@company.com" /></Field></div>
          <div className="w-36"><Field label="Role"><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{grantable.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field></div>
          <button className="btn-primary">Send invite</button>
        </form>
      )}

      <div className="card divide-y divide-slate-100">
        {members.map((m) => (
          <div key={m.user._id} className="flex flex-wrap items-center gap-3 p-4">
            <Avatar user={m.user} size={9} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{m.user.name} {m.user._id === user._id && <span className="text-xs text-slate-400">(you)</span>}</div>
              <div className="truncate text-xs text-slate-500">{m.user.email} · joined {fmtDate(m.joinedAt)}</div>
            </div>
            {canManage(m) ? (
              <select className="input !w-28" value={m.role} onChange={(e) => changeRole(m.user._id, e.target.value)}>
                {grantable.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : <Badge cls="bg-brand-50 text-brand-700 capitalize">{m.role}</Badge>}
            {canManage(m) && <button className="btn-ghost text-red-600" onClick={() => remove(m)}>Remove</button>}
            {m.user._id === user._id && m.role !== 'owner' && <button className="btn-ghost text-red-600" onClick={() => remove(m)}>Leave</button>}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div>
          <h2 className="mb-2 font-medium">Pending invitations</h2>
          {invites.length === 0 ? <p className="text-sm text-slate-500">No pending invitations.</p> : (
            <div className="card divide-y divide-slate-100">
              {invites.map((i) => (
                <div key={i._id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div><b>{i.email}</b> as <span className="capitalize">{i.role}</span> <span className="text-slate-400">· invited by {i.invitedBy?.name} · expires {fmtDate(i.expiresAt)}</span></div>
                  <button className="btn-ghost text-red-600" onClick={() => revoke(i._id)}>Revoke</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card p-4 text-sm text-slate-600">
        <div className="mb-1 font-medium text-slate-800">What each role can do</div>
        <b>Owner</b> – everything, including deleting the workspace. <b>Admin</b> – manage members, invites, all projects and tasks. <b>Member</b> – create projects, create/edit tasks and comment. <b>Viewer</b> – read-only.
      </div>
    </div>
  );
}
