import { jwtVerify } from "jose";

export type Role = "owner" | "editor" | "viewer";
export interface Claims {
  sub: string;
  name: string;
  room: string; // "<workspaceId>:<fileId>"
  role: Role;
}

const raw =
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-secret-change-me");
if (!raw) throw new Error("AUTH_SECRET must be set in production");
const SECRET = new TextEncoder().encode(raw);

/** Verifies a short-lived WS ticket minted by the web app's /api/ticket. */
export async function verifyTicket(token: string): Promise<Claims> {
  const { payload } = await jwtVerify(token, SECRET, { audience: "collab-ws" });
  const { sub, name, room, role } = payload as Record<string, unknown>;
  if (
    typeof sub !== "string" ||
    typeof name !== "string" ||
    typeof room !== "string" ||
    (role !== "owner" && role !== "editor" && role !== "viewer")
  ) {
    throw new Error("malformed ticket");
  }
  return { sub, name, room, role };
}
