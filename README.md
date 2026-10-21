# TaskJira Technical Architecture and Operations Manual

## 1. System Overview

TaskJira is a high-concurrency, collaborative project management platform architected for modern software engineering teams. Built on a decoupled client-server model, it combines linear task tracking, customizable Kanban workflows, agile sprint planning, Gantt timelines, real-time presence, and activity auditing with an enterprise observability and automated deployment pipeline.

### Core Technology Stack
- **Backend Runtime**: Node.js (v20+ / v22 LTS), Express.js (ES Modules)
- **Database Engine**: MongoDB (v7.0+) with Mongoose ODM
- **Realtime Layer**: Socket.IO (bidirectional WebSocket transport with fallback)
- **Frontend Architecture**: React 18, React Router v6, Tailwind CSS, Vite 5
- **Observability**: Winston (structured JSON logging), Prom-Client (Prometheus exposition format)
- **Containerization**: Docker (multi-stage minimal Alpine images), Docker Compose
- **Continuous Integration & Delivery**: GitHub Actions with Render Deploy Hook integration
- **Test Harness**: Vitest, Supertest, MongoMemoryServer, Playwright

---

## 2. System Architecture

The application is structured into three discrete architectural tiers: the Presentation Layer (SPA), the API & Realtime Gateway Layer (Express + Socket.IO), and the Persistence Tier (MongoDB).

```
+--------------------------------------------------------------------------+
|                        Browser Client (React SPA)                        |
|   +-------------------+  +-----------------------+  +----------------+   |
|   | Views / Board     |  | Realtime Presence     |  | Error Boundary |   |
|   +-------------------+  +-----------------------+  +----------------+   |
+--------------------------------------------------------------------------+
          | HTTP/HTTPS (REST)                     | WebSockets (Socket.IO)
          v                                       v
+--------------------------------------------------------------------------+
|                      TaskJira Gateway & API Layer                        |
|   +------------------------------------------------------------------+   |
|   | Observability Middleware (Request Correlation & Latency Metrics) |   |
|   +------------------------------------------------------------------+   |
|   | Rate Limiting & Helmet Security Policies                         |   |
|   +------------------------------------------------------------------+   |
|   | Authentication & Workspace Tenant Isolation Enforcement          |   |
|   +------------------------------------------------------------------+   |
|   | Domain Routes: Auth, Workspaces, Projects, Tasks, Sprints        |   |
|   +------------------------------------------------------------------+   |
|   | Prometheus Registry (/api/metrics) & Deep Health (/api/health)   |   |
|   +------------------------------------------------------------------+   |
+--------------------------------------------------------------------------+
                                  |
                                  v
+--------------------------------------------------------------------------+
|                       Persistence Tier (MongoDB)                         |
|   Collections: Users, Workspaces, Memberships, Projects, Tasks,          |
|   TaskLinks, Comments, Sprints, Activities, Notifications                |
+--------------------------------------------------------------------------+
```

---

## 3. Data Model and Domain Entities

All persistence records enforce strict tenant isolation via workspace association.

### Key Schemas
- **User**: Authentication credentials (`passwordHash` excluded by default), profile metadata, active refresh token hashes (max 5 concurrent sessions per user), and in-app/email notification settings.
- **Workspace**: Tenant boundary owning all associated projects, tasks, and memberships.
- **Membership**: Junction entity establishing user association with a workspace, enforcing role ranks (`owner`, `admin`, `member`, `viewer`).
- **Project**: Workstream container defining customizable workflow columns, ownership, deadline, status (`planning`, `active`, `on_hold`, `completed`), and member access lists.
- **Task**: Granular unit of work containing position order, priority (`low`, `medium`, `high`, `urgent`), status column key, story points, start and due dates, parent task reference (subtasks), reporter, assignee, and labels.
- **TaskLink**: Directed dependency relations (`blocks`, `blocked_by`, `relates_to`). Dependency cycles are detected and prevented prior to insertion.
- **Sprint**: Time-boxed iteration tracking backlog scope, start/end dates, commitment points, and status transitions for burndown reconstruction.
- **Activity**: Append-only audit record detailing entity modifications, actors, timestamps, and field diffs.
- **Notification**: Targeted event alerts categorized by trigger type (`assigned`, `mentioned`, `comment`, `status_changed`, `due_soon`).

