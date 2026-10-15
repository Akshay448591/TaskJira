import { useEffect, useRef, useSyncExternalStore } from 'react';
import Icon from '../components/Icon.jsx';

// Tiny toast system (no dependency). API mirrors sonner / react-hot-toast:
//   toast('Saved'), toast.success(..), toast.error(..), toast.info(..), toast.loading(..),
//   toast.promise(promise, { loading, success, error }), toast.dismiss(id)
// Options: { id, description, duration (ms, 0 = stay), action: { label, onClick }, onClick, icon }
let items = [];
let seq = 0;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const DEFAULT_MS = { info: 4000, success: 4000, error: 0, loading: 0 };
const MAX = 4;

function push(type, message, opts = {}) {
  const id = opts.id ?? `t${++seq}`;
  const next = { id, type, message, description: opts.description, action: opts.action, onClick: opts.onClick, icon: opts.icon, duration: opts.duration ?? DEFAULT_MS[type], leaving: false, rev: (items.find((t) => t.id === id)?.rev || 0) + 1 };
  const exists = items.some((t) => t.id === id);
  items = exists ? items.map((t) => (t.id === id ? next : t)) : [...items, next].slice(-MAX);
  emit();
  return id;
}

function dismiss(id) {
  if (id === undefined) { items.forEach((t) => dismiss(t.id)); return; }
  if (!items.some((t) => t.id === id && !t.leaving)) return;
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => { items = items.filter((t) => t.id !== id); emit(); }, 170);
}

export const toast = Object.assign((m, o) => push('info', m, o), {
  success: (m, o) => push('success', m, o),
  error: (m, o) => push('error', m, o),
  info: (m, o) => push('info', m, o),
  loading: (m, o) => push('loading', m, o),
  dismiss,
  promise(p, msgs = {}) {
    const id = push('loading', msgs.loading || 'Working…');
    const text = (m, v, d) => (typeof m === 'function' ? m(v) : m || d);
    p.then((v) => push('success', text(msgs.success, v, 'Done'), { id }), (e) => push('error', text(msgs.error, e, 'Something went wrong'), { id }));
    return p;
  },
});

const ICONS = {
  success: ['circle-check', 'text-green-600'],
  error: ['circle-alert', 'text-red-600'],
  info: ['info', 'text-brand-600'],
};

function ToastItem({ t }) {
  const timer = useRef();
  const arm = () => { clearTimeout(timer.current); if (t.duration > 0) timer.current = setTimeout(() => dismiss(t.id), t.duration); };
  useEffect(() => { arm(); return () => clearTimeout(timer.current); }, [t.rev, t.duration]); // eslint-disable-line react-hooks/exhaustive-deps
  const [name, tone] = t.type === 'loading' ? ['loader', 'text-slate-500 animate-spin'] : t.icon ? [t.icon, 'text-brand-600'] : ICONS[t.type] || ICONS.info;
  const clickable = !!t.onClick;
  return (
    <div
      role={t.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={arm}
      onClick={clickable ? () => { dismiss(t.id); t.onClick(); } : undefined}
      className={`group pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3 shadow-pop ${t.leaving ? 'animate-toast-out' : 'animate-toast-in'} ${clickable ? 'cursor-pointer hover:border-slate-300' : ''}`}
    >
      <Icon name={name} size={18} className={`mt-px ${tone}`} />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium text-slate-900">{t.message}</div>
        {t.description && <div className="mt-0.5 text-slate-500">{t.description}</div>}
      </div>
      {t.action && <button className="shrink-0 rounded px-1.5 py-0.5 text-sm font-medium text-brand-600 hover:bg-brand-50" onClick={(e) => { e.stopPropagation(); t.action.onClick?.(); dismiss(t.id); }}>{t.action.label}</button>}
      <button aria-label="Dismiss" className="-mr-1 shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const list = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => items);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {list.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}
