import TaskBrowser from '../components/TaskBrowser.jsx';

export default function TasksPage() {
  return (
    <div className="space-y-4">
      <h1 className="page-title">All tasks</h1>
      <TaskBrowser />
    </div>
  );
}
