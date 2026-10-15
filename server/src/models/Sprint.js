import mongoose from 'mongoose';
const { Schema } = mongoose;

// Every scope / completion change while a sprint is active is appended here, so the burndown
// chart can be rebuilt exactly for any day (points and task counts are signed deltas).
const logSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, enum: ['scope', 'done'], required: true },
    points: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
  },
  { _id: false }
);

const sprintSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    goal: { type: String, default: '', maxlength: 1000 },
    startDate: { type: Date, required: true }, // date-only, stored as UTC midnight
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['planned', 'active', 'completed'], default: 'planned', index: true },
    startedAt: Date,
    completedAt: Date,
    committedPoints: { type: Number, default: 0 },
    committedCount: { type: Number, default: 0 },
    completedPoints: { type: Number, default: 0 },
    completedCount: { type: Number, default: 0 },
    carriedOver: { type: Number, default: 0 },
    log: { type: [logSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Sprint = mongoose.model('Sprint', sprintSchema);
