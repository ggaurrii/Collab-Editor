import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
import { pool } from "@/lib/db";
import { bad, isUniqueViolation, isUuid, readJson } from "@/lib/http";
import { languageFor, validName } from "@/lib/lang";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id, "viewer");
  if (!a.ok) return a.res;
  const { rows } = await pool.query(
    `SELECT id, parent_id AS "parentId", name, is_folder AS "isFolder", language
       FROM files WHERE workspace_id = $1`,
    [params.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id, "editor");
  if (!a.ok) return a.res;

  const b = await readJson(req);
  const name = typeof b?.name === "string" ? b.name.trim() : b?.name;
  const isFolder = b?.isFolder === true;
  const parentId = b?.parentId ?? null;
  if (!validName(name)) return bad(400, "Invalid name");
  if (parentId !== null) {
    if (!isUuid(parentId)) return bad(400, "Invalid parent");
    const p = await pool.query(
      "SELECT 1 FROM files WHERE id = $1 AND workspace_id = $2 AND is_folder",
      [parentId, params.id]
    );
    if (!p.rows[0]) return bad(400, "Parent must be a folder in this workspace");
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO files (workspace_id, parent_id, name, is_folder, language)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, parent_id AS "parentId", name, is_folder AS "isFolder", language`,
      [params.id, parentId, name, isFolder, isFolder ? "plaintext" : languageFor(name)]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return bad(409, "A file with that name already exists here");
    throw e;
  }
}
