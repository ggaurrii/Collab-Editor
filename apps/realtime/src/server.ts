import http from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { loadDoc, appendUpdate, compact } from "./db.js";
import { INSTANCE_ID, publish, subscribeDoc, unsubscribeDoc } from "./bus.js";
import { verifyTicket, type Claims, type Role } from "./auth.js";

const PORT = Number(process.env.PORT ?? 4000);
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const COMPACT_EVERY = 200; // updates per room between compactions
const EVICT_AFTER_MS = 30_000; // keep empty rooms warm briefly

interface Room {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  ready: Promise<void>;
  updates: number;
  evictTimer?: NodeJS.Timeout;
}

const rooms = new Map<string, Room>();
/** awareness client ids owned by each socket, so we can clean up on disconnect */
const connClientIds = new WeakMap<WebSocket, Set<number>>();

const send = (ws: WebSocket, msg: Uint8Array) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(msg);
};

function encodeSyncUpdate(update: Uint8Array): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_SYNC);
  syncProtocol.writeUpdate(e, update);
  return encoding.toUint8Array(e);
}

function encodeAwareness(a: awarenessProtocol.Awareness, ids: number[]): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_AWARENESS);
  encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(a, ids));
  return encoding.toUint8Array(e);
}

function getRoom(name: string): Room {
  const existing = rooms.get(name);
  if (existing) {
    clearTimeout(existing.evictTimer);
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null); // the server itself has no presence
  const room = { name, doc, awareness, conns: new Set(), updates: 0 } as Room;
  rooms.set(name, room);

  // Document changes: fan out to local sockets, persist, publish to other instances.
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const msg = encodeSyncUpdate(update);
    room.conns.forEach((c) => c !== origin && send(c, msg));
    if (origin === "redis" || origin === "db") return; // already persisted / published
    appendUpdate(name, update).catch((e) => console.error("persist failed", e));
    publish("doc", name, update);
    if (++room.updates % COMPACT_EVERY === 0) {
      compact(name).catch((e) => console.error("compact failed", e));
    }
  });

  // Presence changes: fan out locally, publish to other instances.
  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin instanceof WebSocket) {
        const ids = connClientIds.get(origin) ?? new Set<number>();
        added.forEach((id) => ids.add(id));
        removed.forEach((id) => ids.delete(id));
        connClientIds.set(origin, ids);
      }
      const changed = [...added, ...updated, ...removed];
      const msg = encodeAwareness(awareness, changed);
      room.conns.forEach((c) => send(c, msg));
      if (origin !== "redis") {
        publish("aw", name, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      }
    }
  );

  room.ready = (async () => {
    // Subscribe first so nothing is missed while loading; applying twice is harmless (CRDT).
    await subscribeDoc(name, (kind, payload) => {
      if (kind === "doc") Y.applyUpdate(doc, payload, "redis");
      else awarenessProtocol.applyAwarenessUpdate(awareness, payload, "redis");
    });
    await loadDoc(name, doc);
  })();

  return room;
}

function scheduleEviction(room: Room) {
  room.evictTimer = setTimeout(async () => {
    if (room.conns.size > 0) return;
    rooms.delete(room.name);
    await unsubscribeDoc(room.name).catch(() => {});
    await compact(room.name).catch((e) => console.error("compact failed", e));
    room.awareness.destroy();
    room.doc.destroy();
    console.log(`[${INSTANCE_ID.slice(0, 8)}] evicted room ${room.name}`);
  }, EVICT_AFTER_MS);
}

function handleMessage(room: Room, ws: WebSocket, data: RawData, role: Role) {
  const bytes = Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data);
  const decoder = decoding.createDecoder(new Uint8Array(bytes));
  const type = decoding.readVarUint(decoder);

  if (type === MSG_SYNC) {
    // Viewers may only *request* state (step 1); any message carrying updates is dropped.
    if (role === "viewer" && decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1) {
      return;
    }
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, MSG_SYNC);
    syncProtocol.readSyncMessage(decoder, reply, room.doc, ws);
    if (encoding.length(reply) > 1) send(ws, encoding.toUint8Array(reply));
  } else if (type === MSG_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(
      room.awareness,
      decoding.readVarUint8Array(decoder),
      ws
    );
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.end(`ok ${INSTANCE_ID}`);
  } else {
    res.statusCode = 404;
    res.end();
  }
});

const wss = new WebSocketServer({ noServer: true });
const reqClaims = new WeakMap<http.IncomingMessage, Claims>();

// Authenticate during the HTTP upgrade: reject before a socket ever exists.
server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const room = decodeURIComponent(url.pathname.slice(1));
    const ticket = url.searchParams.get("ticket");
    if (!room || !ticket) throw new Error("missing room or ticket");
    const claims = await verifyTicket(ticket);
    if (claims.room !== room) throw new Error("ticket is for a different room");
    reqClaims.set(req, claims);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

wss.on("connection", (ws, req) => {
  const claims = reqClaims.get(req);
  if (!claims) return ws.close(1008, "unauthenticated");

  const room = getRoom(claims.room);
  room.conns.add(ws);

  // Chain on `ready` so messages arriving during the initial DB load keep their order.
  ws.on("message", (data) => {
    room.ready
      .then(() => handleMessage(room, ws, data, claims.role))
      .catch((e) => console.error(e));
  });

  ws.on("close", () => {
    room.conns.delete(ws);
    const ids = connClientIds.get(ws);
    if (ids?.size) awarenessProtocol.removeAwarenessStates(room.awareness, [...ids], null);
    if (room.conns.size === 0) scheduleEviction(room);
  });

  room.ready
    .then(() => {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeSyncStep1(e, room.doc);
      send(ws, encoding.toUint8Array(e));

      const states = [...room.awareness.getStates().keys()];
      if (states.length) send(ws, encodeAwareness(room.awareness, states));
    })
    .catch((err) => {
      console.error("room init failed", err);
      ws.close(1011, "init failed");
    });
});

server.listen(PORT, () =>
  console.log(`[${INSTANCE_ID.slice(0, 8)}] realtime listening on :${PORT}`)
);
