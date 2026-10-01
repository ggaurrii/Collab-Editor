"use client";

import { useMemo, useState } from "react";

export type FileRow = { id: string; parentId: string | null; name: string; isFolder: boolean; language: string };

type Props = {
  files: FileRow[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (f: FileRow) => void;
  onCreate: (parentId: string | null, isFolder: boolean) => void;
  onRename: (f: FileRow) => void;
  onDelete: (f: FileRow) => void;
};

export default function FileTree({ files, selectedId, canEdit, onSelect, onCreate, onRename, onDelete }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string | null>(null); // folder that "New ..." creates in

  const children = useMemo(() => {
    const m = new Map<string | null, FileRow[]>();
    for (const f of files) {
      const list = m.get(f.parentId) ?? [];
      list.push(f);
      m.set(f.parentId, list);
    }
    for (const list of m.values())
      list.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
    return m;
  }, [files]);

  const targetName = files.find((f) => f.id === target)?.name ?? "root";

  function row(f: FileRow, depth: number): React.ReactNode {
    const isOpen = open.has(f.id);
    return (
      <div key={f.id}>
        <div
          className="row"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", paddingLeft: 8 + depth * 14,
            cursor: "pointer", fontSize: 13, background: f.id === selectedId ? "#37373d" : "transparent",
          }}
          onClick={() => {
            if (f.isFolder) {
              setTarget(f.id);
              setOpen((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; });
            } else {
              setTarget(f.parentId);
              onSelect(f);
            }
          }}
        >
          <span style={{ width: 14 }}>{f.isFolder ? (isOpen ? "▾" : "▸") : ""}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {f.isFolder ? "📁 " : ""}{f.name}
          </span>
          {canEdit && (
            <span style={{ opacity: 0.6 }} onClick={(e) => e.stopPropagation()}>
              <button title="Rename" style={mini} onClick={() => onRename(f)}>✎</button>
              <button title="Delete" style={mini} onClick={() => onDelete(f)}>✕</button>
            </span>
          )}
        </div>
        {f.isFolder && isOpen && (children.get(f.id) ?? []).map((c) => row(c, depth + 1))}
      </div>
    );
  }

  return (
    <div>
      {canEdit && (
        <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <button style={mini} onClick={() => { onCreate(target, false); if (target) setOpen((s) => new Set(s).add(target)); }}>+ File</button>
          <button style={mini} onClick={() => { onCreate(target, true); if (target) setOpen((s) => new Set(s).add(target)); }}>+ Folder</button>
          <span style={{ opacity: 0.5 }}>in {targetName}</span>
        </div>
      )}
      {(children.get(null) ?? []).map((f) => row(f, 0))}
    </div>
  );
}

const mini: React.CSSProperties = {
  background: "transparent", color: "#ccc", border: "1px solid #555", borderRadius: 3,
  cursor: "pointer", fontSize: 11, padding: "1px 5px", marginLeft: 3,
};
