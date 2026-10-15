import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { PRIORITIES, PROJECT_STATUSES, lookup } from '../lib/constants.js';

/* ---------- loading ---------- */

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

const RowSkeleton = () => (
  <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
    <Skeleton className="h-3 w-8" /><Skeleton className="h-3 flex-1" /><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-5 !rounded-full" />
  </div>
);
const CardSkeleton = () => (
  <div className="card space-y-2 p-3"><Skeleton className="h-3 w-12" /><Skeleton className="h-3.5 w-11/12" /><div className="flex justify-between pt-1"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-5 !rounded-full" /></div></div>
);

const SHAPES = {
  page: () => (
    <div className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3 w-80 max-w-full" />
      <div className="card mt-4">{[0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)}</div>
    </div>
  ),
  list: () => <div className="card">{[0, 1, 2, 3, 4, 5].map((i) => <RowSkeleton key={i} />)}</div>,
  board: () => (
    <div className="flex gap-3 overflow-hidden">
      {[3, 2, 2, 1].map((n, c) => (
        <div key={c} className="w-72 shrink-0 space-y-2 rounded-lg bg-slate-100 p-2">
          <Skeleton className="mb-3 mt-1 h-3.5 w-24 !bg-slate-200" />
          {Array.from({ length: n }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ))}
    </div>
  ),
  cards: () => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => <div key={i} className="card space-y-3 p-5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="mt-4 h-2 w-full" /></div>)}
    </div>
  ),
  inline: () => <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div>,
};

// Loader that only shows after 200ms (no flicker on fast requests) and offers a retry if it takes very long.
export function Loading({ variant = 'page', className = '', onRetry }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setPhase(1), 200);
    const b = setTimeout(() => setPhase(2), 8000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  if (phase === 0) return <div className={`min-h-[8rem] ${className}`} />;
  const Shape = SHAPES[variant] || SHAPES.page;
  return (
    <div className={`animate-fade-in ${className}`} role="status" aria-label="Loading">
      <Shape />
      {phase === 2 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm text-slate-500">
          Taking longer than usual…
          <button className="btn-secondary" onClick={onRetry || (() => window.location.reload())}><Icon name="refresh-cw" size={14} />Retry</button>
        </div>
      )}
    </div>
  );
}
export const Spinner = (props) => <Loading {...props} />;

// Full-screen splash used while the session is being checked.
export function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status" aria-label="Loading">
      <div className="flex animate-pulse items-center gap-2.5"><Logo /><span className="text-base font-medium text-slate-900">TaskJira</span></div>
    </div>
  );
}

export function Logo({ size = 28 }) {
  return (
    <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand-600 text-white">
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 7h14M12 7v13" /></svg>
    </span>
  );
}

/* ---------- feedback ---------- */

const ALERTS = {
  error: ['border-red-200 bg-red-50 text-red-800', 'circle-alert', 'text-red-600'],
  success: ['border-green-200 bg-green-50 text-green-800', 'circle-check', 'text-green-600'],
  info: ['border-slate-200 bg-white text-slate-700', 'info', 'text-slate-500'],
};
export function Alert({ children, tone = 'error' }) {
  if (!children) return null;
  const [cls, icon, ic] = ALERTS[tone] || ALERTS.error;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${cls}`}>
      <Icon name={icon} size={16} className={`mt-0.5 ${ic}`} /><div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Empty({ children, icon = 'inbox', title, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Icon name={icon} size={18} /></span>
      {title && <div className="text-sm font-medium text-slate-900">{title}</div>}
      <div className={`max-w-sm text-sm text-slate-500 ${title ? 'mt-1' : ''}`}>{children}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- form bits ---------- */

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[13px] font-medium text-slate-700">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Select({ options, value, onChange, className = '', ...rest }) {
  return (
    <div className="relative">
      <select className={`input appearance-none pr-8 ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export const Kbd = ({ children }) => <kbd className="kbd">{children}</kbd>;

/* ---------- tags ---------- */

export function Badge({ cls = '', children }) {
  const neutral = /\bbg-/.test(cls) ? '' : 'border border-slate-200 bg-white text-slate-700';
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${neutral} ${cls}`}>{children}</span>;
}

export function StatusDot({ dot, hollow, className = '' }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${hollow ? 'border-[1.5px] border-slate-400 bg-transparent' : dot} ${className}`} />;
}
// col comes from colInfo(project, key)
export function StatusTag({ col }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700"><StatusDot dot={col.dot} hollow={col.hollow} />{col.name}</span>;
}
export function ProjectStatusTag({ value }) {
  const s = lookup(PROJECT_STATUSES, value);
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700"><StatusDot dot={s.dot} hollow={s.hollow} />{s.label}</span>;
}

export function PriorityIcon({ value, size = 16 }) {
  const p = lookup(PRIORITIES, value);
  if (value === 'urgent') return <Icon name="triangle-alert" size={size} className="text-red-600" />;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${p.cls}`} fill="currentColor">
      {[[2, 9, 3], [6.5, 5.5, 3], [11, 2, 3]].map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={14 - y} rx="1" opacity={i < p.level ? 1 : 0.22} />)}
    </svg>
  );
}
export function PriorityTag({ value, label = true }) {
  const p = lookup(PRIORITIES, value);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700" title={`${p.label} priority`}>
      <PriorityIcon value={value} size={14} />{label && p.label}
    </span>
  );
}

export function Avatar({ user, size = 8, title }) {
  const px = `${size * 4}px`;
  const name = user?.name || '?';
  const url = user?.avatarUrl || (user?.avatar ? `/uploads/avatars/${user.avatar}` : null);
  if (url) return <img src={url} alt={name} title={title || name} style={{ width: px, height: px }} className="shrink-0 rounded-full object-cover" />;
  return (
    <span title={title || name} style={{ width: px, height: px, fontSize: Math.max(10, size * 1.5) }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-medium text-slate-700">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/* ---------- overlays ---------- */

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Modal({ title, onClose, children, wide }) {
  useEscape(onClose);
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className="fixed inset-0 z-40 flex animate-fade-in items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`my-8 w-full animate-rise-in rounded-[10px] border border-slate-200 bg-white shadow-pop ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-medium">{title}</h2>
          <button className="btn-ghost !h-7 !w-7 !px-0" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Right-hand drawer: the page behind stays visible, so you can triage tasks without losing your place.
export function Drawer({ title, onClose, children, fullPageTo }) {
  const ref = useRef();
  useEscape(onClose);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div data-modal className="fixed inset-0 z-40 animate-fade-in bg-slate-900/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Task details" className="absolute inset-y-0 right-0 flex w-full max-w-3xl animate-slide-in flex-col border-l border-slate-200 bg-white shadow-pop outline-none">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-2.5">
          <div className="min-w-0 truncate text-sm text-slate-500">{title}</div>
          <div className="flex items-center gap-1">
            {fullPageTo && <Link to={fullPageTo} className="btn-ghost" onClick={onClose}><Icon name="maximize-2" size={14} />Open full page</Link>}
            <button className="btn-ghost !h-7 !w-7 !px-0" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}
