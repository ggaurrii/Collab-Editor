import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bad } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return bad(401, "Not signed in");
  return NextResponse.json({ id: s.userId, name: s.name, email: s.email });
}
