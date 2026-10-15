import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { NOTIFICATION_TYPES, notifIcon, timeAgo } from '../lib/constants.js';
import { notifLink } from '../components/NotificationBell.jsx';
import { Alert, Empty, Select, Spinner } from '../components/ui.jsx';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [unread, setUnread] = useState(false);
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData((await api.get('/notifications', { params: { page, limit: 20, unread: unread || undefined, type: type || undefined } })).data); setError(''); }
    catch (e) { setError(errMsg(e)); }
  }, [page, unread, type]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => setPage(1), [unread, type]);

  const act = async (fn) => { try { await fn(); load(); } catch (e) { setError(errMsg(e)); } };
  const open = (n) => { if (!n.read) api.patch(`/notifications/${n._id}`, { read: true }).catch(() => {}); navigate(notifLink(n)); };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Notifications {data?.unreadCount > 0 && <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-sm text-white">{data.unreadCount}</span>}</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => act(() => api.post('/notifications/read-all', {}))}>Mark all read</button>
          <button className="btn-secondary" onClick={() => act(() => api.delete('/notifications'))}>Clear read</button>
          <Link to="/profile#notifications" className="btn-secondary">Preferences</Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
          {[[false, 'All'], [true, 'Unread']].map(([v, l]) => <button key={l} onClick={() => setUnread(v)} className={`rounded px-3 py-1.5 text-sm font-medium ${unread === v ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>{l}</button>)}
        </div>
        <div className="w-56"><Select options={[{ value: '', label: 'All types' }, ...NOTIFICATION_TYPES]} value={type} onChange={setType} /></div>
      </div>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : data.notifications.length === 0 ? <Empty>Nothing here.</Empty> : (
        <div className="card divide-y divide-slate-100">
          {data.notifications.map((n) => (
            <div key={n._id} className={`flex items-start gap-3 p-4 ${n.read ? '' : 'bg-brand-50/50'}`}>
              <span className="mt-0.5 text-slate-400"><Icon name={notifIcon(n.type)} size={18} /></span>
              <button className="min-w-0 flex-1 text-left" onClick={() => open(n)}>
                <div className="text-sm">{n.actor && <b>{n.actor.name} </b>}{n.message}</div>
                <div className="text-xs text-slate-400">{n.workspace?.name}{n.project ? ` › ${n.project.name}` : ''} · {timeAgo(n.createdAt)}</div>
              </button>
              <button className="btn-ghost !px-2 text-xs" onClick={() => act(() => api.patch(`/notifications/${n._id}`, { read: !n.read }))}>{n.read ? 'Mark unread' : 'Mark read'}</button>
              <button className="btn-ghost !px-2 text-slate-400 hover:text-red-600" aria-label="Delete notification" onClick={() => act(() => api.delete(`/notifications/${n._id}`))}><Icon name="x" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="chevron-left" size={14} />Prev</button>
          <span>Page {data.page} of {data.pages}</span>
          <button className="btn-secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
