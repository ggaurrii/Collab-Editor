# ⚡ CollabEditor

> High-performance, horizontally scalable real-time collaborative code editor built with **Next.js**, **Monaco Editor**, **Yjs (CRDT)**, **Custom Node.js WebSockets**, **PostgreSQL**, and **Redis Pub/Sub**.

---

## 🌟 Overview

**CollabEditor** is a distributed collaborative development environment designed for real-time multiplayer editing, scalable state synchronization, and robust document persistence.

Instead of relying on third-party black-box sync engines, CollabEditor features a custom WebSocket server speaking raw binary Yjs sync and awareness protocols, horizontally partitioned across multiple server instances with Redis Pub/Sub, and backed by a PostgreSQL append-only CRDT binary log with automatic periodic compaction.

---

## 🏗️ Architecture

```
                                 ┌────────────────────────┐
                                 │   Browser / Client     │
                                 │ Next.js + Monaco + Yjs │
                                 └───────────┬────────────┘
                                             │
                       WebSocket (Binary Yjs Updates + Awareness)
                                             │
                        ┌────────────────────┴────────────────────┐
                        │                                         │
                        ▼                                         ▼
            ┌──────────────────────┐                  ┌──────────────────────┐
            │ Realtime Instance #1 │                  │ Realtime Instance #2 │
            │     (Node.js / ws)   │                  │     (Node.js / ws)   │
            └──────────┬───────────┘                  └───────────┬──────────┘
                       │                                          │
                       ├─────────────────────┬────────────────────┤
                       │                     │                    │
                       ▼                     ▼                    ▼
             ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
             │  Redis Pub/Sub   │  │   PostgreSQL DB  │  │ Next.js REST API │
             │  (Doc Channels)  │  │ (Snapshots & Log)│  │ (Auth & Workspaces)│
             └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## ✨ Key Technical Highlights & Engineering Decisions

### 1. **Conflict-Free Replicated Data Types (CRDTs) with Yjs**
- Utilizes state-of-the-art **Yjs** CRDTs to achieve mathematically provable convergence across concurrent edits without requiring a centralized lock coordinator.
- Employs a local `Y.UndoManager` scoped to individual users, ensuring that `Ctrl+Z` / `Cmd+Z` only rolls back edits made by the invoking user without corrupting peer contributions.

### 2. **Custom Binary WebSocket Protocol**
- Built on Node.js `ws` using `y-protocols` and `lib0` binary encoding/decoding.
- Avoids JSON serialization overhead by transmitting raw byte arrays for sync steps (`MSG_SYNC`) and live presence updates (`MSG_AWARENESS`).

### 3. **Horizontal Scalability via Redis Pub/Sub**
- Multi-instance topology with room-level channel partitioning: `doc:{workspaceId}:{fileId}`.
- Smart origin tagging: instances apply updates locally and broadcast strictly local mutations to Redis, preventing infinite echo loops while ensuring $O(1)$ fan-out across server nodes.

### 4. **Dual-Tier Ticket-Based Authentication**
- **Web App**: Authenticates via `httpOnly` secure session cookies containing signed JWTs (7-day TTL).
- **WebSocket Upgrade**: Single-use, cryptographically signed 5-minute tickets minted at `POST /api/ticket` bound to `workspaceId:fileId` and the user's role.
- **Role Enforcement at the Wire**: Unauthorized upgrades are rejected with HTTP `401`. Viewer-role users have incoming CRDT update vectors rejected at the socket layer.

### 5. **PostgreSQL Binary Persistence & Compaction**
- Stores raw `BYTEA` Yjs update logs rather than text representations.
- Automatically collapses update logs into a single compact state snapshot (`file_snapshots`) every 200 mutations to bound query latency and storage overhead.

---

## 📁 Repository Structure

```text
collab-editor/
├── apps/
│   ├── realtime/                 # Realtime sync service
│   │   ├── src/
│   │   │   ├── auth.ts          # Ticket verification & claims
│   │   │   ├── bus.ts           # Redis Pub/Sub message broker
│   │   │   ├── db.ts            # Postgres binary loader & compaction
│   │   │   └── server.ts        # Custom WebSocket & Yjs sync server
│   │   └── tsconfig.json
│   │
│   └── web/                      # Next.js frontend & REST API
│       ├── app/
│       │   ├── api/             # Workspaces, files, tickets, auth endpoints
│       │   ├── login/           # Auth login/registration UI
│       │   └── w/[workspaceId]/ # Workspace & editor layout
│       ├── components/
│       │   ├── CollabEditor.tsx # Monaco editor + Yjs binding & cursors
│       │   ├── FileTree.tsx     # Interactive file explorer
│       │   └── Workspace.tsx    # Multi-tab workspace manager
│       └── lib/                 # Auth helpers, DB pools, access guards
│
├── db/
│   ├── 001_init.sql             # Files, updates & snapshot schemas
│   └── 002_auth.sql             # Users, workspaces & member RBAC schema
├── scripts/
│   └── e2e.mjs                  # Comprehensive multi-instance E2E test suite
├── docker-compose.yml           # Multi-container orchestration (Postgres, Redis, Apps)
└── package.json                 # Monorepo configuration
```

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.x or higher)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL and Redis)

---

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/ggaurrii/Collab-Editor.git
cd Collab-Editor
npm install
```

### 2. Start PostgreSQL & Redis Infrastructure

Make sure **Docker Desktop is running**, then start the databases:

```bash
npm run infra
```
> *PostgreSQL starts on port `5432` and Redis starts on port `6379`.*

### 3. Launch Development Servers

Open 3 terminal windows/tabs:

* **Terminal 1: Realtime Server Instance #1** (Port `4000`)
  ```bash
  npm run dev:realtime
  ```

* **Terminal 2: Realtime Server Instance #2** (Port `4001`)
  ```bash
  npm run dev:realtime2
  ```

* **Terminal 3: Next.js Web Frontend** (Port `3000`)
  ```bash
  npm run dev:web
  ```

### 4. Experience Real-time Collaboration

1. Open **[http://localhost:3000](http://localhost:3000)** in your browser and register an account.
2. Create a new workspace and add a file.
3. Open a **Private / Incognito** window, register a second account.
4. From the first window, click **Share**, enter the second user's email, and invite them.
5. Open the same file across both windows — edits, remote selections, and multi-colored cursor presences sync in real-time across instances via Redis!

---

## 🐳 Docker Deployment (Full Stack)

To run the entire system (databases, multiple realtime instances, and web) in containerized isolation:

```bash
docker compose --profile app up --build
```

---

## 🧪 Testing & Verification

The repository includes an end-to-end test suite verifying:
- Authentication, session validation, and permission checks.
- Ticket lifecycle validation (expiration, forgery, workspace mismatch).
- File tree management (creation, rename, circular move prevention).
- Multi-instance cross-synchronization via Redis Pub/Sub.
- Viewer role enforcement (server-side drop of unauthorized updates).
- Document rebuild fidelity from PostgreSQL snapshots and delta logs.

Run the test suite:
```bash
npm run test:e2e
```

---



---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
