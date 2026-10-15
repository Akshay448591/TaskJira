// Tracks in-flight API requests so a thin top bar can show when something is slow.
// Pass { silent: true } in an axios config for background polling that should never show it.
let active = 0;
const subs = new Set();
const emit = () => subs.forEach((f) => f(active));
export const progress = {
  start() { active += 1; emit(); },
  done() { active = Math.max(0, active - 1); emit(); },
  subscribe(f) { subs.add(f); f(active); return () => subs.delete(f); },
};
