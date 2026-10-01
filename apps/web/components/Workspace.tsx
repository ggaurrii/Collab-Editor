"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CollabEditor from "./CollabEditor";
import FileTree, { type FileRow } from "./FileTree";
import { api, button, input, link } from "./ui";

type Info = {
  id: string; name: string; role: "owner" | "editor" | "viewer";
  members: { userId: string; name: string; email: string; role: string }[];
};

export default function Workspace({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [error, setError] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteMsg, setInviteMsg] = useState("");

  const base = `/api/workspaces/${workspaceId}`;

  const loadInfo = useCallback(async () => {
    const r = await api<Info>(base);
    if (r.status === 401) return router.replace("/login");
    if (!r.ok) return setError(r.data.error ?? "Failed to load workspace");
    setInfo(r.data);
  }, [base, router]);

  const loadFiles = useCallback(async () => {
    const r = await api<FileRow[]>(`${base}/files`);
    if (r.ok) setFiles(r.data as unknown as FileRow[]);
  }, [base]);

  useEffect(() => { loadInfo(); loadFiles(); }, [loadInfo, loadFiles]);

  // Pick the first file once the tree loads.
  useEffect(() => {
    if (!selected) {
      const first = files.find((f) => !f.isFolder);
      if (first) setSelected(first);
    } else {
      const fresh = files.find((f) => f.id === selected.id);
      if (!fresh) setSelected(null);
      else if (fresh.language !== selected.language) setSelected(fresh);
    }
  }, [files, selected]);

  const canEdit = info?.role === "owner" || info?.role === "editor";

  async function create(parentId: string | null, isFolder: boolean) {
    const name = window.prompt(isFolder ? "Folder name" : "File name (e.g. app.ts)");
    if (!name) return;
    const r = await api<FileRow>(`${base}/files`, "POST", { name, parentId, isFolder });
    if (!r.ok) return window.alert(r.data.error ?? "Failed");
    await loadFiles();
    if (!isFolder) setSelected(r.data as FileRow);
  }
  async function rename(f: FileRow) {
    const name = window.prompt("New name", f.name);
    if (!name || name === f.name) return;
    const r = await api(`${base}/files/${f.id}`, "PATCH", { name });
    if (!r.ok) window.alert(r.data.error ?? "Failed");
    loadFiles();
  }
  async function remove(f: FileRow) {
    if (!window.confirm(`Delete ${f.name}${f.isFolder ? " and everything in it" : ""}? This also erases its content.`)) return;
    const r = await api(`${base}/files/${f.id}`, "DELETE");
    if (!r.ok) window.alert(r.data.error ?? "Failed");
    loadFiles();
  }
  async function invite() {
    setInviteMsg("");
    const r = await api(`${base}/members`, "POST", { email: inviteEmail, role: inviteRole });
    setInviteMsg(r.ok ? "Added." : r.data.error ?? "Failed");
    if (r.ok) { setInviteEmail(""); loadInfo(); }
  }

  if (error) return <main style={{ padding: 32 }}>{error} <a style={link} href="/">Back</a></main>;
  if (!info) return null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "8px 16px", display: "flex", gap: 16, alignItems: "center", background: "#252526", fontSize: 13 }}>
        <a style={link} href="/">← Workspaces</a>
        <strong>{info.name}</strong>
        <span style={{ opacity: 0.6 }}>{info.role}</span>
        {info.role === "owner" && (
          <button style={{ ...button, padding: "3px 10px", marginLeft: "auto" }} onClick={() => setShowShare((s) => !s)}>Share</button>
        )}
      </header>

      {showShare && (
        <div style={{ padding: 12, background: "#2d2d30", fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input style={input} placeholder="Registered user's email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            <select style={input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button style={button} onClick={invite}>Add</button>
            <span style={{ alignSelf: "center" }}>{inviteMsg}</span>
          </div>
          {info.members.map((m) => (
            <div key={m.userId} style={{ opacity: 0.8 }}>{m.name} ({m.email}) — {m.role}</div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <aside style={{ width: 240, background: "#252526", overflowY: "auto", borderRight: "1px solid #333" }}>
          <FileTree files={files} selectedId={selected?.id ?? null} canEdit={!!canEdit}
                    onSelect={setSelected} onCreate={create} onRename={rename} onDelete={remove} />
        </aside>
        <main style={{ flex: 1, minWidth: 0 }}>
          {selected ? (
            <CollabEditor key={selected.id} workspaceId={workspaceId} fileId={selected.id} language={selected.language} />
          ) : (
            <p style={{ padding: 24, opacity: 0.6 }}>Select or create a file.</p>
          )}
        </main>
      </div>
    </div>
  );
}
