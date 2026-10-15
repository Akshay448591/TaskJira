import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import TaskModal from '../components/TaskModal.jsx';

// Full-page view of one task (shareable URL). Same content as the drawer.
export default function TaskPage() {
  const { taskId } = useParams();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const go = (id) => navigate(`/w/${workspace._id}/task/${id}`);
  return <TaskModal key={taskId} mode="page" taskId={taskId} onClose={() => navigate(-1)} onChanged={() => {}} onOpenTask={go} />;
}
