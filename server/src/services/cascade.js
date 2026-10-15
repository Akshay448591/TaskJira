import { Task } from '../models/Task.js';
import { Comment } from '../models/Comment.js';
import { Activity } from '../models/Activity.js';
import { TaskLink } from '../models/TaskLink.js';
import { Project } from '../models/Project.js';
import { Invitation } from '../models/Invitation.js';
import { Membership } from '../models/Membership.js';
import { Workspace } from '../models/Workspace.js';
import { Notification } from '../models/Notification.js';
import { SavedView } from '../models/SavedView.js';
import { Sprint } from '../models/Sprint.js';
import { Milestone } from '../models/Milestone.js';
import { ATTACH_DIR, removeFile } from '../middleware/upload.js';

export async function deleteTasksCascade(filter) {
  const tasks = await Task.find(filter).select('_id attachments');
  const ids = tasks.map((t) => t._id);
  for (const t of tasks) for (const a of t.attachments) await removeFile(ATTACH_DIR, a.filename);
  await Promise.all([
    Comment.deleteMany({ task: { $in: ids } }),
    Activity.deleteMany({ task: { $in: ids } }),
    Notification.deleteMany({ task: { $in: ids } }),
    TaskLink.deleteMany({ $or: [{ from: { $in: ids } }, { to: { $in: ids } }] }),
  ]);
  await Task.deleteMany({ _id: { $in: ids } });
}

export async function deleteProjectCascade(workspace, projectId) {
  await deleteTasksCascade({ workspace, project: projectId });
  await Activity.deleteMany({ workspace, project: projectId });
  await SavedView.deleteMany({ workspace, project: projectId });
  await Sprint.deleteMany({ workspace, project: projectId });
  await Milestone.deleteMany({ workspace, project: projectId });
  await Project.deleteOne({ _id: projectId, workspace });
}

export async function deleteWorkspaceCascade(workspaceId) {
  await deleteTasksCascade({ workspace: workspaceId });
  await Promise.all([
    Project.deleteMany({ workspace: workspaceId }),
    Activity.deleteMany({ workspace: workspaceId }),
    Notification.deleteMany({ workspace: workspaceId }),
    SavedView.deleteMany({ workspace: workspaceId }),
    Sprint.deleteMany({ workspace: workspaceId }),
    Milestone.deleteMany({ workspace: workspaceId }),
    Invitation.deleteMany({ workspace: workspaceId }),
    Membership.deleteMany({ workspace: workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}
