import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { User } from './models/User.js';
import { Membership } from './models/Membership.js';
import { Project } from './models/Project.js';
import { Task } from './models/Task.js';
import { isId } from './utils/ApiError.js';

/*
 * Rooms (every join is authorised against the database):
 *   user:<id>      personal channel - live notifications (joined automatically)
 *   ws:<id>        workspace room - presence, workspace-wide change signals
 *   project:<id>   project room   - task / comment / sprint / timeline events of that project
 *   task:<id>      task room      - live comments + "who is viewing this task"
 * A socket can only join rooms of workspaces it is a member of; removing a member evicts their sockets.
 */
let io = null;
const presence = new Map(); // workspaceId -> Map(userId -> { user, sockets: Map(socketId -> { project, task }) })

const parseCookies = (header = '') =>
  Object.fromEntries(header.split(';').map((c) => c.trim()).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));

async function authorize(userId, type, id) {
  if (!isId(id)) return null;
  let workspace;
  let room;
  if (type === 'workspace') { workspace = id; room = `ws:${id}`; }
  else if (type === 'project') {
    const p = await Project.findById(id).select('workspace');
    if (!p) return null;
    workspace = String(p.workspace); room = `project:${id}`;
  } else if (type === 'task') {
    const t = await Task.findById(id).select('workspace');
    if (!t) return null;
    workspace = String(t.workspace); room = `task:${id}`;
  } else return null;
  return (await Membership.exists({ workspace, user: userId })) ? { room, workspace } : null;
}

function broadcastPresence(wid) {
  const users = [...(presence.get(wid)?.values() || [])].map(({ user, sockets }) => ({
    user,
    projects: [...new Set([...sockets.values()].map((s) => s.project).filter(Boolean))],
    tasks: [...new Set([...sockets.values()].map((s) => s.task).filter(Boolean))],
  }));
  io.to(`ws:${wid}`).emit('presence:update', { workspaceId: wid, users });
}

function removePresence(socket, wid) {
  const ws = presence.get(wid);
  const entry = ws?.get(socket.data.user._id);
  if (!entry) return;
  entry.sockets.delete(socket.id);
  if (!entry.sockets.size) ws.delete(socket.data.user._id);
  if (!ws.size) presence.delete(wid);
  broadcastPresence(wid);
}

export function initRealtime(server) {
  io = new Server(server, { cors: { origin: env.clientUrl, credentials: true }, serveClient: false });

  io.use(async (socket, next) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie).access_token;
      if (!token) return next(new Error('TOKEN_EXPIRED'));
      const { sub } = jwt.verify(token, env.accessSecret);
      const user = await User.findById(sub).select('name email avatar');
      if (!user) return next(new Error('TOKEN_EXPIRED'));
      socket.data.user = { _id: String(user._id), name: user.name, avatarUrl: user.avatar ? `/uploads/avatars/${user.avatar}` : null };
      socket.data.rooms = new Map(); // room -> workspaceId
      next();
    } catch {
      next(new Error('TOKEN_EXPIRED')); // client refreshes its cookies and reconnects
    }
  });

  io.on('connection', (socket) => {
    const me = socket.data.user;
    socket.join(`user:${me._id}`);
    // events of one socket are handled strictly in order (e.g. "join project" always finishes before "viewing project")
    let queue = Promise.resolve();
    const ordered = (fn) => (...args) => { queue = queue.then(() => fn(...args)).catch(() => {}); };

    socket.on('join', ordered(async (payload, ack) => {
      try {
        const { type, id } = payload || {};
        if (socket.data.rooms.size >= 100) return ack?.({ ok: false, error: 'Too many rooms' });
        const auth = await authorize(me._id, type, id);
        if (!auth) return ack?.({ ok: false, error: 'Not allowed' });
        socket.join(auth.room);
        socket.data.rooms.set(auth.room, auth.workspace);
        if (type === 'workspace') {
          if (!presence.has(id)) presence.set(id, new Map());
          const ws = presence.get(id);
          if (!ws.has(me._id)) ws.set(me._id, { user: me, sockets: new Map() });
          ws.get(me._id).sockets.set(socket.id, { project: null, task: null });
          broadcastPresence(id);
        }
        ack?.({ ok: true });
      } catch { ack?.({ ok: false, error: 'Join failed' }); }
    }));

    socket.on('leave', ordered((payload) => {
      const { type, id } = payload || {};
      const room = { workspace: `ws:${id}`, project: `project:${id}`, task: `task:${id}` }[type];
      if (!room || !socket.data.rooms.has(room)) return;
      const wid = socket.data.rooms.get(room);
      socket.leave(room);
      socket.data.rooms.delete(room);
      if (type === 'workspace') removePresence(socket, wid);
    }));

    // which project / task this tab is looking at (only accepted for rooms the socket really joined)
    socket.on('presence:viewing', ordered((payload) => {
      const { projectId = null, taskId = null } = payload || {};
      const wid = socket.data.rooms.get(`project:${projectId}`) || socket.data.rooms.get(`task:${taskId}`);
      const entry = [...presence.entries()].find(([w, m]) => m.get(me._id)?.sockets.has(socket.id) && (!wid || w === wid));
      if (!entry) return;
      const cur = entry[1].get(me._id).sockets.get(socket.id);
      cur.project = socket.data.rooms.has(`project:${projectId}`) ? projectId : null;
      cur.task = socket.data.rooms.has(`task:${taskId}`) ? taskId : null;
      broadcastPresence(entry[0]);
    }));

    socket.on('disconnect', () => {
      for (const wid of new Set(socket.data.rooms.values())) removePresence(socket, wid);
    });
  });
  return io;
}

/** Emit to one or more rooms. When the HTTP request carries X-Socket-Id, that tab is skipped (it already has the change). */
export function emit(rooms, event, payload, req) {
  if (!io) return;
  let op = io.to(rooms);
  const sid = req?.get?.('x-socket-id');
  if (sid) op = op.except(sid);
  op.emit(event, payload);
}

/** Remove a user's sockets from every room of a workspace (member removed / left). userId=null evicts everybody. */
export function evictFromWorkspace(workspaceId, userId = null) {
  if (!io) return;
  const wid = String(workspaceId);
  for (const s of io.sockets.sockets.values()) {
    if (userId && s.data.user._id !== String(userId)) continue;
    let hit = false;
    for (const [room, w] of [...s.data.rooms]) if (w === wid) { s.leave(room); s.data.rooms.delete(room); hit = true; }
    if (hit) { removePresence(s, wid); s.emit('evicted', { workspaceId: wid }); }
  }
}
