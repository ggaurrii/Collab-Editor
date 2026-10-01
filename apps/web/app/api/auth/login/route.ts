import { NextResponse } from "next/server";
import { setSession, verifyPassword } from "@/lib/auth";
import { pool } from "@/lib/db";
import { bad, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const b = await readJson(req);
  const email = String(b?.email ?? "").trim().toLowerCase();
  const password = String(b?.password ?? "");

  const { rows } = await pool.query<{ id: string; name: string; password_hash: string }>(
    "SELECT id, name, password_hash FROM users WHERE email = $1",
    [email]
  );
  const u = rows[0];
  // Same message for unknown email and wrong password.
  if (!u || !(await verifyPassword(password, u.password_hash))) {
    return bad(401, "Invalid email or password");
  }
  await setSession({ userId: u.id, name: u.name, email });
  return NextResponse.json({ id: u.id, name: u.name, email });
}
