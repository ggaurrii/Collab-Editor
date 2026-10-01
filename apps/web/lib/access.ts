import type { NextResponse } from "next/server";
import { getSession } from "./auth";
import { pool } from "./db";
import { bad, isUuid } from "./http";

export type Role = "owner" | "editor" | "viewer";
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export type Authz =
  | { ok: true; userId: string; name: string; role: Role }
  | { ok: false; res: NextResponse };

/** Checks session + workspace membership + minimum role. Non-members get 404 (no existence leak). */
export async function authorize(workspaceId: string, need: Role): Promise<Authz> {
  const session = await getSession();
  if (!session) return { ok: false, res: bad(401, "Not signed in") };
  if (!isUuid(workspaceId)) return { ok: false, res: bad(404, "Workspace not found") };
  const { rows } = await pool.query<{ role: Role }>(
    "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, session.userId]
  );
  if (!rows[0]) return { ok: false, res: bad(404, "Workspace not found") };
  if (RANK[rows[0].role] < RANK[need]) return { ok: false, res: bad(403, "Insufficient permissions") };
  return { ok: true, userId: session.userId, name: session.name, role: rows[0].role };
}
