import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const raw =
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-secret-change-me");
if (!raw) throw new Error("AUTH_SECRET must be set in production");
const SECRET = new TextEncoder().encode(raw);

export const SESSION_COOKIE = "session";
export interface Session {
  userId: string;
  name: string;
  email: string;
}

// ---- passwords (scrypt, no native deps) ----
const derive = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await derive(pw, salt)).toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const key = await derive(pw, Buffer.from(s, "hex"));
  const expected = Buffer.from(h, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ---- session cookie (httpOnly JWT) ----
export async function setSession(s: Session) {
  const token = await new SignJWT({ name: s.name, email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setAudience("collab-session")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET, { audience: "collab-session" });
    return {
      userId: payload.sub as string,
      name: payload.name as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

// ---- WebSocket ticket (short-lived, bound to one room + role) ----
export const TICKET_TTL = "5m";
export async function signTicket(t: { userId: string; name: string; room: string; role: string }) {
  return new SignJWT({ name: t.name, room: t.room, role: t.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(t.userId)
    .setAudience("collab-ws")
    .setIssuedAt()
    .setExpirationTime(TICKET_TTL)
    .sign(SECRET);
}
