import mongoose from 'mongoose';
const { Schema } = mongoose;

const activitySchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    field: String,
    from: String,
    to: String,
    text: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Activity = mongoose.model('Activity', activitySchema);