---

## 4. Security Architecture and Authorization Matrix

### Authentication Mechanism
Authentication relies on dual JSON Web Tokens (JWT) dispatched via secure, httpOnly cookies:
1. **Access Token**: Short-lived (15-minute TTL), containing user identification. Verified on every protected API and WebSocket handshake.
2. **Refresh Token**: Long-lived (7-day TTL), bound to a unique `jti` and cryptographically hashed (`SHA-256`) before database persistence.
3. **Token Rotation & Reuse Detection**: Each refresh invocation revokes the consumed token and issues an updated pair. If an already consumed token hash is submitted, the system flags token theft and immediately terminates all active sessions for that account.

### Workspace Tenant Isolation
Workspaces enforce non-probing isolation: API requests targeting workspace-scoped resources verify the requester's membership. If the user is not a member, the server returns an HTTP 404 Not Found rather than a 403 Forbidden, preventing workspace identifier scanning.

### Role-Based Access Control (RBAC) Matrix

| Operation | Viewer | Member | Admin | Owner |
|---|---|---|---|---|
| Read workspace, projects, tasks, comments | Permitted | Permitted | Permitted | Permitted |
| Create projects, tasks, comments, attachments | Denied | Permitted | Permitted | Permitted |
| Modify/archive project | Denied | Project Owner Only | Permitted | Permitted |
| Delete project | Denied | Project Owner Only | Permitted | Permitted |
| Delete task | Denied | Task Reporter Only | Permitted | Permitted |
| Invite member / alter member roles | Denied | Denied | Ranks Below Own | Permitted |
| Remove workspace members | Denied | Denied | Ranks Below Own | Permitted |
| Rename workspace | Denied | Denied | Permitted | Permitted |
| Delete workspace | Denied | Denied | Denied | Permitted |

---

## 5. Real-Time Communication Architecture

TaskJira utilizes Socket.IO to power live multi-user collaboration without full-page reloads.

### Room Partitioning
- `user:<userId>`: Private channel for user-specific real-time notifications and alerts.
- `ws:<workspaceId>`: Broadcast channel for workspace-level updates, membership alterations, and presence lists.
- `project:<projectId>`: Scoped channel for task state changes, Kanban drag-and-drop synchronizations, and sprint events.
- `task:<taskId>`: Granular channel for real-time task viewing indicators and incoming comments.

### Connection Lifecycle & Security
1. The WebSocket handshake extracts and validates the `access_token` httpOnly cookie.
2. Handshake authorization verifies active user status in the database before socket binding.
3. Every room join event (`socket.on('join')`) validates current workspace membership against MongoDB.
4. Member eviction triggers instant eviction: socket channels for that workspace are purged immediately (`evictFromWorkspace`).
5. Self-echo prevention: When an HTTP client modifies state, it transmits an `X-Socket-Id` header. The server broadcasts the event to the room excluding the originating socket.

---

## 6. Observability and Telemetry

The platform integrates enterprise-grade monitoring, metrics, and structured telemetry.

### 6.1 Structured Logging (Winston)
Log events are structured as JSON in production and colorized for local development:
- **Correlation ID**: Every inbound HTTP request is assigned a unique `x-request-id` (UUIDv4) or adopts the proxy header. This ID is propagated across all log statements, database queries, and the response header.
- **Log Schema**:
  ```json
  {
    "timestamp": "2026-10-21 23:50:20.123",
    "level": "info",
    "message": "HTTP GET /api/workspaces/6ad901... 200 [14.20ms]",
    "requestId": "4f18d783-6975-4302-86ee-bf847b2c0199",
    "method": "GET",
    "url": "/api/workspaces/6ad901...",
    "statusCode": 200,
    "durationMs": 14.2,
    "ip": "127.0.0.1",
    "userId": "6ad900bf..."
  }
  ```

