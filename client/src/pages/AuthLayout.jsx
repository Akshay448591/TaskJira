import { Logo } from '../components/ui.jsx';

// Flat canvas, one bordered card. No gradients.
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5"><Logo size={30} /><span className="text-base font-medium tracking-tight text-slate-900">TaskJira</span></div>
      <div className="card w-full max-w-sm animate-rise-in p-7">
        <div className="mb-5">
          <h1 className="text-xl font-medium text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
