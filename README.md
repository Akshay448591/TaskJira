# TaskJira

A basic Jira/Linear-style project management app.
**Stack:** MongoDB · Express · React (Vite) · Node.js · Tailwind CSS · JWT (httpOnly cookies)

## 1. Install (once)
- **Node.js 18+** (https://nodejs.org)
- **MongoDB** running locally on port 27017 (https://www.mongodb.com/try/download/community)
  - or use a free MongoDB Atlas cluster and paste its URL into `server/.env` as `MONGO_URI`

## 2. Run (3 steps)
```bash
cd taskjira
npm run install:all     # installs root + server + client dependencies
npm run dev             # starts API on :5000 and web app on :5173
```
Open **http://localhost:5173** and sign up.

`server/.env` is already filled with random development secrets.
For production generate new ones (see `server/.env.example`) and set `NODE_ENV=production` (enables `secure` cookies, requires HTTPS).

To run separately: `npm --prefix server run dev` and `npm --prefix client run dev`.

## 3. Emails (password reset + invitations)
With no SMTP settings, emails are **printed in the server terminal** (look for `=== MAIL ===`) - copy the reset link from there.
To send real emails fill `SMTP_*` in `server/.env`.

## Try the invite flow
Sign up as user A, create a workspace, go to Members -> invite `b@example.com`.
Sign up (second browser/incognito) as `b@example.com` -> the invitation appears on the home page -> Accept.

## Features
1. **Auth** - signup, login, logout, forgot/reset password, access (15 min) + refresh (7 days, rotated) JWTs in httpOnly cookies, reuse detection, profile, avatar, settings, change password, protected routes, zod validation, helmet, rate limiting (strict on auth endpoints).
2. **Workspaces** - create, invite by email, accept/reject/revoke, roles Owner/Admin/Member/Viewer. Every workspace route checks membership server-side; non-members get 404. All records carry a `workspace` id and every query is filtered by it.
3. **Projects** - create/edit/archive/delete, status, priority, deadline, owner + members, overview with completion % and task counts by status.
4. **Tasks** - create/edit/delete/duplicate, assignee, reporter, status, priority, due date, labels, description, attachments (10 MB each), subtasks, comments, activity history, search + filters, relations (blocks / blocked by / relates to).

## Update 2: board, views, search, notifications
5. **Kanban board** - per-project customizable workflow columns (rename, recolor, reorder, add, remove; each column has a category: To do / In progress / Done, and Done columns drive the completion %). Drag cards between columns or reorder inside one; saved to the database; the UI updates instantly and rolls back with an error message if the API fails. Filters: assignee, priority, label, due date.
6. **Views** - List (sortable columns, filters, pagination), Board, Calendar (due dates by month; drag a task to another day to reschedule). Saved filters/views (personal or shared) and a "Copy link" button: all filters, sorting, page and view are kept in the URL.
7. **Search & productivity** - Search page (tasks, projects, people, comments; sort + filter; shareable URL), command palette (`Ctrl/Cmd + K`), quick-create task (`C`), shortcuts (`?` shows all: `/` search, `G` then `P/T/A/M/S/N` to navigate).
8. **Notifications & activity** - bell + notification center (read/unread, filter by type), per-type in-app/email preferences (Profile page), notifications for assignment, @mentions, comments, status changes and approaching/overdue deadlines (hourly check). Activity feeds per task, per project and for the whole workspace (who changed what and when).

**@mentions:** type `@` + the part of a teammate's email before the `@` (autocomplete helps) in a comment or description.

**Emails** follow the same rule as before: printed in the server console unless `SMTP_*` is set.

## Update 3: real-time, sprints, analytics, timeline
**After updating run `npm run install:all` once** (adds `socket.io` / `socket.io-client`), then `npm run dev`.

9. **Real-time (Socket.IO)** - live task/board/list/calendar updates, live comments, live notifications (badge + pop-up toast), presence (online teammates in the sidebar, who is viewing a project or task), connection indicator. Rooms: `user:` (notifications), `ws:` (workspace), `project:`, `task:`. Every join is authorised against the database (membership), events are ordered per socket, removed members are evicted from rooms instantly, and the tab that made a change is not echoed its own event (`X-Socket-Id`). The socket uses the same httpOnly cookie as the API and re-authenticates after the 15-minute token rotation.
10. **Sprints** (project -> *Sprints & backlog*) - backlog + sprints with name, goal, start/end dates and story points; drag tasks (or "Move to") between backlog and sprints; one active sprint per project; progress bars; burndown (points or task count) rebuilt from a change log, so scope added mid-sprint is visible; completing a sprint carries unfinished tasks to the backlog, an existing planned sprint or a new sprint. Only the project owner / admins manage sprints.
11. **Analytics** (sidebar -> *Analytics*) - completion / overdue / on-time rates, workload per member, project progress, created vs completed trend, sprint velocity, sprint burndown, date-range filters and CSV export (tasks, workload, projects, trend, velocity). Definitions are printed on the page.
12. **Timeline** (project -> *Timeline*) - Gantt bars from start date to due date, milestones, project deadline, today line, dependency arrows (blocker -> blocked), drag a bar to reschedule, scheduling-conflict list and warnings, dependency-cycle detection (cycles are rejected when you create a link, and pre-existing ones are flagged).

New task fields: start date, story points, sprint (task details). Conflict rules are finish-to-start: a blocked task may not start (or be due) before its blocker is due, nor be done while its blocker is open.

**Production note:** presence and rooms live in memory, which is right for a single server. For several servers add the `@socket.io/redis-adapter`. Analytics are computed on demand, which is fine for thousands of tasks; for very large workspaces precompute snapshots.

## Permission matrix
| Action | Viewer | Member | Admin | Owner |
|---|---|---|---|---|
| View everything in workspace | yes | yes | yes | yes |
| Create projects, create/edit/duplicate tasks, comment, attach | - | yes | yes | yes |
| Edit/archive/delete a project | - | only if project owner | yes | yes |
| Delete a task | - | only own (reporter) | yes | yes |
| Invite / revoke / change roles / remove members | - | - | below own rank only | yes |
| Rename workspace | - | - | yes | yes |
| Delete workspace | - | - | - | yes |

## API (all under /api)
`/auth` signup, login, refresh, logout, me, forgot-password, reset-password · `/users/me` (+avatar, password) · `/invitations/mine`, `/invitations/:id/accept|reject` ·
`/workspaces` (+ `/:id/members`, `/:id/invitations`) · `/workspaces/:id/projects` · `/workspaces/:id/tasks` (+ comments, activity, attachments, links, duplicate)

## Project structure
```
server/src  config/ middleware/ models/ routes/ services/ utils/ app.js index.js
client/src  api/ components/ context/ lib/ pages/
```

## Notes
- Dev uses the Vite proxy so cookies are same-origin. In production serve the client and `/api` from the same domain (e.g. nginx) or set `CLIENT_URL` and review cookie `sameSite`.
- Board ordering uses a numeric `position` per task; on server start a one-time backfill fills sort helper fields for tasks created before update 2.
- Drag and drop uses native browser drag events (mouse). On touch screens change the status inside the task.
- Uploaded files live in `server/uploads/` (avatars public, attachments only via authenticated download).
