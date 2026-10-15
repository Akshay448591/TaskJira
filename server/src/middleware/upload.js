import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const mk = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
export const AVATAR_DIR = mk(path.join(env.uploadDir, 'avatars'));
export const ATTACH_DIR = mk(path.join(env.uploadDir, 'attachments'));

const AVATAR_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const rand = () => crypto.randomBytes(16).toString('hex');

export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, AVATAR_DIR),
    // extension comes from the verified mimetype, never from the client's filename
    filename: (req, f, cb) => cb(null, rand() + AVATAR_EXT[f.mimetype]),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) =>
    AVATAR_EXT[f.mimetype] ? cb(null, true) : cb(new ApiError(400, 'Avatar must be a JPG, PNG, WEBP or GIF image')),
});

export const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, ATTACH_DIR),
    filename: (req, f, cb) => cb(null, rand()), // no extension; served only as a forced download
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

export const removeFile = (dir, name) => (name ? fs.promises.unlink(path.join(dir, path.basename(name))).catch(() => {}) : null);
