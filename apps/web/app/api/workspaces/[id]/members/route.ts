import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
import { pool } from "@/lib/db";
import { bad, readJson } from "@/lib/http";

export const runtime = "nodejs";

/** Owner invites an existing user by email (or changes their role). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id, "owner");
  if (!a.ok) return a.res;

  const b = await readJson(req);
  const email = String(b?.email ?? "").trim().toLowerCase();
  const role = b?.role;
  if (role !== "editor" && role !== "viewer") return bad(400, "Role must be editor or viewer");

  const u = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (!u.rows[0]) return bad(404, "No registered user with that email");

  const r = await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
       WHERE workspace_members.role <> 'owner'`,
    [params.id, u.rows[0].id, role]
  );
  if (r.rowCount === 0) return bad(400, "Cannot change the owner's role");
  return NextResponse.json({ ok: true });
}
