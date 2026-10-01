// End-to-end check against running services:
//   web :3000, realtime :4000 + :4001, postgres, redis
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import WebSocket from "ws";
import { execSync } from "node:child_process";

const WEB = process.env.WEB ?? "http://localhost:3000";
const RT = ["ws://localhost:4000", "ws://localhost:4001"];
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); } return false; };

class Client {
  constructor(name) { this.name = name; this.cookie = ""; }
  async req(path, method = "GET", body) {
    const r = await fetch(WEB + path, { method, headers: { "Content-Type": "application/json", cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
}

function connect(ticketRes, url) {
  const doc = new Y.Doc();
  const p = new WebsocketProvider(url, ticketRes.room, doc, { WebSocketPolyfill: WebSocket, params: { ticket: ticketRes.ticket } });
  return { doc, p, text: doc.getText("content") };
}

const stamp = Date.now();
const [alice, bob, carol] = ["alice", "bob", "carol"].map((n) => new Client(n));

// --- auth
let r = await alice.req("/api/auth/register", "POST", { email: `alice${stamp}@t.io`, name: "Alice", password: "password123" });
check("register alice", r.status === 201);
r = await alice.req("/api/auth/register", "POST", { email: `alice${stamp}@t.io`, name: "Alice", password: "password123" });
check("duplicate email -> 409", r.status === 409);
r = await bob.req("/api/auth/register", "POST", { email: `bob${stamp}@t.io`, name: "Bob", password: "password123" });
check("register bob", r.status === 201);
await carol.req("/api/auth/register", "POST", { email: `carol${stamp}@t.io`, name: "Carol", password: "password123" });
r = await new Client("x").req("/api/me");
check("unauthenticated /api/me -> 401", r.status === 401);
r = await new Client("x").req("/api/auth/login", "POST", { email: `alice${stamp}@t.io`, password: "wrong-password" });
check("wrong password -> 401", r.status === 401);
r = await alice.req("/api/me");
check("session cookie works", r.status === 200 && r.data.name === "Alice");

// --- workspace + file tree
r = await alice.req("/api/workspaces", "POST", { name: "Team" });
check("create workspace", r.status === 201);
const wsId = r.data.id;
r = await alice.req(`/api/workspaces/${wsId}/files`);
const main = r.data.find((f) => f.name === "main.ts");
check("seeded main.ts", !!main && main.language === "typescript");

r = await alice.req(`/api/workspaces/${wsId}/files`, "POST", { name: "src", isFolder: true });
const src = r.data;
r = await alice.req(`/api/workspaces/${wsId}/files`, "POST", { name: "util.py", parentId: src.id });
check("create file in folder (language=python)", r.status === 201 && r.data.language === "python");
const util = r.data;
r = await alice.req(`/api/workspaces/${wsId}/files`, "POST", { name: "util.py", parentId: src.id });
check("duplicate sibling name -> 409", r.status === 409);
r = await alice.req(`/api/workspaces/${wsId}/files`, "POST", { name: "../evil" });
check("slash in name rejected", r.status === 400);
r = await alice.req(`/api/workspaces/${wsId}/files/${util.id}`, "PATCH", { name: "util.ts" });
check("rename updates language", r.status === 200 && r.data.language === "typescript");
r = await alice.req(`/api/workspaces/${wsId}/files/${src.id}`, "PATCH", { parentId: src.id });
check("cannot move folder into itself", r.status === 400);

// --- authorization
r = await carol.req(`/api/workspaces/${wsId}`);
check("non-member GET workspace -> 404", r.status === 404);
r = await carol.req("/api/ticket", "POST", { workspaceId: wsId, fileId: main.id });
check("non-member ticket -> 404", r.status === 404);
r = await bob.req(`/api/workspaces/${wsId}/members`, "POST", { email: `bob${stamp}@t.io`, role: "editor" });
check("non-member cannot invite", r.status === 404);
r = await alice.req(`/api/workspaces/${wsId}/members`, "POST", { email: `bob${stamp}@t.io`, role: "viewer" });
check("owner invites bob as viewer", r.status === 200);
r = await bob.req(`/api/workspaces/${wsId}/files`, "POST", { name: "nope.ts" });
check("viewer cannot create files -> 403", r.status === 403);
r = await bob.req(`/api/workspaces/${wsId}/members`, "POST", { email: `carol${stamp}@t.io`, role: "editor" });
check("viewer cannot invite -> 403", r.status === 403);

// --- realtime
const aliceTicket = (await alice.req("/api/ticket", "POST", { workspaceId: wsId, fileId: main.id })).data;
const bobTicket = (await bob.req("/api/ticket", "POST", { workspaceId: wsId, fileId: main.id })).data;
check("roles in tickets", aliceTicket.role === "owner" && bobTicket.role === "viewer");

// bad tickets are rejected at upgrade
const rejected = (url) => new Promise((res) => {
  const ws = new WebSocket(url);
  ws.on("open", () => { ws.close(); res(false); });
  ws.on("unexpected-response", (_q, resp) => res(resp.statusCode === 401));
  ws.on("error", () => res(true));
});
check("no ticket rejected", await rejected(`${RT[0]}/${aliceTicket.room}`));
check("garbage ticket rejected", await rejected(`${RT[0]}/${aliceTicket.room}?ticket=abc`));
check("ticket for another room rejected", await rejected(`${RT[0]}/${wsId}:${util.id}?ticket=${aliceTicket.ticket}`));

const A = connect(aliceTicket, RT[0]);   // instance 1
const B = connect(bobTicket, RT[1]);     // instance 2 (viewer)
await until(() => A.p.synced && B.p.synced);
check("both synced", A.p.synced && B.p.synced);

A.text.insert(0, "hello from alice");
check("alice -> bob across instances (Redis)", await until(() => B.text.toString() === "hello from alice"));

B.text.insert(0, "HACK ");  // viewer writes locally; server must drop it
await sleep(800);
check("viewer edit NOT accepted by server", A.text.toString() === "hello from alice");

// presence across instances
A.p.awareness.setLocalStateField("user", { name: "Alice", color: "#e06c75" });
check("presence crosses instances", await until(() => [...B.p.awareness.getStates().values()].some((s) => s.user?.name === "Alice")));

// second editor
await alice.req(`/api/workspaces/${wsId}/members`, "POST", { email: `bob${stamp}@t.io`, role: "editor" });
const bobEdTicket = (await bob.req("/api/ticket", "POST", { workspaceId: wsId, fileId: main.id })).data;
check("role upgrade reflected in new ticket", bobEdTicket.role === "editor");
const B2 = connect(bobEdTicket, RT[1]);
await until(() => B2.p.synced);
B2.text.insert(B2.text.length, "!");
check("editor edit propagates to alice", await until(() => A.text.toString().endsWith("!")));

// --- persistence
await sleep(500);
const rows = Number(execSync(`PGPASSWORD=collab psql -h localhost -U collab -d collab -tAc "select count(*) from doc_updates where doc_name='${aliceTicket.room}'"`).toString().trim());
check(`updates persisted (${rows} rows)`, rows > 0);
// rebuild from DB and compare
const hex = execSync(`PGPASSWORD=collab psql -h localhost -U collab -d collab -tAc "select encode(update,'hex') from doc_updates where doc_name='${aliceTicket.room}' order by id"`).toString().trim().split("\n");
const rebuilt = new Y.Doc();
for (const h of hex) Y.applyUpdate(rebuilt, Buffer.from(h, "hex"));
check("doc rebuilt from Postgres matches live doc", rebuilt.getText("content").toString() === A.text.toString());

// --- delete cleans up history
[A, B, B2].forEach((c) => { c.p.destroy(); c.doc.destroy(); });
r = await alice.req(`/api/workspaces/${wsId}/files/${main.id}`, "DELETE");
check("delete file", r.status === 200);
const left = Number(execSync(`PGPASSWORD=collab psql -h localhost -U collab -d collab -tAc "select count(*) from doc_updates where doc_name='${aliceTicket.room}'"`).toString().trim());
check("document history deleted with file", left === 0);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
