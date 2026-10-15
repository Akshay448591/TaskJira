import { useNavigate } from 'react-router-dom';
import { useSocketEvent, useConnected } from '../lib/realtime.js';
import { notifIcon } from '../lib/constants.js';
import { toast, Toaster } from '../lib/toast.jsx';
import { notifLink } from './NotificationBell.jsx';

// Small "Live / Offline" indicator for the realtime connection.
export function ConnectionDot() {
  const on = useConnected();
  return (
    <span title={on ? 'Live updates connected' : 'Offline, reconnecting…'} className={`hidden items-center gap-1.5 text-xs sm:inline-flex ${on ? 'text-slate-500' : 'text-amber-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-green-600' : 'bg-amber-500'}`} />{on ? 'Live' : 'Offline'}
    </span>
  );
}

// Mounts the toast viewport and turns incoming notifications into clickable toasts.
export default function LiveToasts() {
  const navigate = useNavigate();
  useSocketEvent('notification:new', (n) => {
    toast(`${n.actor ? `${n.actor.name} ` : ''}${n.message}`, { id: `n-${n._id}`, icon: notifIcon(n.type), duration: 7000, onClick: () => navigate(notifLink(n)) });
  });
  return <Toaster />;
}
