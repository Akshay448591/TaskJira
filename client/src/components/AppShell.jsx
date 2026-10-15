import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { WorkspaceCtx } from '../context/WorkspaceContext.jsx';
import { atLeast } from '../lib/constants.js';
import { useRoom, useSocketEvent } from '../lib/realtime.js';
import { toast } from '../lib/toast.jsx';
import { Avatar, Loading, Logo } from './ui.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import LiveToasts, { ConnectionDot } from './LiveToasts.jsx';
import CommandPalette, { ShortcutsHelp } from './CommandPalette.jsx';
import QuickCreate from './QuickCreate.jsx';
import PresenceBar from './PresenceBar.jsx';
import TopProgress from './TopProgress.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import NotFound from '../pages/NotFound.jsx';

// Pages can name the last breadcrumb (e.g. the project or task title): useCrumb(project?.name)
const ShellCtx = createContext({ setCrumb: () => {} });
export function useCrumb(label) {
  const { setCrumb } = useContext(ShellCtx);
  useEffect(() => { setCrumb(label || null); return () => setCrumb(null); }, [label, setCrumb]);
}

const SECTIONS = { tasks: 'All tasks', task: 'Task', search: 'Search', analytics: 'Analytics', activity: 'Activity', members: 'Members', settings: 'Settings', projects: 'Projects' };

function NavItem({ to, end, icon, children, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick} className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'}`}>
      <Icon name={icon} size={16} className="text-slate-500" />{children}
    </NavLink>
  );
}

