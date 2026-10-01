"use client";

import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const SERVERS = (process.env.NEXT_PUBLIC_WS_URLS ?? "ws://localhost:4000").split(",");
const COLORS = ["#e06c75", "#61afef", "#98c379", "#e5c07b", "#c678dd", "#56b6c2"];
const colorFor = (id: string) =>
  COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

type Ticket = { ticket: string; room: string; role: string; user: { id: string; name: string } };
type Peer = { id: number; name: string; color: string; self: boolean };
type Props = { workspaceId: string; fileId: string; language: string };

export default function CollabEditor({ workspaceId, fileId, language }: Props) {
  const [status, setStatus] = useState("connecting");
  const [server, setServer] = useState("");
  const [role, setRole] = useState("");
  const [peers, setPeers] = useState<Peer[]>([]);
  const teardown = useRef<(() => void) | null>(null);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      teardown.current?.();
      teardown.current = null;
    };
  }, []);

  async function fetchTicket(): Promise<Ticket> {
    const r = await fetch("/api/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, fileId }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  async function onMount(editor: import("monaco-editor").editor.IStandaloneCodeEditor) {
    let t: Ticket;
    try {
      t = await fetchTicket();
    } catch {
      return setStatus("access denied");
    }
    // y-monaco imports monaco-editor at module scope, so load it client-side only.
    const { MonacoBinding } = await import("y-monaco");
    if (disposed.current) return;

    setRole(t.role);
    editor.updateOptions({ readOnly: t.role === "viewer" });

    // Random server per tab => easy demo of cross-instance sync via Redis.
    const url = SERVERS[Math.floor(Math.random() * SERVERS.length)];
    setServer(url);

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(url, t.room, ydoc, { connect: false });

    // y-websocket reads `provider.url` on every (re)connect. Serve the current ticket from it,
    // and keep the ticket fresh so reconnects after the 5-minute TTL still authenticate.
    let ticket = t.ticket;
    const wsBase = provider.url;
    Object.defineProperty(provider, "url", {
      get: () => `${wsBase}?ticket=${encodeURIComponent(ticket)}`,
      set: () => {},
      configurable: true,
    });
    const renew = async () => {
      try { ticket = (await fetchTicket()).ticket; } catch { /* keep old */ }
    };
    const renewTimer = setInterval(renew, 3 * 60 * 1000);
    provider.on("connection-close", renew);
    provider.on("status", (e: { status: string }) => setStatus(e.status));
    provider.connect();

    const ytext = ydoc.getText("content");
    const binding = new MonacoBinding(ytext, editor.getModel()!, new Set([editor]), provider.awareness);
    provider.awareness.setLocalStateField("user", { name: t.user.name, color: colorFor(t.user.id) });

    // y-monaco tags remote cursors with per-client CSS classes; we supply the CSS.
    // Awareness data comes from other (untrusted) clients, so sanitize before it touches CSS.
    const style = document.createElement("style");
    document.head.appendChild(style);
    const refreshPeers = () => {
      const list: Peer[] = [];
      let css = "";
      provider.awareness.getStates().forEach((s, id) => {
        const u = s.user as { name?: unknown; color?: unknown } | undefined;
        if (!u) return;
        const name = String(u.name ?? "?").replace(/[^\w .@-]/g, "").slice(0, 30) || "?";
        const color = /^#[0-9a-f]{6}$/i.test(String(u.color)) ? String(u.color) : "#888888";
        list.push({ id, name, color, self: id === ydoc.clientID });
        if (id === ydoc.clientID) return;
        css += `
          .yRemoteSelection-${id} { background: ${color}44; }
          .yRemoteSelectionHead-${id} { position: absolute; border-left: 2px solid ${color}; height: 100%; box-sizing: border-box; }
          .yRemoteSelectionHead-${id}::after { content: "${name}"; position: absolute; top: -1.4em; left: -2px; font-size: 11px; padding: 0 4px; color: #fff; background: ${color}; white-space: nowrap; }
        `;
      });
      style.textContent = css;
      setPeers(list);
    };
    provider.awareness.on("change", refreshPeers);
    refreshPeers();

    teardown.current = () => {
      clearInterval(renewTimer);
      provider.awareness.off("change", refreshPeers);
      binding.destroy();
      provider.destroy();
      ydoc.destroy();
      style.remove();
    };
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "4px 12px", display: "flex", gap: 12, alignItems: "center", background: "#1f1f1f", fontSize: 12 }}>
        <span>{status}</span>
        {role === "viewer" && <span style={{ color: "#e5c07b" }}>read-only</span>}
        <span style={{ opacity: 0.5 }}>{server}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {peers.map((p) => (
            <span key={p.id} style={{ background: p.color, color: "#fff", padding: "1px 8px", borderRadius: 10 }}>
              {p.name}{p.self ? " (you)" : ""}
            </span>
          ))}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor height="100%" theme="vs-dark" language={language} onMount={onMount} />
      </div>
    </div>
  );
}
