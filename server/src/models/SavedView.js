import mongoose from 'mongoose';
const { Schema } = mongoose;

const savedViewSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true }, // null = workspace-wide "All tasks"
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    view: { type: String, enum: ['list', 'board', 'calendar'], default: 'list' },
    query: { type: Schema.Types.Mixed, default: {} }, // filters + sort, as URL-style string pairs
    shared: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SavedView = mongoose.model('SavedView', savedViewSchema);
