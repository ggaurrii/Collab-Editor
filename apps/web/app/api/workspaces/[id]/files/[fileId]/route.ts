import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
import { pool } from "@/lib/db";
import { bad, isUniqueViolation, isUuid, readJson } from "@/lib/http";
import { languageFor, validName } from "@/lib/lang";

export const runtime = "nodejs";

const SUBTREE = `WITH RECURSIVE tree AS (
  SELECT id FROM files WHERE id = $1 AND workspace_id = $2
  UNION ALL
  SELECT f.id FROM files f JOIN tree t ON f.parent_id = t.id
) SELECT id FROM tree`;

type Ctx = { params: { id: string; fileId: string } };

/** Rename and/or move. */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await authorize(params.id, "editor");
  if (!a.ok) return a.res;
  if (!isUuid(params.fileId)) return bad(404, "File not found");

  const cur = await pool.query<{ name: string; is_folder: boolean }>(
    "SELECT name, is_folder FROM files WHERE id = $1 AND workspace_id = $2",
    [params.fileId, params.id]
  );
  if (!cur.rows[0]) return bad(404, "File not found");

  const b = await readJson(req);
  const sets: string[] = [];
  const vals: unknown[] = [params.fileId, params.id];

  if (b && "name" in b) {
    const name = typeof b.name === "string" ? b.name.trim() : b.name;
    if (!validName(name)) return bad(400, "Invalid name");
    vals.push(name);
    sets.push(`name = $${vals.length}`);
    if (!cur.rows[0].is_folder) {
      vals.push(languageFor(name));
      sets.push(`language = $${vals.length}`);
    }
  }
  if (b && "parentId" in b) {
    const parentId = b.parentId;
    if (parentId !== null) {
      if (!isUuid(parentId)) return bad(400, "Invalid parent");
      const ok = await pool.query(
        "SELECT 1 FROM files WHERE id = $1 AND workspace_id = $2 AND is_folder",
        [parentId, params.id]
      );
      if (!ok.rows[0]) return bad(400, "Parent must be a folder in this workspace");
      // A folder cannot move into itself or its own descendants.
      const sub = await pool.query<{ id: string }>(SUBTREE, [params.fileId, params.id]);
      if (sub.rows.some((r) => r.id === parentId)) return bad(400, "Cannot move a folder into itself");
    }
    vals.push(parentId);
    sets.push(`parent_id = $${vals.length}`);
  }
  if (sets.length === 0) return bad(400, "Nothing to update");

  try {
    const { rows } = await pool.query(
      `UPDATE files SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2
       RETURNING id, parent_id AS "parentId", name, is_folder AS "isFolder", language`,
      vals
    );
    return NextResponse.json(rows[0]);
  } catch (e) {
    if (isUniqueViolation(e)) return bad(409, "A file with that name already exists here");
    throw e;
  }
}

/** Deletes a file or folder (with contents) and its stored document history. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await authorize(params.id, "editor");
  if (!a.ok) return a.res;
  if (!isUuid(params.fileId)) return bad(404, "File not found");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sub = await client.query<{ id: string }>(SUBTREE, [params.fileId, params.id]);
    if (sub.rows.length === 0) {
      await client.query("ROLLBACK");
      return bad(404, "File not found");
    }
    const docNames = sub.rows.map((r) => `${params.id}:${r.id}`);
    await client.query("DELETE FROM doc_updates WHERE doc_name = ANY($1::text[])", [docNames]);
    await client.query("DELETE FROM files WHERE id = $1 AND workspace_id = $2", [params.fileId, params.id]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
