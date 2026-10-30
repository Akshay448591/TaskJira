import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Aurora, Logo, Splash } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const FEATURES = [
  ['kanban', 'Kanban boards', 'Custom workflows, drag and drop, and filters that stay out of your way.'],
  ['activity', 'Sprints & burndown', 'Backlog, story points and live progress with automatic carry-over.'],
  ['calendar', 'Timeline & dependencies', 'Gantt-style planning that flags conflicts and dependency cycles.'],
  ['users', 'Real-time teamwork', 'Live updates, presence, mentions and notifications as things change.'],
  ['bar-chart', 'Analytics', 'Velocity, workload and completion trends, exportable to CSV.'],
  ['settings', 'Roles & workspaces', 'Owner, Admin, Member and Viewer access with isolated workspaces.'],
];

const MOCK = [
  ['To do', 'bg-slate-400', ['Design onboarding flow', 'Set up CI pipeline']],
  ['In progress', 'bg-blue-500', ['Sprint planning view', 'API rate limiting']],
  ['Done', 'bg-green-600', ['Login & signup']],
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/welcome" className="flex items-center gap-2.5"><Logo size={28} /><span className="font-semibold tracking-tight">TaskJira</span></Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex"><a href="#features" className="hover:text-slate-900">Features</a><a href="#preview" className="hover:text-slate-900">Preview</a></nav>
          <div className="flex items-center gap-2"><Link to="/login" className="btn-ghost">Log in</Link><Link to="/signup" className="btn-primary">Get started</Link></div>
        </div>
      </header>

      <Aurora>
        <section className="mx-auto max-w-4xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">Project management, simplified</span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">Plan clearly.<br />Ship together.</h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-600 sm:text-lg">TaskJira brings projects, sprints and tasks into one calm workspace, so your team always knows what is next.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup" className="btn-primary !h-11 w-full !px-6 text-base sm:w-auto">Start for free<Icon name="arrow-right" size={16} /></Link>
            <Link to="/login" className="btn-secondary !h-11 w-full !px-6 text-base sm:w-auto">Log in</Link>
          </div>
        </section>
      </Aurora>

      <section id="preview" className="mx-auto -mt-12 max-w-5xl px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-pop sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {MOCK.map(([name, dot, cards]) => (
              <div key={name} className="rounded-xl bg-slate-100/80 p-2.5">
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-slate-700"><span className={`h-2 w-2 rounded-full ${dot}`} />{name}<span className="text-slate-400">{cards.length}</span></div>
                <div className="space-y-2">{cards.map((c) => <div key={c} className="card p-3 text-sm">{c}<div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>TJ-{c.length}</span><span className="h-5 w-5 rounded-full bg-slate-200" /></div></div>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Everything your team needs, nothing it doesn’t</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([icon, title, text]) => (
            <div key={title} className="card p-6 transition hover:-translate-y-0.5 hover:shadow-pop">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon name={icon} size={18} /></span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <Aurora className="mx-4 mb-16 rounded-3xl sm:mx-6 lg:mx-auto lg:max-w-5xl">
        <div className="px-6 py-14 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to get organised?</h2>
          <p className="mt-2 text-slate-600">Create a workspace in under a minute.</p>
          <Link to="/signup" className="btn-primary mt-6 !h-11 !px-6 text-base">Create your account</Link>
        </div>
      </Aurora>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} TaskJira</footer>
    </div>
  );
}
