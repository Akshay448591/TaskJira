import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { Notification } from '../models/Notification.js';
import { NOTIFICATION_DEFAULTS } from '../constants.js';
import { sendMail } from '../utils/mailer.js';
import { emit } from '../realtime.js';

// @handle = the part of the email before "@" (e.g. akash.gupta@x.com -> @akash.gupta)
export const handleOf = (email) => email.split('@')[0].toLowerCase();

export async function findMentionedUsers(workspace, text) {
  if (!text) return [];
  const handles = new Set(
    [...text.matchAll(/(?:^|[^\w@])@([a-z0-9][a-z0-9._-]{1,40})/gi)].map((m) => m[1].toLowerCase().replace(/[._-]+$/, ''))
  );
  if (!handles.size) return [];
  const members = await Membership.find({ workspace }).populate('user', 'email');
  return members.map((m) => m.user).filter((u) => u && handles.has(handleOf(u.email))).map((u) => String(u._id));
}

export const mentionsIn = (text) =>
  new Set([...(text || '').matchAll(/(?:^|[^\w@])@([a-z0-9][a-z0-9._-]{1,40})/gi)].map((m) => m[1].toLowerCase().replace(/[._-]+$/, '')));

/**
 * Create in-app notifications and send emails according to each recipient's preferences.
 * The actor never notifies themselves, and only current workspace members are notified.
 * Never throws: a notification problem must not fail the request that triggered it.
 */
export async function notify({ workspace, project, task, type, recipients, message, actor }) {
  try {
    const ids = [...new Set((recipients || []).filter(Boolean).map(String))].filter((id) => !actor || id !== String(actor._id));
    if (!ids.length) return;
    const [users, members] = await Promise.all([
      User.find({ _id: { $in: ids } }),
      Membership.find({ workspace, user: { $in: ids } }).select('user'),
    ]);
    const allowed = new Set(members.map((m) => String(m.user)));
    const docs = [];
    for (const u of users) {
      if (!allowed.has(String(u._id))) continue;
      const pref = u.settings?.notifications?.[type];
      const inApp = pref?.inApp ?? NOTIFICATION_DEFAULTS[type].inApp;
      const wantsEmail = (pref?.email ?? NOTIFICATION_DEFAULTS[type].email) && u.settings?.emailNotifications !== false;
      if (inApp) docs.push({ user: u._id, workspace, project, task, actor: actor?._id, type, message });
      if (wantsEmail) {
        const who = actor ? `${actor.name} ` : '';
        const link = task && project ? `${env.clientUrl}/w/${workspace}/projects/${project}?task=${task}` : env.clientUrl;
        sendMail({ to: u.email, subject: `${who}${message}`.slice(0, 150), text: `${who}${message}\n\nOpen it: ${link}\n\nChange what you get emailed in TaskJira -> your profile -> Notifications.` });
      }
    }
    if (docs.length) {
      const created = await Notification.insertMany(docs);
      for (const n of created) {
        // live delivery to the recipient's open tabs
        emit(`user:${n.user}`, 'notification:new', {
          _id: n._id, type: n.type, message: n.message, workspace: n.workspace, project: n.project, task: n.task,
          actor: actor ? { _id: actor._id, name: actor.name } : null, createdAt: n.createdAt, read: false,
        });
      }
    }
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}
