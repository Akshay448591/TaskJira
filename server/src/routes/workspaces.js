import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Workspace } from '../models/Workspace.js';
import { Membership } from '../models/Membership.js';
import { Invitation } from '../models/Invitation.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { requireAuth, loadMembership, requireRole, checkIdParam } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { RANK } from '../constants.js';
import { sendMail } from '../utils/mailer.js';
import { deleteWorkspaceCascade } from '../services/cascade.js';
import projectRoutes from './projects.js';
import taskRoutes from './tasks.js';
import viewRoutes from './views.js';
import searchRoutes from './search.js';
import activityRoutes from './activity.js';
import analyticsRoutes from './analytics.js';
import { emit, evictFromWorkspace } from '../realtime.js';
import { logActivity } from '../services/activity.js';

const router = Router();
router.use(requireAuth);
router.param('userId', checkIdParam);
router.param('invitationId', checkIdParam);

const wsSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  description: z.string().trim().max(500).optional(),
});
const roleSchema = z.object({ role: z.enum(['admin', 'member', 'viewer']) });
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

// ---- workspaces ----
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const memberships = await Membership.find({ user: req.user._id }).populate('workspace');
    const workspaces = memberships.filter((m) => m.workspace).map((m) => ({ ...m.workspace.toObject(), role: m.role }));
    res.json({ workspaces });
  })
);

router.post(
  '/',
  validate(wsSchema),
  asyncHandler(async (req, res) => {
    const ws = await Workspace.create({ ...req.body, owner: req.user._id });
    await Membership.create({ workspace: ws._id, user: req.user._id, role: 'owner' });
    res.status(201).json({ workspace: { ...ws.toObject(), role: 'owner' } });
  })
);

router.get(
  '/:workspaceId',
  loadMembership,
  asyncHandler(async (req, res) => {
    const ws = await Workspace.findById(req.params.workspaceId);
    if (!ws) throw new ApiError(404, 'Workspace not found');
    res.json({ workspace: { ...ws.toObject(), role: req.role } });
  })
);

router.patch(
  '/:workspaceId',
  loadMembership,
  requireRole('admin'),
  validate(wsSchema.partial()),
  asyncHandler(async (req, res) => {
    const ws = await Workspace.findByIdAndUpdate(req.params.workspaceId, req.body, { new: true });
    res.json({ workspace: { ...ws.toObject(), role: req.role } });
  })
);

router.delete(
  '/:workspaceId',
  loadMembership,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    evictFromWorkspace(req.params.workspaceId); // close live rooms for everybody
    await deleteWorkspaceCascade(req.params.workspaceId);
    res.json({ message: 'Workspace deleted' });
  })
);

// ---- members ----
router.get(
  '/:workspaceId/members',
  loadMembership,
  asyncHandler(async (req, res) => {
    const members = await Membership.find({ workspace: req.params.workspaceId }).populate('user', 'name email avatar');
    res.json({
      members: members
        .filter((m) => m.user)
        .map((m) => ({ user: m.user.toJSON(), role: m.role, joinedAt: m.createdAt }))
        .sort((a, b) => RANK[b.role] - RANK[a.role] || a.user.name.localeCompare(b.user.name)),
    });
  })
);

// You may only manage people ranked strictly below you, and only grant roles strictly below your own.
router.patch(
  '/:workspaceId/members/:userId',
  loadMembership,
  requireRole('admin'),
  validate(roleSchema),
  asyncHandler(async (req, res) => {
    const target = await Membership.findOne({ workspace: req.params.workspaceId, user: req.params.userId });
    if (!target) throw new ApiError(404, 'Member not found');
    if (RANK[target.role] >= RANK[req.role]) throw new ApiError(403, 'You cannot change this member');
    if (RANK[req.body.role] >= RANK[req.role]) throw new ApiError(403, 'You cannot grant that role');
    target.role = req.body.role;
    await target.save();
    const who = await User.findById(req.params.userId).select('name');
    await logActivity({ workspace: req.params.workspaceId, actor: req.user._id, action: 'member_role_changed', text: `changed ${who?.name || 'a member'}'s role to ${target.role}` });
    emit(`ws:${req.params.workspaceId}`, 'members:changed', { workspaceId: req.params.workspaceId }, req);
    res.json({ role: target.role });
  })
);

