# Collab Editor

Real-time collaborative code editor: Next.js + Monaco + Yjs, custom Node WebSocket
server, Postgres persistence, Redis pub/sub for horizontal scaling.

## Run (infra in Docker, apps local — best for development)

```bash
npm install
npm run infra                 # postgres + redis (runs db/*.sql on first start)
npm run dev:realtime          # :4000
npm run dev:realtime2         # :4001  (second instance)
npm run dev:web               # :3000
```

Open http://localhost:3000, register two users (use a private window for the second),
create a workspace, click **Share**, add the second user by email, and edit the same file.
Each tab connects to a random realtime instance, so edits crossing instances exercise Redis.

Already have a Postgres volume from before step 4? Apply the new schema:
`docker compose exec -T postgres psql -U collab -d collab < db/002_auth.sql`

## Tests

With infra + both realtime instances + web running:

```bash
npm run test:e2e
```

Covers auth, permissions, the file tree, ticket rejection, cross-instance sync,
viewer read-only enforcement, presence, persistence and cleanup on delete.

## Run everything in Docker

```bash
docker compose --profile app up --build
```

## How auth works

1. Browser signs in → httpOnly session cookie (JWT, 7 days).
2. Opening a file → `POST /api/ticket` checks workspace membership and mints a
   5-minute JWT bound to one room (`workspaceId:fileId`) and the caller's role.
3. The WebSocket connects with `?ticket=…`; the realtime server verifies it during the
   HTTP upgrade (no ticket / wrong room / bad signature → 401, no socket).
4. Viewers' sync messages that carry updates are dropped server-side.

Known limits: role changes apply to *new* connections only; tickets appear in the URL
(keep access logs scrubbed); no login rate limiting yet.

## Layout

```
apps/realtime   WS server: ticket auth, Yjs sync + awareness, Postgres log, Redis bus
apps/web        Next.js: UI + REST API (auth, workspaces, members, files, tickets)
db/*.sql        schema, applied in order
scripts/e2e.mjs end-to-end test
```

## Roadmap
1. [x] Monorepo + Docker Compose
2. [x] Multi-user editing over custom WS server
3. [x] Postgres persistence + compaction
4. [x] Auth, workspaces, roles, file tree
5. [x] Presence (basic cursors + user list)
6. [ ] Custom reconnecting provider + offline edits test
7. [x] Redis pub/sub across instances (add nginx to load-balance)
8. [ ] Version history + diff UI
9. [ ] Sandboxed code execution (BullMQ + locked-down containers)
10. [ ] Load test, metrics, architecture doc
