import { Router } from 'express';
import { Invitation } from '../models/Invitation.js';
import { Membership } from '../models/Membership.js';
import { requireAuth, checkIdParam } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

// Invitations from the point of view of the person who was invited.
const router = Router();
router.use(requireAuth);
router.param('invitationId', checkIdParam);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const invitations = await Invitation.find({
      email: req.user.email,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .sort('-createdAt')
      .populate('workspace', 'name description')
      .populate('invitedBy', 'name email');
    res.json({ invitations: invitations.filter((i) => i.workspace) });
  })
);

async function findMine(req) {
  const inv = await Invitation.findOne({ _id: req.params.invitationId, email: req.user.email, status: 'pending' });
  if (!inv) throw new ApiError(404, 'Invitation not found');
  if (inv.expiresAt < new Date()) throw new ApiError(410, 'Invitation has expired');
  return inv;
}

router.post(
  '/:invitationId/accept',
  asyncHandler(async (req, res) => {
    const inv = await findMine(req);
    await Membership.updateOne(
      { workspace: inv.workspace, user: req.user._id },
      { $setOnInsert: { role: inv.role } },
      { upsert: true }
    );
    inv.status = 'accepted';
    await inv.save();
    res.json({ workspaceId: inv.workspace });
  })
);

router.post(
  '/:invitationId/reject',
  asyncHandler(async (req, res) => {
    const inv = await findMine(req);
    inv.status = 'rejected';
    await inv.save();
    res.json({ message: 'Invitation rejected' });
  })
);

export default router;
