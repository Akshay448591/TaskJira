import mongoose from 'mongoose';
const { Schema } = mongoose;

// Stored once, directionally: "from blocks to" or "from relates_to to".
// "blocked by" is simply the inverse view of "blocks".
const linkSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    from: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    to: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    type: { type: String, enum: ['blocks', 'relates_to'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
linkSchema.index({ from: 1, to: 1, type: 1 }, { unique: true });

export const TaskLink = mongoose.model('TaskLink', linkSchema);
