import type { CSSProperties } from "react";

export const input: CSSProperties = {
  padding: "8px 10px", background: "#3c3c3c", color: "#eee",
  border: "1px solid #555", borderRadius: 4, fontSize: 14,
};
export const button: CSSProperties = {
  padding: "8px 14px", background: "#0e639c", color: "#fff",
  border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14,
};
export const ghost: CSSProperties = {
  ...button, background: "transparent", border: "1px solid #555", color: "#ccc",
};
export const link: CSSProperties = { color: "#6cf", textDecoration: "none" };

/** JSON fetch helper: returns { ok, status, data }. */
export async function api<T = any>(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  return { ok: r.ok, status: r.status, data };
}
