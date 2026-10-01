import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
import { signTicket } from "@/lib/auth";
import { pool } from "@/lib/db";
import { bad, isUuid, readJson } from "@/lib/http";

export const runtime = "nodejs";

/** Mints a short-lived WebSocket ticket bound to one file and the caller's role. */
export async function POST(req: Request) {
  const b = await readJson(req);
  const workspaceId = String(b?.workspaceId ?? "");
  const fileId = b?.fileId;
  const a = await authorize(workspaceId, "viewer");
  if (!a.ok) return a.res;
  if (!isUuid(fileId)) return bad(404, "File not found");

  const f = await pool.query(
    "SELECT 1 FROM files WHERE id = $1 AND workspace_id = $2 AND NOT is_folder",
    [fileId, workspaceId]
  );
  if (!f.rows[0]) return bad(404, "File not found");

  const room = `${workspaceId}:${fileId}`;
  const ticket = await signTicket({ userId: a.userId, name: a.name, room, role: a.role });
  return NextResponse.json({ ticket, room, role: a.role, user: { id: a.userId, name: a.name } });
}