### 6.2 Prometheus Metrics Exposition (`/api/metrics`)
Standard Prometheus metrics are collected and exposed on `/api/metrics` for scraping:
- `taskjira_http_requests_total`: Counter tracking total processed requests labeled by `method`, `route`, and `status_code`.
- `taskjira_http_request_duration_seconds`: Histogram measuring endpoint latency across standard duration buckets (5ms to 5s).
- `taskjira_active_socket_connections`: Gauge tracking currently connected WebSocket clients.
- `taskjira_process_resident_memory_bytes` / `taskjira_nodejs_heap_used_bytes`: Runtime memory allocation gauges.
- `taskjira_process_cpu_user_seconds_total`: Node.js process CPU consumption.

### 6.3 Deep Subsystem Health Monitoring (`/api/health`)
The `/api/health` endpoint serves as both an orchestrator probe and a diagnostic utility:
- **HTTP Status**: Returns `200 OK` when healthy, `503 Service Unavailable` if database connectivity fails.
- **Diagnostic Response**:
  ```json
  {
    "status": "ok",
    "ok": true,
    "uptimeSeconds": 1438,
    "timestamp": "2026-10-21T18:20:30.000Z",
    "version": "1.0.0",
    "database": {
      "status": "connected",
      "latencyMs": 1.45
    },
    "memory": {
      "rssMb": 62.14,
      "heapUsedMb": 31.85,
      "heapTotalMb": 48.22
    }
  }
  ```

### 6.4 Client-Side Error Boundary and Crash Telemetry
A React `ErrorBoundary` wraps the entire single-page application. In the event of an unhandled runtime error during rendering:
- The component intercepts the error and logs diagnostics to telemetry.
- Renders an error interface with technical error details.
- Provides immediate state-recovery options ("Reload Page" and "Try Again") to eliminate blank-screen failures.

---

## 7. Containerization and Docker Orchestration

The application provides production Dockerfiles for each tier and a unified `docker-compose.yml` for multi-service environments.

### 7.1 Server Container (`server/Dockerfile`)
- **Base Image**: `node:22-alpine`
- **Build Stages**:
  1. `dependencies`: Runs `npm ci --omit=dev` with native build utilities.
  2. `runtime`: Installs `dumb-init` for PID 1 signal forwarding, copies production dependencies, applies least-privilege non-root execution (`USER node`), and provisions an internal healthcheck probe.

### 7.2 Client Container (`client/Dockerfile`)
- **Base Image**: Multi-stage using `node:22-alpine` for asset building and `nginx:alpine` for delivery.
- **Nginx Capabilities (`client/nginx.conf`)**:
  - High-performance static asset serving with gzip compression.
  - One-year immutable cache headers on `/assets/`.
  - Seamless SPA route fallback (`try_files $uri $uri/ /index.html`).
  - Embedded reverse proxy routing `/api/` and `/socket.io/` directly to the backend service.

### 7.3 Multi-Container Orchestration (`docker-compose.yml`)
Spins up the entire platform locally or in container environments:
```bash
# Start all services (MongoDB, Server API, Nginx Client)
docker compose up -d --build

# View container logs
docker compose logs -f

# Verify running services and health status
docker compose ps

# Teardown services
docker compose down -v
```

### Container Port and Service Map
| Service | Container Name | Host Port | Internal Port | Healthcheck |
|---|---|---|---|---|
| MongoDB | `taskjira-mongo` | `27017` | `27017` | `mongosh ping` |
| Server API | `taskjira-server` | `5000` | `5000` | `wget /api/health` |
| Client Web | `taskjira-client` | `80` | `80` | `wget /` |

---

## 8. Continuous Integration & Continuous Delivery (CI/CD)

Automated testing, container validation, and production deployments are executed via GitHub Actions (`.github/workflows/ci-cd.yml`).

### Pipeline Stages
1. **Validation & Audit**: Audits Node environment and project configuration.
2. **Unit & Integration Testing**: Boots an automated MongoDB container service, runs `npm test` across all server and client test suites, and verifies zero failures.
3. **Build Validation**: Validates client asset compilation (`npm run build`).
4. **Docker Validation**: Executes `docker compose config` and builds Docker container images for both server and client.
5. **Render Automated Deployment**:
   - Executes exclusively on pushes to the `main` branch when all prior pipeline stages pass.
   - Invokes the Render Deploy Hook securely via HTTP POST.

