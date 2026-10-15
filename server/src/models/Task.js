import mongoose from 'mongoose';
import { PRIORITIES } from '../constants.js';

export const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i + 1]));
const { Schema } = mongoose;

const taskSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    number: { type: Number, required: true }, // human-friendly per-workspace number (#12)
    parent: { type: Schema.Types.ObjectId, ref: 'Task', default: null, index: true }, // subtasks: one level deep
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 10000 },
    // key of one of the project's workflow columns (validated in the route, not here)
    status: { type: String, default: 'todo', trim: true, maxlength: 40 },
    position: { type: Number, default: 0 }, // order inside a board column
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, default: null }, // with dueDate this is the task's bar on the timeline
    dueDate: { type: Date, default: null },
    storyPoints: { type: Number, default: null, min: 0, max: 1000 },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', default: null, index: true }, // null = backlog (top-level tasks only)
    completedAt: { type: Date, default: null }, // set when the task enters a Done column
    dueSoonNotifiedFor: { type: Date, default: null }, // dueDate we already sent the "approaching" alert for
    overdueNotifiedFor: { type: Date, default: null },
    // helper fields kept in sync by the pre-validate hook below; used only for sorting
    priorityRank: { type: Number, select: false },
    noDue: { type: Number, select: false },
    labels: [{ type: String, trim: true, maxlength: 30 }],
    attachments: [
      {
        filename: String, // stored name on disk
        originalName: String,
        mimetype: String,
        size: Number,
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);
taskSchema.pre('validate', function setSortFields(next) {
  this.priorityRank = PRIORITY_RANK[this.priority] ?? 2;
  this.noDue = this.dueDate ? 0 : 1;
  next();
});

taskSchema.index({ workspace: 1, project: 1, status: 1, position: 1 });
taskSchema.index({ workspace: 1, assignee: 1 });
taskSchema.index({ workspace: 1, dueDate: 1 });

export const Task = mongoose.model('Task', taskSchema);

// Tasks created before this update lack the sort helper fields: fill them in once at startup (cheap, idempotent).
export async function backfillSortFields() {
  // completedAt for tasks that were finished before sprints/analytics existed (uses their last update)
  const { Project } = await import('./Project.js');
  const { doneKeys } = await import('../services/workflow.js');
  for (const p of await Project.find().select('columns')) {
    const old = await Task.find({ project: p._id, status: { $in: doneKeys(p) }, completedAt: null }).select('updatedAt').lean();
    for (const t of old) await Task.updateOne({ _id: t._id }, { $set: { completedAt: t.updatedAt } }, { timestamps: false });
  }
  for (const [p, rank] of Object.entries(PRIORITY_RANK)) {
    await Task.updateMany({ priority: p, priorityRank: { $exists: false } }, { $set: { priorityRank: rank } });
  }
  await Task.updateMany({ dueDate: null, noDue: { $exists: false } }, { $set: { noDue: 1 } });
  await Task.updateMany({ dueDate: { $ne: null }, noDue: { $exists: false } }, { $set: { noDue: 0 } });
}