router.delete(
  '/:workspaceId/members/:userId',
  loadMembership,
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const selfLeave = String(req.params.userId) === String(req.user._id);
    const target = await Membership.findOne({ workspace: wid, user: req.params.userId });
    if (!target) throw new ApiError(404, 'Member not found');
    if (target.role === 'owner') throw new ApiError(400, 'The workspace owner cannot be removed (delete the workspace instead)');
    if (!selfLeave) {
      if (RANK[req.role] < RANK.admin || RANK[target.role] >= RANK[req.role])
        throw new ApiError(403, 'You cannot remove this member');
    }
    await target.deleteOne();
    const gone = await User.findById(target.user).select('name');
    await logActivity({ workspace: wid, actor: req.user._id, action: 'member_removed', text: selfLeave ? 'left the workspace' : `removed ${gone?.name || 'a member'} from the workspace` });
    // clean up references so no one is left assigned to work they can no longer see
    const ws = await Workspace.findById(wid);
    await Task.updateMany({ workspace: wid, assignee: target.user }, { $set: { assignee: null } });
    await Project.updateMany({ workspace: wid }, { $pull: { members: target.user } });
    await Project.updateMany({ workspace: wid, owner: target.user }, { $set: { owner: ws.owner } });
    evictFromWorkspace(wid, target.user); // their open tabs stop receiving this workspace's events
    emit(`ws:${wid}`, 'members:changed', { workspaceId: wid }, req);
    res.json({ message: selfLeave ? 'You left the workspace' : 'Member removed' });
  })
);

// ---- invitations (admin side) ----
router.get(
  '/:workspaceId/invitations',
  loadMembership,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const invitations = await Invitation.find({
      workspace: req.params.workspaceId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .sort('-createdAt')
      .populate('invitedBy', 'name');
    res.json({ invitations });
  })
);

router.post(
  '/:workspaceId/invitations',
  loadMembership,
  requireRole('admin'),
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const wid = req.params.workspaceId;
    const { email, role } = req.body;
    if (RANK[role] >= RANK[req.role]) throw new ApiError(403, 'You cannot invite someone with that role');
    const existing = await User.findOne({ email });
    if (existing && (await Membership.exists({ workspace: wid, user: existing._id })))
      throw new ApiError(409, 'That person is already a member');
    if (await Invitation.exists({ workspace: wid, email, status: 'pending', expiresAt: { $gt: new Date() } }))
      throw new ApiError(409, 'There is already a pending invitation for that email');
    const invitation = await Invitation.create({ workspace: wid, email, role, invitedBy: req.user._id });
    await logActivity({ workspace: wid, actor: req.user._id, action: 'member_invited', text: `invited ${email} as ${role}` });
    const ws = await Workspace.findById(wid);
    await sendMail({
      to: email,
      subject: `${req.user.name} invited you to ${ws.name} on TaskJira`,
      text: `You have been invited to join "${ws.name}" as ${role}.\nLog in (or sign up with this email) and accept the invitation:\n${env.clientUrl}/\n\nThe invitation expires in 7 days.`,
    });
    emit(`ws:${wid}`, 'members:changed', { workspaceId: wid }, req);
    res.status(201).json({ invitation });
  })
);

router.delete(
  '/:workspaceId/invitations/:invitationId',
  loadMembership,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const inv = await Invitation.findOneAndUpdate(
      { _id: req.params.invitationId, workspace: req.params.workspaceId, status: 'pending' },
      { status: 'revoked' },
      { new: true }
    );
    if (!inv) throw new ApiError(404, 'Invitation not found');
    res.json({ message: 'Invitation revoked' });
  })
);

// ---- nested resources (all require membership of :workspaceId) ----
router.use('/:workspaceId/projects', loadMembership, projectRoutes);
router.use('/:workspaceId/tasks', loadMembership, taskRoutes);
router.use('/:workspaceId/views', loadMembership, viewRoutes);
router.use('/:workspaceId/search', loadMembership, searchRoutes);
router.use('/:workspaceId/activity', loadMembership, activityRoutes);
router.use('/:workspaceId/analytics', loadMembership, analyticsRoutes);

export default router;
