import { NextResponse } from "next/server";
import { hashPassword, setSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { bad, isUniqueViolation, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const b = await readJson(req);
  const email = String(b?.email ?? "").trim().toLowerCase();
  const name = String(b?.name ?? "").trim();
  const password = String(b?.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return bad(400, "Invalid email");
  if (name.length < 1 || name.length > 60) return bad(400, "Name must be 1-60 characters");
  if (password.length < 8 || password.length > 200) return bad(400, "Password must be at least 8 characters");

  try {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [email, name, await hashPassword(password)]
    );
    await setSession({ userId: rows[0].id, name, email });
    return NextResponse.json({ id: rows[0].id, name, email }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return bad(409, "Email already registered");
    throw e;
  }
}
