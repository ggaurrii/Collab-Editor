"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, button, ghost, input, link } from "@/components/ui";

type WS = { id: string; name: string; role: string };

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<WS[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [m, w] = await Promise.all([api("/api/me"), api("/api/workspaces")]);
    if (m.status === 401) return router.replace("/login");
    setMe(m.data);
    setWorkspaces(w.data as unknown as WS[]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function create() {
    if (!name.trim()) return;
    const r = await api<WS>("/api/workspaces", "POST", { name });
    if (!r.ok) return setError(r.data.error ?? "Failed");
    router.push(`/w/${r.data.id}`);
  }

  async function logout() {
    await api("/api/auth/logout", "POST");
    router.replace("/login");
  }

  if (!me) return null;
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Workspaces</h1>
        <span>{me.name} <button style={{ ...ghost, marginLeft: 8 }} onClick={logout}>Sign out</button></span>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "24px 0" }}>
        <input style={{ ...input, flex: 1 }} placeholder="New workspace name" value={name}
               onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <button style={button} onClick={create}>Create</button>
      </div>
      {error && <div style={{ color: "#f66" }}>{error}</div>}

      {workspaces.length === 0 && <p style={{ opacity: 0.6 }}>No workspaces yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {workspaces.map((w) => (
          <li key={w.id} style={{ padding: "12px 0", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between" }}>
            <a style={link} href={`/w/${w.id}`}>{w.name}</a>
            <span style={{ opacity: 0.6, fontSize: 13 }}>{w.role}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
