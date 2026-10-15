import mongoose from 'mongoose';
import { NOTIFICATION_DEFAULTS, NOTIFICATION_TYPES } from '../constants.js';
const { Schema } = mongoose;

const notificationPrefs = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t, { inApp: { type: Boolean, default: NOTIFICATION_DEFAULTS[t].inApp }, email: { type: Boolean, default: NOTIFICATION_DEFAULTS[t].email } }])
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: null }, // file name inside uploads/avatars
    bio: { type: String, default: '', maxlength: 300 },
    settings: {
      emailNotifications: { type: Boolean, default: true },
      timezone: { type: String, default: 'UTC', maxlength: 60 },
      notifications: notificationPrefs, // per type: in-app / email (emailNotifications above is the master email switch)
    },
    refreshTokens: { type: [{ tokenHash: String, expiresAt: Date, _id: false }], select: false, default: [] },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshTokens;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    delete ret.__v;
    ret.avatarUrl = ret.avatar ? `/uploads/avatars/${ret.avatar}` : null;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