function WorkspaceSwitcher({ workspace }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const box = useRef();
  useEffect(() => {
    if (!open) return undefined;
    api.get('/workspaces', { silent: true }).then((r) => setList(r.data.workspaces)).catch(() => setList([]));
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-slate-100">
        {workspace ? <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-medium text-white">{workspace.name.trim().charAt(0).toUpperCase()}</span> : <Logo size={26} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-4 text-slate-900">{workspace ? workspace.name : 'TaskJira'}</span>
          {workspace && <span className="block text-xs capitalize leading-4 text-slate-500">{workspace.role}</span>}
        </span>
        <Icon name="chevrons-up-down" size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 animate-rise-in overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-pop">
          <div className="px-3 py-1.5 text-xs text-slate-500">Workspaces</div>
          <div className="max-h-60 overflow-y-auto">
            {!list && <div className="px-3 py-2 text-sm text-slate-400">Loading…</div>}
            {list?.map((w) => (
              <Link key={w._id} to={`/w/${w._id}`} onClick={() => setOpen(false)} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                <span className="truncate">{w.name}</span>{workspace?._id === w._id && <Icon name="check" size={14} className="text-brand-600" />}
              </Link>
            ))}
          </div>
          <Link to="/" onClick={() => setOpen(false)} className="mt-1 block border-t border-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">All workspaces</Link>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const match = useMatch('/w/:workspaceId/*');
  const workspaceId = match?.params.workspaceId;

  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [online, setOnline] = useState([]);
  const [palette, setPalette] = useState(false);
  const [quick, setQuick] = useState(false);
  const [help, setHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [crumb, setCrumb] = useState(null);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [w, m] = await Promise.all([api.get(`/workspaces/${workspaceId}`), api.get(`/workspaces/${workspaceId}/members`)]);
      setWorkspace(w.data.workspace);
      setMembers(m.data.members);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [workspaceId]);
  useEffect(() => { setWorkspace(null); setMembers([]); setError(''); setOnline([]); reload(); }, [reload]);
  useEffect(() => setMobile(false), [location.pathname]);

  // live: workspace room (presence + member changes). Authorisation happens on the server for every join.
  useRoom('workspace', workspaceId);
  useSocketEvent('presence:update', (p) => { if (p.workspaceId === workspaceId) setOnline(p.users); });
  useSocketEvent('members:changed', (p) => { if (p.workspaceId === workspaceId) reload(); });
  useSocketEvent('evicted', (p) => { if (p.workspaceId === workspaceId) { toast.info('You no longer have access to that workspace'); navigate('/', { replace: true }); } });

  const role = workspace?.role;
  const canCreate = !!workspace && atLeast(role, 'member');
  const ws = workspaceId ? `/w/${workspaceId}` : '';

  // keyboard shortcuts (single keys are ignored while typing or while a dialog is open)
  useEffect(() => {
    if (!workspaceId) return undefined;
    let gAt = 0;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('[data-modal]')) return;
      const k = e.key.toLowerCase();
      if (gAt && Date.now() - gAt < 1200) {
        gAt = 0;
        const go = { p: '', t: '/tasks', a: '/activity', m: '/members', s: '/search' }[k];
        if (go !== undefined) { e.preventDefault(); navigate(`${ws}${go}`); return; }
        if (k === 'n') { e.preventDefault(); navigate('/notifications'); return; }
      }
      if (k === 'g') gAt = Date.now();
      else if (k === 'c' && canCreate) { e.preventDefault(); setQuick(true); }
      else if (k === '/') { e.preventDefault(); navigate(`${ws}/search`); }
      else if (e.key === '?') setHelp(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspaceId, ws, canCreate, navigate]);

  // breadcrumbs
  const seg = location.pathname.split('/').filter(Boolean);
  const crumbs = [];
  if (workspaceId) {
    crumbs.push({ label: workspace?.name || '…', to: ws });
    const section = seg[2];
    crumbs.push({ label: section === undefined ? 'Projects' : SECTIONS[section] || 'Not found', to: section === 'projects' || section === undefined ? ws : `${ws}/${section}` });
    if (crumb) crumbs.push({ label: crumb });
  } else {
    const top = { profile: 'Profile', notifications: 'Notifications' }[seg[0]];
    crumbs.push({ label: top || 'Workspaces' });
  }

  const sidebar = (
    <>
      <div className="px-2 pb-2 pt-3"><WorkspaceSwitcher workspace={workspaceId ? workspace : null} /></div>
      {workspaceId && (
        <div className="space-y-1.5 px-3 pb-2">
          <button onClick={() => setPalette(true)} className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-300">
            <Icon name="search" size={14} /><span>Search</span><span className="kbd ml-auto">Ctrl K</span>
          </button>
        </div>
      )}
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
        {workspaceId ? (
          <>
            <NavItem end to={ws} icon="folder">Projects</NavItem>
            <NavItem to={`${ws}/tasks`} icon="square-check">All tasks</NavItem>
            <NavItem to={`${ws}/analytics`} icon="bar-chart">Analytics</NavItem>
            <NavItem to={`${ws}/activity`} icon="activity">Activity</NavItem>
            <NavItem to={`${ws}/members`} icon="users">Members</NavItem>
            {workspace && atLeast(role, 'admin') && <NavItem to={`${ws}/settings`} icon="settings">Settings</NavItem>}
          </>
        ) : (
          <>
            <NavItem end to="/" icon="folder">Workspaces</NavItem>
            <NavItem to="/notifications" icon="bell">Notifications</NavItem>
            <NavItem to="/profile" icon="user">Profile</NavItem>
          </>
        )}
      </nav>
      <div className="space-y-2 border-t border-slate-200 px-3 py-3">
        {workspace && <PresenceBar label={`Online (${online.length})`} />}
        {workspaceId && <button onClick={() => setHelp(true)} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800"><Icon name="keyboard" size={14} />Keyboard shortcuts <span className="kbd">?</span></button>}
        <div className="flex items-center gap-2">
          <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-100">
            <Avatar user={user} size={6} /><span className="truncate text-sm text-slate-800">{user.name}</span>
          </Link>
          <button className="btn-ghost !h-7 !w-7 !px-0" title="Log out" aria-label="Log out" onClick={async () => { await logout(); navigate('/login'); }}><Icon name="log-out" size={16} /></button>
        </div>
      </div>
    </>
  );

  let body;
  if (workspaceId && error) body = <NotFound title="Workspace not available" message={error} showPath={false} />;
  else if (workspaceId && !workspace) body = <Loading />;
  else body = <Outlet />;

  return (
    <ShellCtx.Provider value={{ setCrumb }}>
      <WorkspaceCtx.Provider value={workspace ? { workspace, setWorkspace, role, members, reloadMembers: reload, online } : null}>
        <TopProgress />
        <div className="flex h-dvh overflow-hidden">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">{sidebar}</aside>
          {mobile && (
            <div className="fixed inset-0 z-40 md:hidden" data-modal>
              <div className="absolute inset-0 animate-fade-in bg-slate-900/30" onClick={() => setMobile(false)} />
              <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] animate-fade-in flex-col border-r border-slate-200 bg-white">{sidebar}</aside>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button className="btn-ghost !h-8 !w-8 !px-0 md:hidden" aria-label="Open menu" onClick={() => setMobile(true)}><Icon name="menu" size={18} /></button>
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                  {crumbs.map((c, i) => (
                    <span key={i} className="flex min-w-0 items-center gap-1.5">
                      {i > 0 && <Icon name="chevron-right" size={14} className="shrink-0 text-slate-300" />}
                      {i === crumbs.length - 1 || !c.to
                        ? <span className="truncate font-medium text-slate-900" aria-current="page">{c.label}</span>
                        : <Link to={c.to} className="truncate text-slate-500 hover:text-slate-900">{c.label}</Link>}
                    </span>
                  ))}
                </nav>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <ConnectionDot />
                <NotificationBell />
                {canCreate && <button className="btn-primary" onClick={() => setQuick(true)}><Icon name="plus" size={14} /><span className="hidden sm:inline">New task</span><span className="sr-only sm:hidden">New task</span></button>}
              </div>
            </header>
            <main className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
                <ErrorBoundary resetKey={location.pathname}>{body}</ErrorBoundary>
              </div>
            </main>
          </div>
        </div>
        <LiveToasts />
        {workspace && palette && <CommandPalette onClose={() => setPalette(false)} onQuickCreate={() => setQuick(true)} onHelp={() => setHelp(true)} />}
        {workspace && quick && <QuickCreate onClose={() => setQuick(false)} />}
        {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      </WorkspaceCtx.Provider>
    </ShellCtx.Provider>
  );
}
