// Dependency graph helpers. A "blocks" link A -> B means B cannot start before A is finished.

const adjacency = (links) => {
  const g = new Map();
  for (const l of links) {
    const f = String(l.from);
    if (!g.has(f)) g.set(f, []);
    g.get(f).push(String(l.to));
  }
  return g;
};

// Path (list of task ids) from `start` to `goal` following blocks edges, or null.
export function findPath(links, start, goal) {
  const g = adjacency(links);
  const seen = new Set();
  const walk = (node, path) => {
    if (node === String(goal)) return path;
    if (seen.has(node)) return null;
    seen.add(node);
    for (const nxt of g.get(node) || []) {
      const r = walk(nxt, [...path, nxt]);
      if (r) return r;
    }
    return null;
  };
  return walk(String(start), [String(start)]);
}

// Adding from -> to would close a loop iff `to` can already reach `from`.
export const wouldCreateCycle = (links, from, to) => findPath(links, to, from);

// All elementary cycles found by DFS back-edges (deduplicated by node set). Used to flag data that already contains loops.
export function findCycles(links) {
  const g = adjacency(links);
  const state = new Map(); // 1 = on stack, 2 = done
  const stack = [];
  const cycles = [];
  const keys = new Set();
  const visit = (n) => {
    state.set(n, 1);
    stack.push(n);
    for (const m of g.get(n) || []) {
      if (state.get(m) === 1) {
        const cyc = stack.slice(stack.indexOf(m));
        const key = [...cyc].sort().join('|');
        if (!keys.has(key)) { keys.add(key); cycles.push(cyc); }
      } else if (!state.get(m)) visit(m);
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of g.keys()) if (!state.get(n)) visit(n);
  return cycles;
}

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const label = (t) => `#${t.number} ${t.title}`;

/**
 * Scheduling conflicts along "blocks" links (finish-to-start, zero lag):
 *  - blocked task starts (or is due) before its blocker is due
 *  - blocked task is already done while the blocker is not
 *  - blocker is overdue and still open, so everything after it will slip (warning)
 */
export function findConflicts({ tasks, links, isDone, today = new Date().toISOString().slice(0, 10) }) {
  const byId = new Map(tasks.map((t) => [String(t._id), t]));
  const out = [];
  for (const l of links) {
    const a = byId.get(String(l.from)); // blocker
    const b = byId.get(String(l.to)); // blocked
    if (!a || !b) continue;
    const aDue = day(a.dueDate);
    const bStart = day(b.startDate);
    const bDue = day(b.dueDate);
    const base = { blocker: String(a._id), blocked: String(b._id) };
    if (aDue && bStart && bStart < aDue)
      out.push({ ...base, type: 'starts_before_blocker_ends', severity: 'error', message: `${label(b)} starts on ${bStart}, before its blocker ${label(a)} is due on ${aDue}` });
    else if (aDue && !bStart && bDue && bDue < aDue)
      out.push({ ...base, type: 'due_before_blocker', severity: 'error', message: `${label(b)} is due on ${bDue}, before its blocker ${label(a)} is due on ${aDue}` });
    if (isDone(b) && !isDone(a))
      out.push({ ...base, type: 'done_before_blocker', severity: 'error', message: `${label(b)} is done but its blocker ${label(a)} is not` });
    if (!isDone(a) && aDue && aDue < today && (bStart || bDue))
      out.push({ ...base, type: 'blocker_overdue', severity: 'warning', message: `${label(a)} is overdue (due ${aDue}) and still blocks ${label(b)}` });
  }
  return out;
}
