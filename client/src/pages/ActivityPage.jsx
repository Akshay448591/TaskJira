import ActivityFeed from '../components/ActivityFeed.jsx';

export default function ActivityPage() {
  return (
    <div className="space-y-4">
      <h1 className="page-title">Activity</h1>
      <p className="text-sm text-slate-500">Everything that changed in this workspace: who did what, and when.</p>
      <ActivityFeed />
    </div>
  );
}
