import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { notifIcon, timeAgo } from '../lib/constants.js';
import { useSocketEvent } from '../lib/realtime.js';
import Icon from './Icon.jsx';

export const notifLink = (n) => {
  const w = n.workspace?._id || n.workspace;
  const p = n.project?._id || n.project;
  return p && n.task ? `/w/${w}/projects/${p}?task=${n.task}` : `/w/${w}`;
};

// Bell in the header: unread badge (polled every 30s) + dropdown with the latest notifications.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const box = useRef();

  const refreshCount = useCallback(() => api.get('/notifications/unread-count', { silent: true }).then((r) => setCount(r.data.count)).catch(() => {}), []);
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 60000); // fallback only; live updates arrive over the socket
    window.addEventListener('focus', refreshCount);
    return () => { clearInterval(t); window.removeEventListener('focus', refreshCount); };
  }, [refreshCount]);
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // live: a new notification arrives -> bump the badge and refresh the open list
  useSocketEvent('notification:new', () => {
    setCount((c) => c + 1);
    if (open) api.get('/notifications', { params: { limit: 8 } }).then((r) => setItems(r.data.notifications)).catch(() => {});
  });

  const toggle = async () => {
    setOpen((o) => !o);
    if (!open) { try { const { data } = await api.get('/notifications', { params: { limit: 8 } }); setItems(data.notifications); setCount(data.unreadCount); } catch { /* ignore */ } }
  };
  const go = async (n) => {
    setOpen(false);
    if (!n.read) { api.patch(`/notifications/${n._id}`, { read: true }).then(refreshCount).catch(() => {}); }
    navigate(notifLink(n));
  };
  const markAll = async () => { await api.post('/notifications/read-all', {}); setItems((l) => l.map((n) => ({ ...n, read: true }))); setCount(0); };

  return (
    <div className="relative" ref={box}>
      <button className="btn-ghost relative !px-2" onClick={toggle} aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'} aria-expanded={open}>
        <Icon name="bell" size={17} />{count > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-brand-600 px-1 text-center text-[10px] font-medium leading-4 text-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-96 max-w-[92vw] rounded-lg border border-slate-200 bg-white shadow-pop animate-rise-in">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <b className="text-sm">Notifications</b>
            {count > 0 && <button className="text-xs text-brand-600 hover:underline" onClick={markAll}>Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="p-6 text-center text-sm text-slate-500">You're all caught up.</p>}
            {items.map((n) => (
              <button key={n._id} onClick={() => go(n)} className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/50'}`}>
                <span className="mt-0.5 text-slate-400"><Icon name={notifIcon(n.type)} size={16} /></span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block">{n.actor && <b>{n.actor.name} </b>}{n.message}</span>
                  <span className="text-xs text-slate-400">{n.workspace?.name} · {timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />}
              </button>
            ))}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2 text-center text-sm text-brand-600 hover:bg-slate-50">View all notifications</Link>
        </div>
      )}
    </div>
  );
}
