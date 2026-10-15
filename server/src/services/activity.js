import { Activity } from '../models/Activity.js';

export async function logActivity({ workspace, project, task, actor, action, field, from, to, text }) {
  try {
    await Activity.create({ workspace, project, task, actor, action, field, from, to, text });
  } catch (err) {
    console.error('Activity log failed:', err.message); // never break the request because of logging
  }
}
