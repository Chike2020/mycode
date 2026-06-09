-- Policy Management
CREATE TABLE IF NOT EXISTS policies (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_policies_org ON policies(org_id);

-- Incident Management
CREATE TABLE IF NOT EXISTS incidents (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents(org_id);

-- Asset Inventory
CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(org_id);

-- Framework Control Status
CREATE TABLE IF NOT EXISTS control_status (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  framework  TEXT NOT NULL,
  control_id TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, framework, control_id)
);
CREATE INDEX IF NOT EXISTS idx_control_status_org ON control_status(org_id, framework);
