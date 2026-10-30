import { Link } from 'react-router-dom';
import { Aurora, Logo } from '../components/ui.jsx';

// Split screen: form on the left, animated gradient with brand on the right (hidden on phones/tablets).
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
        <Link to="/welcome" className="flex items-center gap-2.5 self-start">
          <Logo size={30} /><span className="text-base font-semibold tracking-tight text-slate-900">TaskJira</span>
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-rise-in">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
        <p className="text-xs text-slate-400">© {new Date().getFullYear()} TaskJira</p>
      </div>
      <Aurora className="hidden lg:block">
        <div className="flex h-full flex-col items-center justify-center px-14 text-center">
          <Logo size={64} />
          <div className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">TaskJira</div>
          <h2 className="mt-8 max-w-md text-4xl font-semibold leading-tight tracking-tight text-slate-900">Plan clearly.<br />Ship together.</h2>
          <p className="mt-4 max-w-sm text-base text-slate-600">Projects, sprints and tasks in one calm workspace for your whole team.</p>
        </div>
      </Aurora>
    </div>
  );
}
