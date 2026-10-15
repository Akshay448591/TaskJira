import mongoose from 'mongoose';
import { ROLES } from '../constants.js';
const { Schema } = mongoose;

const membershipSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ROLES, default: 'member' },
  },
  { timestamps: true }
);
membershipSchema.index({ workspace: 1, user: 1 }, { unique: true });

export const Membership = mongoose.model('Membership', membershipSchema);
