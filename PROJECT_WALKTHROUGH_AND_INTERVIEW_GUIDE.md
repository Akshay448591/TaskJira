# TaskJira: Complete Codebase Walkthrough & Interview Defense Guide

> **Note for the Reader**: This document is an in-depth, phase-by-phase architectural dissection of the TaskJira codebase. It is organized in the exact chronological reading and execution sequence required to understand the system from the metal up. Keep this file locally to prepare your interview presentations, and delete it whenever you are finished.

---

## Table of Contents
1. [The 30-Second Elevator Pitch & Tech Stack Defense](#1-the-30-second-elevator-pitch--tech-stack-defense)
2. [Master File Reading Sequence (Roadmap)](#2-master-file-reading-sequence-roadmap)
3. [Phase 0: Workspace Bootstrapping & Server Lifecycle](#phase-0-workspace-bootstrapping--server-lifecycle)
4. [Phase 1: Security, Identity & Dual-Token Authentication](#phase-1-security-identity--dual-token-authentication)
5. [Phase 2: Multi-Tenant Workspace Isolation & RBAC Matrix](#phase-2-multi-tenant-workspace-isolation--rbac-matrix)
6. [Phase 3: Real-Time Engine, Socket.IO & Multi-Tab Presence](#phase-3-real-time-engine-socketio--multi-tab-presence)
7. [Phase 4: Projects & Configurable Kanban Workflows](#phase-4-projects--configurable-kanban-workflows)
8. [Phase 5: Task Management, Ordering, Filtering, Subtasks & Storage](#phase-5-task-management-ordering-filtering-subtasks--storage)
9. [Phase 6: Directed Dependency Graph, Cycle Detection & Gantt Scheduling](#phase-6-directed-dependency-graph-cycle-detection--gantt-scheduling)
10. [Phase 7: Agile Sprints & Dynamic Burndown Reconstruction](#phase-7-agile-sprints--dynamic-burndown-reconstruction)
11. [Phase 8: Workspace Analytics, Velocity & Reporting Engine](#phase-8-workspace-analytics-velocity--reporting-engine)
12. [Phase 9: Notifications, @Mentions & Background Scheduler](#phase-9-notifications-mentions--background-scheduler)
13. [Phase 10: Production Observability, Health Telemetry & Containerization](#phase-10-production-observability-health-telemetry--containerization)
14. [Master Architectural Decision Matrix](#14-master-architectural-decision-matrix)
15. [Top 15 Hard Interview Questions & High-Scoring Responses](#15-top-15-hard-interview-questions--high-scoring-responses)

---

## 1. The 30-Second Elevator Pitch & Tech Stack Defense

### The Interview Pitch
> *"TaskJira is a full-stack, multi-tenant engineering project management platform designed for high concurrency and real-time collaboration. It pairs customizable Kanban boards, time-boxed agile sprints, and interactive Gantt charts with a Directed Acyclic Graph (DAG) dependency engine that mathematically prevents deadlocks and circular blocking.
>
> On the backend, it implements dual-token JWT rotation with theft-detection session invalidation, non-probing tenant isolation, and structured Prometheus/Winston observability. On the frontend, it delivers optimistic updates, reference-counted multi-room WebSocket synchronization, and automatic silent token refresh."*

### Why This Stack?
- **Node.js (v22 LTS) & Express (ESM)**: Event-driven asynchronous I/O ideal for WebSocket handshakes and high concurrent request volume with minimal thread overhead.
- **MongoDB & Mongoose**: Flexible document model accommodates custom project workflow schemas, dynamic sprint event logs, and nested task attributes while supporting fast compound indexing.
- **Socket.IO**: WebSocket protocol with automatic HTTP long-polling fallback, room multiplexing, and reconnection state persistence.
- **React 18 + Vite 5 + TailwindCSS**: Modern component tree with declarative state, rapid HMR during development, sub-150KB gzip production bundles, and utility-first styling.
- **Winston & Prom-Client**: Cloud-native observability exposing microsecond-accurate latency histograms and correlation IDs for distributed tracing.

---

## 2. Master File Reading Sequence (Roadmap)

To truly master the logic and dependencies without getting lost, follow this **11-Phase Reading Sequence**:

```
[Phase 0: Bootstrapping]
  ├── package.json (root) -> scripts/dev.js
  ├── server/package.json -> server/src/config/env.js -> server/src/config/db.js
  ├── server/src/index.js -> server/src/app.js
  └── client/package.json -> client/src/main.jsx -> client/src/App.jsx

[Phase 1: Auth & Identity]
  ├── server/src/models/User.js -> server/src/utils/tokens.js
  ├── server/src/middleware/rateLimit.js -> server/src/routes/auth.js
  ├── server/src/middleware/auth.js (requireAuth)
  ├── client/src/api/client.js (Axios refresh interceptor)
  └── client/src/context/AuthContext.jsx

[Phase 2: Multi-Tenancy & RBAC]
  ├── server/src/models/Workspace.js -> Membership.js -> Invitation.js
  ├── server/src/constants.js (RANK)
  ├── server/src/middleware/auth.js (loadMembership, requireRole)
  ├── server/src/routes/workspaces.js -> invitations.js
  └── client/src/context/WorkspaceContext.jsx -> pages/MembersPage.jsx

[Phase 3: Realtime Engine & Presence]
  ├── server/src/realtime.js (Socket.IO server, room authorization, presence map)
  ├── client/src/lib/socket.js (client socket, ref-counted rooms)
  ├── client/src/lib/realtime.js (React hooks: useRoom, useSocketEvent, useViewing)
  └── client/src/components/PresenceBar.jsx

[Phase 4: Projects & Workflows]
  ├── server/src/models/Project.js -> services/workflow.js
  ├── server/src/routes/projects.js
  └── client/src/pages/ProjectPage.jsx -> components/ColumnsEditor.jsx

[Phase 5: Tasks & Data Layer]
  ├── server/src/models/Task.js -> Comment.js
  ├── server/src/middleware/upload.js -> routes/tasks.js
  ├── client/src/lib/useTaskQuery.js -> components/TaskBrowser.jsx
  └── client/src/components/BoardView.jsx -> ListView.jsx -> TaskModal.jsx

[Phase 6: Dependencies & Gantt Graph]
  ├── server/src/models/TaskLink.js
  ├── server/src/services/schedule.js (wouldCreateCycle, findConflicts)
  ├── server/src/routes/timeline.js
  └── client/src/components/Timeline.jsx

[Phase 7: Agile Sprints & Burndown]
  ├── server/src/models/Sprint.js
  ├── server/src/services/sprints.js (logSprintTransition, burndown)
  ├── server/src/routes/sprints.js
  └── client/src/components/SprintsPanel.jsx

[Phase 8: Analytics & Reporting]
  ├── server/src/services/analytics.js
  ├── server/src/routes/analytics.js
  └── client/src/pages/AnalyticsPage.jsx -> components/Charts.jsx

[Phase 9: Notifications & Scheduler]
  ├── server/src/models/Notification.js -> services/notify.js
  ├── server/src/services/scheduler.js (runDeadlineCheck)
  └── client/src/components/NotificationBell.jsx

[Phase 10: Production Observability & Ops]
  ├── server/src/utils/logger.js -> utils/metrics.js -> middleware/observability.js
  ├── server/Dockerfile -> client/Dockerfile -> client/nginx.conf -> docker-compose.yml
  └── .github/workflows/ci-cd.yml
```

---

## Phase 0: Workspace Bootstrapping & Server Lifecycle

### 1. File Sequence to Inspect
1. `package.json` (root)
2. `server/src/config/env.js`
3. `server/src/config/db.js`
4. `server/src/index.js`
5. `server/src/app.js`
6. `client/src/main.jsx` & `client/src/App.jsx`

### 2. Deep Logic Breakdown
- **Root Orchestration (`package.json`)**: Uses npm `--prefix` flags to isolate dependencies between frontend and backend. Monorepo development is managed via `scripts/dev.js` which concurrently spawns both servers.
- **Environment Hydration (`server/src/config/env.js`)**: Validates environment variables (PORT, MONGO_URI, JWT secrets, SMTP config). Sets defaults for non-production environments to prevent startup halts.
- **Database Connection (`server/src/config/db.js`)**: Initializes Mongoose with pooled connections and strict query options.
- **Startup Sequence (`server/src/index.js`)**:
  ```javascript
  connectDB()
    .then(() => backfillSortFields()) // Idempotent data migration
    .then(() => {
      const server = http.createServer(app);
      initRealtime(server); // Binds Socket.IO to Express HTTP server
      server.listen(env.port, () => {
        startScheduler(); // Hourly background deadline worker
      });
    });
  ```
  *Notice the strict order*: Database must be live -> run migrations -> bind WebSockets to raw HTTP listener -> begin listening -> launch cron background workers.
- **Express Pipeline Architecture (`server/src/app.js`)**:
  1. `app.set('trust proxy', 1)`: Enables real IP resolution behind Nginx/Render reverse proxies.
  2. `observabilityMiddleware`: Attaches UUIDv4 request IDs and measures response durations.
  3. `/api/health`: Comprehensive system probe testing live MongoDB admin ping and memory consumption.
  4. `/api/metrics`: Prometheus metric registry dump.
  5. `helmet()` & `cors()`: Security policies. CORS explicitly validates null/same-origin probes without crashing.
  6. Static avatar delivery (`/uploads/avatars`). Note: Task attachments are deliberately **NOT** statically served; they require RBAC authentication.
  7. Modular API routes mounted under `/api/`.
  8. SPA Static Catch-all: In production, serves `client/dist/index.html` for any client-side routes.
  9. Centralized `errorHandler`: Formats exceptions into consistent JSON payloads.

### 3. Key Decisions & Interview Talking Points
- **Why bind Socket.IO to the Express HTTP Server directly?**
  *Interview Answer*: *"By binding Socket.IO and Express to a unified Node HTTP instance, we share port 5000, eliminating duplicate network listeners and simplifying container ingress. This also enables the WebSocket handshake to read Express cookies directly without duplicate auth microservices."*
- **Why perform an idempotent data migration (`backfillSortFields`) at startup?**
  *Interview Answer*: *"In agile iteration, database schemas evolve. Rather than maintaining complex manual migration tooling for a single instance, `backfillSortFields` ensures that old tasks lacking `priorityRank` or `completedAt` are backfilled once at startup without blocking or corrupting existing indexes."*

---

## Phase 1: Security, Identity & Dual-Token Authentication

### 1. File Sequence to Inspect
1. `server/src/models/User.js`
2. `server/src/utils/tokens.js`
3. `server/src/middleware/rateLimit.js`
4. `server/src/routes/auth.js`
5. `server/src/middleware/auth.js` (`requireAuth`)
6. `client/src/api/client.js`
7. `client/src/context/AuthContext.jsx`

### 2. Deep Logic Breakdown
- **User Document Schema (`User.js`)**:
  - `passwordHash`: Configured with `select: false` so database queries never leak password hashes unless explicitly overridden with `.select('+passwordHash')`.
  - `refreshTokens`: Array of `{ tokenHash, expiresAt }`, capped at 5 sessions per user.
- **Dual-Token Architecture (`tokens.js`)**:
  - **Access Token**: Short 15-minute TTL. Stored in `access_token` cookie. Contains minimal payload (`sub: user.id`).
  - **Refresh Token**: 7-day TTL. Contains `sub` and a random UUID `jti`. Stored in `refresh_token` cookie with `path: '/api/auth'` so it is never transmitted to standard endpoints.
- **Refresh Token Rotation & Theft Detection (`routes/auth.js`)**:
  ```javascript
  const hash = sha256(token);
  if (!user || !user.refreshTokens.some((t) => t.tokenHash === hash)) {
    // REUSE DETECTED! Token was valid JWT but already rotated out
    if (user) await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });
    clearAuthCookies(res);
    throw new ApiError(401, 'Session expired, please log in again', 'REFRESH_INVALID');
  }
  ```
  *The Mechanism*: Every time `/api/auth/refresh` is called, the consumed refresh token is deleted from the user's document, and a new pair is issued. If an attacker intercepts and replays an old refresh token, the server detects that the token hash is missing, flags token theft, wipes **all** sessions for that user account, and forces a complete re-login across all devices.
- **Silent Refresh Interceptor (`client/src/api/client.js`)**:
  - When any API call receives a 401 with `code: 'TOKEN_EXPIRED'`, Axios catches it.
  - A singleton promise (`refreshing = refreshing || api.post('/auth/refresh')`) guarantees that even if 10 API requests fail at the same moment, **only one** refresh request hits the server. All failed requests wait for that single promise to resolve, then automatically replay with the new access cookie.

### 3. Key Decisions & Interview Talking Points
- **Why `httpOnly`, `sameSite: 'lax'`, `secure` cookies over LocalStorage?**
  *Interview Answer*: *"Storing JWTs in LocalStorage leaves users vulnerable to Cross-Site Scripting (XSS). If malicious script executes, LocalStorage is immediately readable. With `httpOnly` cookies, JavaScript cannot access tokens. Combined with CSRF protection, CORS whitelisting, and `sameSite: 'lax'`, this provides enterprise defense-in-depth."*
- **Why hash refresh tokens in the database instead of storing raw JWTs?**
  *Interview Answer*: *"If the database is compromised, plaintext refresh tokens would allow an attacker to forge access tokens until token expiry. Storing SHA-256 hashes of the refresh tokens ensures the database only holds one-way verifiers."*

---

## Phase 2: Multi-Tenant Workspace Isolation & RBAC Matrix

### 1. File Sequence to Inspect
1. `server/src/models/Workspace.js`
2. `server/src/models/Membership.js`
3. `server/src/models/Invitation.js`
4. `server/src/constants.js` (`RANK`)
5. `server/src/middleware/auth.js` (`loadMembership`, `requireRole`)
6. `server/src/routes/workspaces.js`
7. `server/src/services/cascade.js`

### 2. Deep Logic Breakdown
- **Tenant Isolation (`Workspace.js` & `Membership.js`)**:
  - Every workspace owns projects, tasks, and sprints.
  - Workspaces do not embed member lists inside the workspace document; instead, a junction collection `Membership` with a compound unique index `{ workspace: 1, user: 1 }` enables performant lookups and horizontal scalability.
- **The Non-Probing Security Pattern (`middleware/auth.js`)**:
  ```javascript
  export const loadMembership = asyncHandler(async (req, res, next) => {
    const membership = await Membership.findOne({ workspace: workspaceId, user: req.user._id });
    if (!membership) throw new ApiError(404, 'Workspace not found'); // NOT 403!
    req.membership = membership;
    req.role = membership.role;
    next();
  });
  ```
  *Why 404 instead of 403?* If an unauthenticated or unauthorized user requests `/api/workspaces/64fa9b...`, returning `403 Forbidden` confirms to an attacker that the workspace ID exists. Returning `404 Not Found` prevents workspace enumeration attacks.
- **RBAC Hierarchy (`RANK` in `constants.js`)**:
  - `owner (4) > admin (3) > member (2) > viewer (1)`
  - Rule: Users can only modify or remove members ranked **strictly below** their own rank (`RANK[target.role] < RANK[req.role]`). Admins cannot alter other admins or owners.
- **Cascading Deletion Engine (`services/cascade.js`)**:
  - Deleting a workspace doesn't leave orphaned files or records.
  - Cleans up: Tasks, disk attachments (`fs.unlink`), comments, activities, notifications, task links, project saved views, sprints, milestones, and memberships inside a coordinated async batch.

---

## Phase 3: Real-Time Engine, Socket.IO & Multi-Tab Presence

### 1. File Sequence to Inspect
1. `server/src/realtime.js`
2. `client/src/lib/socket.js`
3. `client/src/lib/realtime.js`
4. `client/src/components/PresenceBar.jsx`

### 2. Deep Logic Breakdown
- **Handshake Authentication & Room Partitioning (`server/src/realtime.js`)**:
  - Socket.IO middleware parses cookies from the HTTP upgrade headers, decodes the JWT access token, and binds `socket.data.user`.
  - Default Personal Room: On connection, socket immediately joins `user:<userId>` to receive targeted direct notifications.
- **Fine-Grained Dynamic Authorization (`authorize`)**:
  - When a client emits `socket.emit('join', { type: 'project', id })`, the server doesn't blindly subscribe the socket. It queries MongoDB to confirm the user is a member of the project's parent workspace before granting access to `project:<id>`.
  - Room Cap: Prevents memory denial-of-service by limiting sockets to a maximum of 100 active rooms.
- **Self-Echo Suppression (`X-Socket-Id`)**:
  - When a user drags a task on the Kanban board, their UI updates optimistically.
  - The client attaches `X-Socket-Id: <socket.id>` to the REST request.
  - When the server mutates the database and broadcasts the change via `emit(room, event, payload, req)`, it invokes:
    ```javascript
    let op = io.to(rooms);
    const sid = req?.get?.('x-socket-id');
    if (sid) op = op.except(sid); // Exclude the originating tab!
    op.emit(event, payload);
    ```
  - Result: Zero flickering, zero redundant DOM re-renders for the author, while all collaborators see instant live updates!
- **Multi-Tab Presence Tracking**:
  - Tracked via `Map(workspaceId -> Map(userId -> { user, sockets: Map(socketId -> { project, task }) }))`.
  - If a user opens 3 tabs in the same project, they appear once in the presence avatar list. Only when the last socket of that user disconnects is their presence removed and broadcasted.
- **Client-Side Reference-Counted Room Joins (`client/src/lib/socket.js`)**:
  - If both `TaskBrowser` and `TaskModal` require `project:<id>`, `joinRoom` increments a reference counter (`cur.count += 1`). The socket only leaves the room when the count decrements to 0.

---

## Phase 4: Projects & Configurable Kanban Workflows

### 1. File Sequence to Inspect
1. `server/src/models/Project.js`
2. `server/src/services/workflow.js`
3. `server/src/routes/projects.js`
4. `client/src/pages/ProjectPage.jsx`
5. `client/src/components/ColumnsEditor.jsx`

### 2. Deep Logic Breakdown
- **Flexible Workflow Architecture (`Project.js`)**:
  - Unlike rigid platforms with hardcoded "To Do", "In Progress", "Done", TaskJira lets project managers customize columns:
    ```javascript
    columns: [{
      key: { type: String, required: true },
      label: { type: String, required: true },
      category: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' }
    }]
    ```
- **Category-Driven Business Logic (`services/workflow.js`)**:
  - Tasks don't depend on the column label to know if they are finished. The server uses `doneKeys(project)`: any column whose category is `'done'` flags a task as completed.
  - When a task moves to a `'done'` category column, the server automatically stamps `completedAt: new Date()` (essential for sprint burndown and analytics). Moving it out sets `completedAt: null`.

---

## Phase 5: Task Management, Ordering, Filtering, Subtasks & Storage

### 1. File Sequence to Inspect
1. `server/src/models/Task.js`
2. `server/src/routes/tasks.js`
3. `server/src/middleware/upload.js`
4. `client/src/components/TaskBrowser.jsx`
5. `client/src/components/BoardView.jsx`
6. `client/src/components/TaskModal.jsx`

### 2. Deep Logic Breakdown
- **Human-Friendly Workspace Numbering (`#1`, `#2`, `#142`)**:
  - Instead of forcing users to refer to 24-character ObjectIds (`64fa9b01c...`), TaskJira generates friendly identifiers per workspace.
  - Implemented via atomic counter increments on the workspace document:
    ```javascript
    const ws = await Workspace.findByIdAndUpdate(workspace, { $inc: { taskCounter: 1 } }, { new: true });
    return ws.taskCounter;
    ```
  - Thread-safe, avoids duplicate numbers without distributed locks.
- **Board Positioning & Sorting (`models/Task.js`)**:
  - Columns sort by `position: Number`. New tasks are appended to the bottom by querying `Task.find({ project, status }).sort('-position').limit(1)`.
  - Reordering sends the target index, and updates affected sibling tasks.
  - Helper sort fields (`priorityRank`, `noDue`) are maintained via Mongoose `pre('validate')` hooks to keep MongoDB indexes ultra-compact and sorting blazing fast.
- **Subtasks (One Level Deep Hierarchy)**:
  - `parent: { type: ObjectId, ref: 'Task', default: null }`.
  - Restricting subtasks to one level deep prevents recursive query waterfalls and unbounded database tree traversals while satisfying 99% of agile project needs.
- **Secure File Attachments (`middleware/upload.js`)**:
  - Uses Multer with custom filename hashing to prevent disk collisions.
  - Crucial Architecture Choice: Avatars are publicly served under `/uploads/avatars`, but task attachments are stored in a private directory. Download routes (`GET /api/workspaces/:wid/tasks/:taskId/attachments/:id`) verify membership and permissions before piping files to the client!

---

## Phase 6: Directed Dependency Graph, Cycle Detection & Gantt Scheduling

### 1. File Sequence to Inspect
1. `server/src/models/TaskLink.js`
2. `server/src/services/schedule.js`
3. `server/src/routes/timeline.js`
4. `client/src/components/Timeline.jsx`

### 2. Deep Logic Breakdown
- **Dependency Data Model (`TaskLink.js`)**:
  - Directed edge: `from` -> `to` with `type: 'blocks' | 'relates_to'`.
  - Semantic: `from` blocks `to` means `to` cannot begin until `from` is finished.
  - Normalization: In the UI, selecting "Task A is blocked by Task B" is internally normalized and stored as "Task B blocks Task A".
- **Cycle Detection Algorithm (`services/schedule.js`)**:
  - What happens if Task A blocks Task B, Task B blocks Task C, and a user tries to make Task C block Task A? That is a circular deadlock.
  - The algorithm:
    ```javascript
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
    export const wouldCreateCycle = (links, from, to) => findPath(links, to, from);
    ```
  - *Mathematical Logic*: Adding edge `A -> B` creates a directed cycle **if and only if** there is already a path from `B` to `A`!
  - If a path exists, the endpoint rejects the creation with HTTP 400 and returns the exact human-readable cycle path (e.g., `#12 -> #15 -> #19 -> #12`).
- **Scheduling Conflicts Analysis (`findConflicts`)**:
  - Checks three critical Gantt conditions:
    1. *Starts before blocker ends*: Dependent task starts before its prerequisite's due date.
    2. *Done before blocker*: Dependent task is marked Done while its blocker remains open.
    3. *Blocker overdue*: Blocker has slipped past today, meaning downstream schedules will slip.
- **Frontend Gantt Rendering (`Timeline.jsx`)**:
  - Custom SVG canvas drawing timeline bars, milestone diamonds, and cubic bezier dependency curves (`M x1 y1 C ... x2 y2`).
  - Supports direct drag-and-drop bar dragging with optimistic rendering and automatic conflict re-computation.

---

## Phase 7: Agile Sprints & Dynamic Burndown Reconstruction

### 1. File Sequence to Inspect
1. `server/src/models/Sprint.js`
2. `server/src/services/sprints.js`
3. `server/src/routes/sprints.js`
4. `client/src/components/SprintsPanel.jsx`

### 2. Deep Logic Breakdown
- **The Event-Sourced Delta Log Pattern (`Sprint.js`)**:
  - How do you build an accurate sprint burndown chart that reflects scope creep (adding/removing story points mid-sprint) and completed tasks over time?
  - Most naive apps store daily snapshots or just look at current task states, making retroactive analysis impossible.
  - TaskJira uses an **event-sourced delta log** on the sprint document:
    ```javascript
    log: [{
      at: { type: Date, default: Date.now },
      type: { type: String, enum: ['scope', 'done'] },
      points: Number,
      count: Number,
      task: ObjectId
    }]
    ```
- **Automated Sprint Transition Tracking (`services/sprints.js`)**:
  - Whenever a task is updated in `routes/tasks.js`, `logSprintTransition(before, after, taskId)` fires:
    - If points change from 3 to 5: pushes `{ type: 'scope', points: +2 }`.
    - If a task is completed: pushes `{ type: 'done', points: +5 }`.
    - If moved to backlog: pushes negative scope and done deltas.
- **Mathematical Burndown Reconstruction (`burndown`)**:
  - For each day in the sprint interval `[startDate, endDate]`:
    - `ideal = committed * (1 - dayIndex / totalDays)`
    - `actual = sumAt('scope', cutoff) - sumAt('done', cutoff)`
  - Returns both ideal and actual curves, rendering an enterprise-grade burndown chart!
- **Sprint Completion & Scope Carryover (`routes/sprints.js`)**:
  - Completing a sprint locks its snapshot stats (`completedPoints`, `committedPoints`, `carriedOver`).
  - PMs can choose whether incomplete tasks roll over to the next active sprint or return to the product backlog.

---

## Phase 8: Workspace Analytics, Velocity & Reporting Engine

### 1. File Sequence to Inspect
1. `server/src/services/analytics.js`
2. `server/src/routes/analytics.js`
3. `client/src/pages/AnalyticsPage.jsx`
4. `client/src/components/Charts.jsx`

### 2. Deep Logic Breakdown
- **High-Performance Memory Aggregation (`services/analytics.js`)**:
  - To provide instantaneous reporting across custom date ranges, the server executes a single lean query fetching the workspace's tasks, projects, and memberships.
  - It segregates data into three analytical lenses:
    1. **Cohort Analysis**: Tasks *created* within the window. Computes true on-time delivery rate, completion rate, and overdue rates.
    2. **Event Trends**: Work that *happened* within the window (tasks created vs completed per daily/weekly bucket).
    3. **Snapshot Workload**: Current distribution of open story points and overdue tasks across individual team members.
- **Team Velocity Computation**:
  - Aggregates completed story points across past sprints.
  - Computes running average velocity to assist engineering leads in realistic capacity planning.
- **Client-Side SVG Charting (`Charts.jsx`)**:
  - Pure React SVG rendering (bar charts, area trend charts, donut progress rings) without bulky external charting libraries, keeping frontend bundle size under 150KB.

---

## Phase 9: Notifications, @Mentions & Background Scheduler

### 1. File Sequence to Inspect
1. `server/src/models/Notification.js`
2. `server/src/services/notify.js`
3. `server/src/services/scheduler.js`
4. `server/src/routes/notifications.js`
5. `client/src/components/NotificationBell.jsx`
6. `client/src/components/MentionTextarea.jsx`

### 2. Deep Logic Breakdown
- **@Mention Extraction (`notify.js`)**:
  - When comments or task descriptions are submitted, regex parses `@handle` patterns:
    `/(?:^|[^\w@])@([a-z0-9][a-z0-9._-]{1,40})/gi`
  - Matches handles against workspace member email prefixes.
- **Notification Fan-out & Preferences**:
  - Filters out the actor (users never receive notifications for their own actions).
  - Checks each recipient's granular notification preferences (`settings.notifications[type].inApp` vs `.email`).
  - In-app alerts insert into `Notification` collection and emit immediately over `user:<id>` WebSocket rooms.
  - Email alerts trigger non-blocking background emails via Nodemailer.
  - *Fault-Tolerance*: Wrapped in try-catch blocks so an email transport error never aborts an ongoing HTTP database transaction.
- **Idempotent Background Deadline Scheduler (`services/scheduler.js`)**:
  - Runs on server boot (after 30s) and repeats every 60 minutes via `.unref()` timers.
  - Scans for tasks due within 24 hours or overdue tasks.
  - **The Idempotency Key**:
    - Stores `dueSoonNotifiedFor: Date` and `overdueNotifiedFor: Date` directly on the task document.
    - If `task.dueSoonNotifiedFor === task.dueDate`, it skips sending. If the user changes the due date to next Friday, the dates no longer match, allowing the scheduler to automatically re-arm and alert on the new date!

---

## Phase 10: Production Observability, Health Telemetry & Containerization

### 1. File Sequence to Inspect
1. `server/src/utils/logger.js`
2. `server/src/utils/metrics.js`
3. `server/src/middleware/observability.js`
4. `server/src/app.js` (`/api/health`, `/api/metrics`)
5. `server/Dockerfile` & `client/Dockerfile`
6. `client/nginx.conf` & `docker-compose.yml`
7. `.github/workflows/ci-cd.yml`

### 2. Deep Logic Breakdown
- **Distributed Correlation Tracing (`observability.js`)**:
  - Inbound HTTP requests receive or generate an `x-request-id` (UUIDv4).
  - Returns `x-request-id` and `x-response-time` headers to the client.
  - Propagates `requestId` into Winston JSON log records for unified log aggregation (e.g. Datadog, CloudWatch).
- **Prometheus Metrics Exposition (`metrics.js` & `/api/metrics`)**:
  - Exposes:
    - `taskjira_http_requests_total`: Counter by method, route, and status.
    - `taskjira_http_request_duration_seconds`: Histogram measuring latencies across buckets from 5ms to 5s.
    - `taskjira_active_socket_connections`: Gauge tracking real-time WebSocket clients.
    - Default Node.js process metrics (heap used, event loop lag, CPU usage).
- **Deep Health Probes (`/api/health`)**:
  - Evaluates MongoDB live round-trip latency via `admin().ping()`.
  - Emits HTTP 200 if connected, or HTTP 503 Service Unavailable if degraded, enabling Kubernetes / Render orchestrators to divert traffic during database blips.
- **Docker Multi-Stage Compilation & Least Privilege**:
  - **Server Image**: Built on `node:22-alpine`. Uses `dumb-init` as PID 1 to handle POSIX signals (`SIGTERM`, `SIGINT`) properly. Runs under unprivileged user `USER node`.
  - **Client Image**: Node builder compiles Vite assets; production runtime uses `nginx:alpine` to serve static assets with gzip compression, 1-year cache headers for `/assets/`, and reverse proxies `/api/` and `/socket.io/`.

---

## 14. Master Architectural Decision Matrix

| Architectural Problem | Chosen Solution | Why Alternatives Were Rejected |
|---|---|---|
| **Authentication Persistence** | Dual JWT in `httpOnly`, `sameSite: 'lax'` Cookies | LocalStorage is vulnerable to XSS. Plain session cookies require sticky sessions or centralized Redis stores. |
| **Token Theft / Leakage** | SHA-256 Hashed Refresh Token Rotation with Automatic Account Session Revocation | Static refresh tokens allow an attacker unlimited access until token expiry. Storing plain refresh tokens in DB risks token reuse if DB is dumped. |
| **Workspace Tenant Isolation** | `loadMembership` middleware returning `404 Not Found` for non-members | Returning `403 Forbidden` confirms resource existence, enabling malicious ID scanning. |
| **Realtime Self-Echo** | `X-Socket-Id` header with Socket.IO `.except(socketId)` | Without this, clients receive echoes of actions they already rendered optimistically, creating visual UI glitches and duplicate state mutations. |
| **Cyclic Task Dependencies** | Directed Graph DFS Reachability Check (`wouldCreateCycle`) | Allowing dependency cycles causes deadlocks in Gantt scheduling and infinite loops in automated project planners. |
| **Sprint Burndown Tracking** | Event-Sourced Delta Log (`log: [{ type, points, at }]`) | Static daily cron snapshots fail if tasks are backdated or changed mid-sprint, and cannot reconstruct burndown on demand. |
| **Task Reordering** | Lexicographical / Floating Position Ordering (`position`) | Linked list pointers require two writes per reorder and suffer race conditions. Array-based index rewrites require rewriting thousands of database records on every drag. |
| **Deadline Alert Spam** | Stamping `dueSoonNotifiedFor` with target Date | Hourly cron checks without state stamp duplicate alerts. Storing a boolean prevents re-alerting if a task is rescheduled. |
| **Process Management in Docker** | `dumb-init` with `USER node` | Node.js was not designed to run as PID 1; it ignores default `SIGTERM` signals, causing zombie processes and ungraceful container shutdowns. |

---

## 15. Top 15 Hard Interview Questions & High-Scoring Responses

### Q1: "How do you handle multi-tab synchronization and prevent self-echoes in Socket.IO?"
**High-Scoring Response:**
> *"When a user interacts with the app—say, moving a Kanban task—the client performs an optimistic UI update and issues a REST PATCH request. To prevent the server from broadcasting that mutation back to the originating tab (which would cause annoying layout jumps or double mutations), the client passes its `socket.id` in an `X-Socket-Id` header.
>
> On the backend, our `emit()` helper uses Socket.IO's `.except(socketId)` modifier. The event is broadcasted to all other collaborators in `project:<id>`, while excluding the sender. Furthermore, our presence tracker uses a nested map (`workspaceId -> userId -> Map(socketId)`) so that multiple open tabs for a single user are aggregated into one user presence indicator until their final tab closes."*

---

### Q2: "Explain your token refresh strategy and how you detect token replay or theft."
**High-Scoring Response:**
> *"We use short-lived 15-minute access tokens and 7-day refresh tokens stored in `httpOnly`, `secure`, `sameSite: 'lax'` cookies. The refresh cookie is scoped strictly to `/api/auth` to minimize exposure.
>
> To detect theft, we implement Refresh Token Rotation with reuse detection. Refresh tokens contain a unique `jti`. When created, a SHA-256 hash of the token is saved in the user's document. When `/api/auth/refresh` is hit, that specific hash is pulled from the database, and an entirely new pair is issued.
>
> If an attacker steals a refresh token and attempts to use it after the legitimate user has already refreshed, the server verifies the JWT signature, but discovers that its hash is no longer in the user's active session list. Recognizing this as token reuse, the server wipes all active refresh tokens for that account, immediately invalidating all sessions across all devices."*

---

### Q3: "How does the frontend avoid a storm of refresh requests if five API calls fail simultaneously when an access token expires?"
**High-Scoring Response:**
> *"We implement a singleton refresh mutex inside our Axios response interceptor in `client/src/api/client.js`.
>
> When requests return HTTP 401 with `TOKEN_EXPIRED`, rather than each request blindly calling `/api/auth/refresh`, we assign the refresh call to a shared variable: `refreshing = refreshing || api.post('/auth/refresh').finally(() => (refreshing = null))`. All simultaneous failed requests await the exact same promise. Once that single request succeeds, each queued request replays transparently. If the refresh fails, the user is cleanly signed out."*

---

### Q4: "How does your Directed Acyclic Graph (DAG) cycle detection prevent circular task blockers?"
**High-Scoring Response:**
> *"In project management, if Task A blocks Task B, and Task B blocks Task C, Task C must never block Task A, as this creates an unresolvable circular deadlock.
>
> In `server/src/services/schedule.js`, we enforce a DAG. Before creating a 'blocks' link from Task X to Task Y, we check if adding this edge would create a loop. Mathematically, adding edge `X -> Y` creates a cycle if and only if there is already an existing path from `Y` to `X`.
>
> We construct an adjacency map of all existing 'blocks' edges in the workspace and execute a Depth-First Search (DFS) starting from `Y` with `X` as the target. If `findPath(links, Y, X)` discovers a path, the transaction is rejected with HTTP 400, and we return the exact formatted dependency cycle to inform the user."*

---

### Q5: "How does your sprint burndown chart work if a team changes scope halfway through the sprint?"
**High-Scoring Response:**
> *"Most basic trackers take periodic snapshots, which break down when tasks are added, deleted, or re-estimated mid-sprint. TaskJira uses an event-sourced delta log stored directly on the `Sprint` document.
>
> Whenever a task assigned to an active sprint changes status or story points, `logSprintTransition` pushes an entry: `{ at: timestamp, type: 'scope' | 'done', points: delta, count: delta }`.
>
> When the burndown chart is requested, `burndown()` computes the curve dynamically for each calendar day:
> `ideal` is a linear slope from initial commitment to 0. `actual` is calculated at each day's midnight boundary as `sumAt('scope', cutoff) - sumAt('done', cutoff)`. This accurately reflects scope inflation, mid-sprint point additions, and early task completions."*

---

### Q6: "Why did you implement non-probing 404 responses instead of 403 Forbidden in workspace middleware?"
**High-Scoring Response:**
> *"In a multi-tenant B2B SaaS application, user enumeration and ID scanning are significant security vectors. If a user tries to access `/api/workspaces/64fa9b0...` and receives `403 Forbidden`, the application has confirmed that a workspace with that ID exists.
>
> In `server/src/middleware/auth.js`, our `loadMembership` middleware checks whether the requesting user is a member of the requested workspace. If no membership record exists, we throw `404 Not Found`. To non-members, existing workspaces and non-existent workspaces are indistinguishable, completely neutralizing identifier probing."*

---

### Q7: "How do you maintain task positions on Kanban boards during drag-and-drop operations?"
**High-Scoring Response:**
> *"Each task document stores a `position` number and a `status` corresponding to a workflow column. When a task is dragged between columns or reordered, we update the task's `status` and recalculate position ranks.
>
> In the database, we back this with a compound index on `{ workspace: 1, project: 1, status: 1, position: 1 }`. This allows MongoDB to fetch and sort entire board columns directly from the index tree without needing an in-memory sort stage."*

---

### Q8: "How do you prevent race conditions and duplicate alerts in your background deadline scheduler?"
**High-Scoring Response:**
> *"Our background scheduler runs hourly to notify users of tasks due within 24 hours or overdue tasks. A common pitfall in background workers is sending repetitive spam every hour.
>
> We solved this by making the operation idempotent. We store two timestamp fields on the task: `dueSoonNotifiedFor` and `overdueNotifiedFor`. When the checker runs, it checks whether `task.dueSoonNotifiedFor` equals `task.dueDate`. If so, it skips alerting.
>
> If an alert is sent, we update `dueSoonNotifiedFor = task.dueDate` in MongoDB. If the task deadline is subsequently pushed back by the assignee, the dates no longer match, automatically re-arming the alert for the new deadline."*

---

### Q9: "How do you handle file uploads securely, and why aren't task attachments statically served?"
**High-Scoring Response:**
> *"We separate public profile avatars from private project attachments. Avatars are static images and served under `/uploads/avatars`.
>
> Task attachments, however, may contain sensitive proprietary data (code snippets, architecture diagrams, customer data). They are saved by Multer outside the static document root with sanitized, hashed filenames.
>
> To download an attachment, requests must pass through `GET /api/workspaces/:wid/tasks/:taskId/attachments/:id`. This route runs `requireAuth` and `loadMembership`. Only verified members of that specific workspace can stream the file."*

---

### Q10: "Explain the Role-Based Access Control (RBAC) hierarchy and permissions inheritance."
**High-Scoring Response:**
> *"We define an integer ranking matrix in `constants.js`: `owner: 4, admin: 3, member: 2, viewer: 1`.
>
> Viewers have read-only access. Members can create and edit tasks, comments, and project items. Admins can manage project configurations, columns, invitations, and member roles.
>
> To prevent privilege escalation, an admin can only invite or assign roles that are strictly lower than their own rank (`RANK[role] < RANK[req.role]`). An admin cannot promote someone to admin or modify an owner. Owners cannot leave or be removed without transferring ownership or deleting the workspace."*

---

### Q11: "How is observability integrated into the system?"
**High-Scoring Response:**
> *"We implemented a cloud-native telemetry tier:
> 1. **Structured Winston Logging**: Every request receives an `x-request-id` UUID. In production, logs are output as structured JSON including method, URL, status code, high-resolution duration (`process.hrtime.bigint()`), user ID, and IP address.
> 2. **Prometheus Metrics**: Using `prom-client`, we expose standard Node process metrics plus custom metrics: `taskjira_http_requests_total` counter, `taskjira_http_request_duration_seconds` histogram, and `taskjira_active_socket_connections` gauge on `/api/metrics`.
> 3. **Deep Health Check**: `/api/health` reports uptime, memory (RSS, heap), and executes an active MongoDB `admin().ping()` to report database latency."*

---

### Q12: "How do you handle cascading deletions cleanly in MongoDB?"
**High-Scoring Response:**
> *"MongoDB doesn't have native SQL-style foreign key `ON DELETE CASCADE`. In `server/src/services/cascade.js`, we implemented explicit cascading services.
>
> When deleting a workspace, `deleteWorkspaceCascade` queries all associated tasks, identifies their disk attachment files, deletes the files from the filesystem via `fs.unlink`, and issues parallel deletions using `Promise.all` across Comments, Activities, Notifications, TaskLinks, Projects, SavedViews, Sprints, Milestones, and Memberships.
>
> Crucially, it also calls `evictFromWorkspace(workspaceId)` over WebSockets, forcefully closing room subscriptions and notifying connected client tabs that the workspace was deleted."*

---

### Q13: "What prevents memory leaks when users join and leave real-time rooms?"
**High-Scoring Response:**
> *"We implemented guards on both backend and frontend:
> 1. On the backend, we enforce a strict ceiling: a socket cannot join more than 100 rooms (`socket.data.rooms.size >= 100`). When a socket disconnects, its cleanup iterates over all registered rooms and purges presence maps.
> 2. On the frontend, room subscription in `client/src/lib/socket.js` is reference-counted. If three components on screen require the same project room, only one `join` event is emitted. When components unmount, the count decrements, and `leave` is emitted only when the count reaches zero."*

---

### Q14: "Why use `dumb-init` in your production Node.js Dockerfile?"
**High-Scoring Response:**
> *"When running Node inside a Docker container, Node executes as PID 1 by default. Node.js was not designed to act as an init system; it does not properly forward POSIX signals like `SIGTERM` or `SIGINT` to child processes, and it does not reap orphaned zombie processes.
>
> When Kubernetes or Docker tries to stop the container, Node fails to gracefully shut down within the grace period and gets ungracefully killed (`SIGKILL`), severing active database transactions and WebSocket connections.
>
> By using `dumb-init` as the container entrypoint, it acts as a lightweight PID 1, properly forwarding signals to the Node process to ensure clean, zero-downtime container termination."*

---

### Q15: "How does the frontend handle full-screen crashes gracefully?"
**High-Scoring Response:**
> *"We wrapped the single-page application in a custom React `ErrorBoundary` in `client/src/components/ErrorBoundary.jsx`.
>
> If an unexpected runtime rendering error occurs in a component, the error boundary intercepts it via `componentDidCatch`, logs diagnostics, and displays a friendly recovery screen with the error description and action buttons ('Try Again' and 'Reload Page'). This completely eliminates white-screen-of-death crashes for end users."*
