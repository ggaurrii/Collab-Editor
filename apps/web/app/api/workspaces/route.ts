import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { bad, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return bad(401, "Not signed in");
  const { rows } = await pool.query(
    `SELECT w.id, w.name, m.role
       FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = $1 ORDER BY w.created_at DESC`,
    [s.userId]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return bad(401, "Not signed in");
  const b = await readJson(req);
  const name = String(b?.name ?? "").trim();
  if (name.length < 1 || name.length > 80) return bad(400, "Name must be 1-80 characters");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ws = await client.query<{ id: string }>(
      "INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id",
      [name, s.userId]
    );
    const id = ws.rows[0].id;
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
      [id, s.userId]
    );
    await client.query(
      "INSERT INTO files (workspace_id, name, language) VALUES ($1, 'main.ts', 'typescript')",
      [id]
    );
    await client.query("COMMIT");
    return NextResponse.json({ id, name, role: "owner" }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
