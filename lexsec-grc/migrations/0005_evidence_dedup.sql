-- Add content hash to evidence for deduplication
ALTER TABLE evidence ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence(org_id, content_hash);

-- Many-to-many: evidence files <-> framework controls
CREATE TABLE IF NOT EXISTS evidence_ctrl_mappings (
  id          TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  org_id      TEXT NOT NULL,
  framework   TEXT NOT NULL DEFAULT '',
  control_id  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(evidence_id, framework, control_id)
);
CREATE INDEX IF NOT EXISTS idx_ecm_evidence ON evidence_ctrl_mappings(evidence_id);
CREATE INDEX IF NOT EXISTS idx_ecm_org      ON evidence_ctrl_mappings(org_id);

-- Seed mappings from existing evidence records
INSERT OR IGNORE INTO evidence_ctrl_mappings (id, evidence_id, org_id, framework, control_id)
SELECT hex(randomblob(8)), id, org_id, fw_id, ctrl_key
FROM evidence WHERE fw_id != '' AND ctrl_key != '';
