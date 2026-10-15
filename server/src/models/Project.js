import mongoose from 'mongoose';
import { COLUMN_CATEGORIES, COLUMN_COLORS, PRIORITIES, PROJECT_STATUSES } from '../constants.js';
const { Schema } = mongoose;

const columnSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 30 },
    color: { type: String, enum: COLUMN_COLORS, default: 'slate' },
    category: { type: String, enum: COLUMN_CATEGORIES, default: 'in_progress' },
  },
  { _id: false }
);

const projectSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: PROJECT_STATUSES, default: 'planning' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    deadline: { type: Date, default: null },
    archived: { type: Boolean, default: false },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // workflow states / board columns, in display order (empty = defaults, see services/workflow.js)
    columns: { type: [columnSchema], default: undefined },
  },
  { timestamps: true }
);

export const Project = mongoose.model('Project', projectSchema);
