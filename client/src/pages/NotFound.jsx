import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// Not-found / no-access page. Used for unknown URLs (inside the app shell) and for missing workspaces, projects and tasks.
export default function NotFound({ code = '404', title = 'Page not found', message, showPath = true, to = '/', toLabel = 'Go to workspaces' }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <div className="tnum text-6xl font-medium tracking-tight text-slate-300" aria-hidden="true">{code}</div>
      <h1 className="mt-4 text-xl font-medium text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{message || "The page you're looking for doesn't exist, or you don't have access to it."}</p>
      {showPath && <code className="mt-4 max-w-full truncate rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-500">{pathname}{search}</code>}
      <div className="mt-6 flex gap-2">
        <Link to={to} className="btn-primary">{toLabel}</Link>
        <button className="btn-secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}><Icon name="arrow-left" size={14} />Go back</button>
      </div>
    </div>
  );
}
