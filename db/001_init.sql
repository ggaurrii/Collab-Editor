-- Step 3 schema: append-only Yjs update log, compacted periodically.
-- Later steps add users / workspaces / files (see README roadmap).
CREATE TABLE IF NOT EXISTS doc_updates (
  id         BIGSERIAL PRIMARY KEY,
  doc_name   TEXT        NOT NULL,
  update     BYTEA       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doc_updates_doc_idx ON doc_updates (doc_name, id);
