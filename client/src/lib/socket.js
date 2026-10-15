import { io } from 'socket.io-client';
import api from '../api/client.js';

// One shared Socket.IO connection. Auth uses the same httpOnly cookie as the REST API.
let socket = null;
let authRetries = 0;
const wanted = new Map(); // "type:id" -> { type, id, count }  (rooms to (re)join after every reconnect)
const viewing = { projectId: null, taskId: null };

const status = () => window.dispatchEvent(new Event('socket:status'));

export function connectSocket() {
  if (socket) { if (!socket.connected && !socket.active) socket.connect(); return socket; }
  const socketUrl = import.meta.env.VITE_API_URL || '/';
  socket = io(socketUrl, { withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    authRetries = 0;
    window.__socketId = socket.id;
    for (const w of wanted.values()) socket.emit('join', { type: w.type, id: w.id });
    if (viewing.projectId || viewing.taskId) socket.emit('presence:viewing', viewing);
    status();
  });
  socket.on('disconnect', () => { window.__socketId = null; status(); });
  // handshake rejected because the 15-minute access cookie expired: refresh it (REST does that) and try again
  socket.on('connect_error', async (err) => {
    status();
    if (err.message === 'TOKEN_EXPIRED' && authRetries < 3) {
      authRetries += 1;
      try { await api.get('/auth/me'); socket.connect(); } catch { /* signed out */ }
    }
  });
  return socket;
}

export function disconnectSocket() {
  wanted.clear();
  viewing.projectId = viewing.taskId = null;
  if (socket) { socket.disconnect(); socket = null; window.__socketId = null; status(); }
}

export const getSocket = () => socket || connectSocket();
export const isConnected = () => !!socket?.connected;

// Join a room (workspace | project | task). Reference counted; returns a function that leaves it.
export function joinRoom(type, id) {
  const k = `${type}:${id}`;
  const cur = wanted.get(k) || { type, id, count: 0 };
  cur.count += 1;
  wanted.set(k, cur);
  if (cur.count === 1 && socket?.connected) socket.emit('join', { type, id });
  return () => {
    const w = wanted.get(k);
    if (!w) return;
    w.count -= 1;
    if (w.count <= 0) { wanted.delete(k); if (socket?.connected) socket.emit('leave', { type, id }); }
  };
}

export function setViewing(patch) {
  Object.assign(viewing, patch);
  if (socket?.connected) socket.emit('presence:viewing', viewing);
}
