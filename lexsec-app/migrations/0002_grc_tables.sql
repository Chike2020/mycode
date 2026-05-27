-- Evidence (metadata in D1, binary files in R2)
CREATE TABLE IF NOT EXISTS evidence (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fw_id           TEXT NOT NULL,
  ctrl_key        TEXT NOT NULL,
  name            TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT '',
  size            INTEGER NOT NULL DEFAULT 0,
  r2_key          TEXT,
  owner           TEXT NOT NULL DEFAULT '',
  collection_date TEXT NOT NULL DEFAULT '',
  uploaded_by     TEXT REFERENCES users(id),
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Risks (JSON blob — flexible schema for risk register)
CREATE TABLE IF NOT EXISTS risks (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vendors (JSON blob)
CREATE TABLE IF NOT EXISTS vendors (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Compliance calendar events (JSON blob)
CREATE TABLE IF NOT EXISTS calendar_events (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Compliance snapshots (point-in-time score captures)
CREATE TABLE IF NOT EXISTS snapshots (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'Snapshot',
  auto       INTEGER NOT NULL DEFAULT 0,
  scores     TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id),
  timestamp  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- GRC audit log (append-only, 12-month retention)
CREATE TABLE IF NOT EXISTS grc_audit_log (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   TEXT REFERENCES users(id),
  actor     TEXT NOT NULL DEFAULT '',
  type      TEXT NOT NULL DEFAULT 'system',
  target    TEXT NOT NULL DEFAULT '',
  detail    TEXT NOT NULL DEFAULT '',
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_org      ON evidence(org_id, fw_id, ctrl_key);
CREATE INDEX IF NOT EXISTS idx_risks_org         ON risks(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vendors_org       ON vendors(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_calendar_org      ON calendar_events(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_org_ts  ON snapshots(org_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_grc_audit_org_ts  ON grc_audit_log(org_id, timestamp);
