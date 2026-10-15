import { Component } from 'react';
import Icon from './Icon.jsx';

// Catches render crashes so a bug in one view shows a recoverable message instead of a blank page.
// `resetKey` (e.g. the pathname) clears the error when the user navigates elsewhere.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  componentDidCatch(error, info) { console.error(error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600"><Icon name="triangle-alert" size={20} /></span>
        <h1 className="text-xl font-medium text-slate-900">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-500">This view hit an unexpected error. Reloading usually fixes it.</p>
        <details className="mt-4 w-full text-left text-xs text-slate-500">
          <summary className="cursor-pointer text-center">Technical details</summary>
          <pre className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 font-mono">{String(this.state.error?.message || this.state.error)}</pre>
        </details>
        <div className="mt-6 flex gap-2">
          <button className="btn-primary" onClick={() => window.location.reload()}><Icon name="refresh-cw" size={14} />Reload</button>
          <a className="btn-secondary" href="/">Go to workspaces</a>
        </div>
      </div>
    );
  }
}
