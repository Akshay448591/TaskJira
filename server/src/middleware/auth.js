import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { ApiError, asyncHandler, isId } from '../utils/ApiError.js';
import { RANK } from '../constants.js';

// Missing/expired access token -> TOKEN_EXPIRED so the client knows to call /auth/refresh
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.access_token;
  if (!token) throw new ApiError(401, 'Authentication required', 'TOKEN_EXPIRED');
  let payload;
  try {
    payload = jwt.verify(token, env.accessSecret);
  } catch {
    throw new ApiError(401, 'Session expired', 'TOKEN_EXPIRED');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'Account no longer exists', 'TOKEN_EXPIRED');
  req.user = user;
  next();
});

// Workspace-level isolation: the caller must be a member of :workspaceId.
// Non-members get 404 so workspace ids can't be probed.
export const loadMembership = asyncHandler(async (req, res, next) => {
  const { workspaceId } = req.params;
  if (!isId(workspaceId)) throw new ApiError(404, 'Workspace not found');
  const membership = await Membership.findOne({ workspace: workspaceId, user: req.user._id });
  if (!membership) throw new ApiError(404, 'Workspace not found');
  req.membership = membership;
  req.role = membership.role;
  next();
});

export const requireRole = (min) => (req, res, next) =>
  RANK[req.role] >= RANK[min] ? next() : next(new ApiError(403, 'You do not have permission to do that'));

export const checkIdParam = (req, res, next, value) =>
  isId(value) ? next() : next(new ApiError(400, 'Invalid identifier'));
