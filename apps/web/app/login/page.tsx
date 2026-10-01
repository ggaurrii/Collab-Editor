"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, button, input, ghost } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api(`/api/auth/${mode}`, "POST", { email, name, password });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Something went wrong");
    router.replace("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: 16 }}>
      <h1>Collab Editor</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mode === "register" && (
          <input style={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={input} type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div style={{ color: "#f66", fontSize: 13 }}>{error}</div>}
        <button style={button} disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" style={ghost} onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
