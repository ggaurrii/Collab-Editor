import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id, "viewer");
  if (!a.ok) return a.res;
  const [ws, members] = await Promise.all([
    pool.query<{ name: string }>("SELECT name FROM workspaces WHERE id = $1", [params.id]),
    pool.query(
      `SELECT u.id AS "userId", u.name, u.email, m.role
         FROM workspace_members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1 ORDER BY u.name`,
      [params.id]
    ),
  ]);
  return NextResponse.json({
    id: params.id,
    name: ws.rows[0].name,
    role: a.role,
    userId: a.userId,
    members: members.rows,
  });
}