### Configuring the Render Deploy Hook
1. Log in to your **Render Dashboard**.
2. Select your `taskjira` web service.
3. Navigate to **Settings** -> **Deploy Hook**.
4. Copy the unique URL (`https://api.render.com/deploy/srv-xxxx?key=yyyy`).
5. Open your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions**.
6. Create a new repository secret named `RENDER_DEPLOY_HOOK_URL` and paste the URL.
7. Subsequent pushes to `main` will automatically test, validate, and trigger zero-downtime deployment on Render.

---

## 9. Testing Strategy and Verified Results

The codebase is protected by automated unit, integration, and end-to-end test suites.

### Test Execution Commands
```bash
# Run all test suites across the workspace
npm test

# Run backend unit and integration tests only
npm run test:server

# Run frontend React unit tests only
npm run test:client

# Run Playwright end-to-end smoke tests
npm run test:e2e
```

### Test Suite Coverage and Verified Results

```
======================================================================
TEST SUITE SUMMARY EXECUTION RESULTS
======================================================================
Server Test Suites (Vitest):
  [PASS] tests/unit/tokens.test.js          (5 tests)
  [PASS] tests/unit/middleware.test.js      (5 tests)
  [PASS] tests/unit/validation.test.js      (4 tests)
  [PASS] tests/integration/health.test.js   (3 tests)
  [PASS] tests/integration/auth.test.js     (8 tests)
  [PASS] tests/integration/workspaces.test.js (3 tests)
  [PASS] tests/integration/tasks.test.js    (3 tests)
  Total Server: 7 files passed, 31 tests passed (100% success rate)

Client Test Suites (Vitest + JSDOM):
  [PASS] src/tests/constants.test.js        (8 tests)
  [PASS] src/tests/ErrorBoundary.test.jsx   (2 tests)
  Total Client: 2 files passed, 10 tests passed (100% success rate)

Overall Summary:
  Test Files: 9 passed (100%)
  Total Tests: 41 passed (100%)
  Failed Tests: 0
======================================================================
```

---

## 10. Performance Measurements and Benchmarks

### Production Asset Compilation Profile
- Client Build Tool: Vite v5.4.21
- Total Modules Transformed: 170 modules
- Compilation Time: 5.97 seconds
- Asset Payload Distribution:
  - `dist/index.html`: `1.11 kB` (gzip: `0.62 kB`)
  - `dist/assets/index.css`: `39.76 kB` (gzip: `7.33 kB`)
  - `dist/assets/index.js`: `435.93 kB` (gzip: `134.79 kB`)
  - Total compressed delivery payload: `< 143 kB`

### API Endpoint Latency Benchmarks (Local Baseline)
- `GET /api/health`: `< 2ms` (memory diagnostic + MongoDB ping)
- `GET /api/metrics`: `< 5ms` (registry compilation)
- `POST /api/auth/signup`: `~700ms - 900ms` (deliberate bcrypt cost factor 12)
- `POST /api/auth/login`: `~650ms - 800ms` (bcrypt comparison)
- `GET /api/workspaces`: `< 15ms` (indexed user membership lookup)
- `GET /api/workspaces/:id/tasks`: `< 25ms` (composite indexing on workspace and project)

### Database Indexing Strategy
- `User`: Unique index on `email`.
- `Membership`: Compound unique index on `{ workspace: 1, user: 1 }`.
- `Task`: Compound index on `{ workspace: 1, project: 1, status: 1 }`, index on `{ number: 1 }`.
- `TaskLink`: Compound unique index on `{ workspace: 1, source: 1, target: 1 }`.
- `Activity`: Index on `{ workspace: 1, createdAt: -1 }`.

---

## 11. Local Development Setup

### Prerequisites
- Node.js version 20 or 22
- MongoDB running locally on port 27017 or a valid MongoDB Atlas connection string

### Setup Steps
```bash
# 1. Clone repository
git clone https://github.com/Akshay448591/TaskJira.git
cd taskjira

# 2. Install all dependencies across root, server, and client
npm run install:all

# 3. Configure server environment variables
cp server/.env.example server/.env
# Update JWT secrets in server/.env if needed

# 4. Launch concurrent development servers
npm run dev
```

- Web Application: `http://localhost:5173`
- API Server: `http://localhost:5000`
- Health Probe: `http://localhost:5000/api/health`
- Prometheus Metrics: `http://localhost:5000/api/metrics`
