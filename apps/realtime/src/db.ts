import pg from "pg";
import * as Y from "yjs";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://collab:collab@localhost:5432/collab",
});

/** Rebuild a doc from its stored update log. Origin "db" => not re-persisted. */
export async function loadDoc(name: string, doc: Y.Doc): Promise<void> {
  const { rows } = await pool.query<{ update: Buffer }>(
    "SELECT update FROM doc_updates WHERE doc_name = $1 ORDER BY id",
    [name]
  );
  Y.transact(
    doc,
    () => {
      for (const r of rows) Y.applyUpdate(doc, new Uint8Array(r.update));
    },
    "db"
  );
}

export async function appendUpdate(name: string, update: Uint8Array): Promise<void> {
  await pool.query("INSERT INTO doc_updates (doc_name, update) VALUES ($1, $2)", [
    name,
    Buffer.from(update),
  ]);
}

/**
 * Merge the update log into a single row.
 * We rebuild from the DB (not from this instance's in-memory doc) because other
 * instances may have written updates that haven't reached us via Redis yet.
 * Only rows with id <= the max we read are deleted, so concurrent appends survive.
 */
export async function compact(name: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; update: Buffer }>(
      "SELECT id, update FROM doc_updates WHERE doc_name = $1 ORDER BY id",
      [name]
    );
    if (rows.length < 2) {
      await client.query("ROLLBACK");
      return;
    }
    const tmp = new Y.Doc();
    for (const r of rows) Y.applyUpdate(tmp, new Uint8Array(r.update));
    const state = Y.encodeStateAsUpdate(tmp);
    tmp.destroy();
    const maxId = rows[rows.length - 1].id;
    await client.query("DELETE FROM doc_updates WHERE doc_name = $1 AND id <= $2", [
      name,
      maxId,
    ]);
    await client.query("INSERT INTO doc_updates (doc_name, update) VALUES ($1, $2)", [
      name,
      Buffer.from(state),
    ]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
