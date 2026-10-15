import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { atLeast } from '../lib/constants.js';
import { Modal } from './ui.jsx';

export const SHORTCUTS = [
  ['Ctrl/⌘ + K', 'Open the command palette'],
  ['C', 'Quick-create a task'],
  ['/', 'Go to search'],
  ['G then P', 'Go to Projects'],
  ['G then T', 'Go to All tasks'],
  ['G then A', 'Go to Activity'],
  ['G then M', 'Go to Members'],
  ['G then S', 'Go to Search'],
  ['G then N', 'Go to Notifications'],
  ['?', 'Show this help'],
  ['Esc', 'Close dialogs'],
];

export function ShortcutsHelp({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="divide-y divide-slate-100">
        {SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-center justify-between py-2 text-sm"><span>{d}</span><kbd className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs">{k}</kbd></div>)}
      </div>
      <p className="mt-3 text-xs text-slate-400">Single-key shortcuts are ignored while you are typing in a field.</p>
    </Modal>
  );
}

export default function CommandPalette({ onClose, onQuickCreate, onHelp }) {
  const { workspace, role } = useWorkspace();
  const navigate = useNavigate();
  const w = `/w/${workspace._id}`;
  const [text, setText] = useState('');
  const [found, setFound] = useState({ tasks: [], projects: [] });
  const [active, setActive] = useState(0);
  const input = useRef();
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const t = text.trim();
    if (t.length < 2) { setFound({ tasks: [], projects: [] }); return; }
    const id = setTimeout(() => api.get(`/workspaces/${workspace._id}/search`, { params: { q: t, types: 'tasks,projects', limit: 5 } }).then((r) => setFound({ tasks: r.data.tasks || [], projects: r.data.projects || [] })).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [text, workspace._id]);

  const go = (path) => () => navigate(path);
  const items = useMemo(() => {
    const cmds = [
      atLeast(role, 'member') && { label: 'Create task', hint: 'C', run: onQuickCreate },
      atLeast(role, 'member') && { label: 'Create project', run: go(`${w}?new=1`) },
      { label: 'Go to Projects', hint: 'G P', run: go(w) },
      { label: 'Go to All tasks', hint: 'G T', run: go(`${w}/tasks`) },
      { label: 'Go to Analytics & reports', run: go(`${w}/analytics`) },
      { label: 'Go to Activity', hint: 'G A', run: go(`${w}/activity`) },
      { label: 'Go to Members', hint: 'G M', run: go(`${w}/members`) },
      { label: 'Go to Search', hint: '/', run: go(`${w}/search`) },
      { label: 'Go to Notifications', hint: 'G N', run: go('/notifications') },
      atLeast(role, 'admin') && { label: 'Workspace settings', run: go(`${w}/settings`) },
      { label: 'Profile & notification preferences', run: go('/profile') },
      { label: 'Switch workspace', run: go('/') },
      { label: 'Keyboard shortcuts', hint: '?', run: onHelp },
    ].filter(Boolean);
    const t = text.trim().toLowerCase();
    const filtered = t ? cmds.filter((c) => c.label.toLowerCase().includes(t)) : cmds;
    const results = [
      ...found.tasks.map((x) => ({ label: `#${x.number} ${x.title}`, hint: 'Task', run: go(`${w}/projects/${x.project?._id}?task=${x._id}`) })),
      ...found.projects.map((p) => ({ label: p.name, hint: 'Project', run: go(`${w}/projects/${p._id}`) })),
    ];
    const all = text.trim() ? [{ label: `Search everything for “${text.trim()}”`, hint: '↵', run: go(`${w}/search?q=${encodeURIComponent(text.trim())}`) }] : [];
    return [...all, ...results, ...filtered];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, found, role, w]);
  useEffect(() => setActive(0), [text]);

  const run = (it) => { onClose(); it.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); run(items[active]); }
  };

  return (
    <div data-modal className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[15vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-xl overflow-hidden">
        <input ref={input} className="w-full border-b border-slate-200 px-4 py-3 text-base outline-none" placeholder="Type a command or search tasks and projects…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No matches</li>}
          {items.map((it, i) => (
            <li key={`${it.label}-${i}`}>
              <button onMouseEnter={() => setActive(i)} onClick={() => run(it)} className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === active ? 'bg-brand-50 text-brand-700' : ''}`}>
                <span className="truncate">{it.label}</span>{it.hint && <kbd className="ml-3 shrink-0 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-400">{it.hint}</kbd>}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">↑↓ to move · ↵ to select · Esc to close</div>
      </div>
    </div>
  );
}
