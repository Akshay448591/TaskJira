import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { Avatar } from './ui.jsx';

// Online teammates. With projectId / taskId only the people currently viewing that item are shown.
export default function PresenceBar({ projectId, taskId, label = 'Online now', max = 8 }) {
  const { user } = useAuth();
  const { online } = useWorkspace();
  const list = online.filter((o) => (projectId ? o.projects.includes(projectId) : taskId ? o.tasks.includes(taskId) : true));
  const others = projectId || taskId ? list.filter((o) => o.user._id !== user._id) : list;
  if (!others.length) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex -space-x-2">
        {others.slice(0, max).map((o) => (
          <span key={o.user._id} className="relative rounded-full ring-2 ring-white">
            <Avatar user={o.user} size={7} title={o.user._id === user._id ? `${o.user.name} (you)` : o.user.name} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
          </span>
        ))}
      </div>
      {others.length > max && <span className="text-xs text-slate-400">+{others.length - max}</span>}
    </div>
  );
}
