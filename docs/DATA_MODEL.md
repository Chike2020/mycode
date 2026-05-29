# Data Model

All tables live in a single Cloudflare D1 (SQLite) database named `lexsec-db`. Migrations are applied sequentially from `lexsec-app/migrations/`.

---

## Migration History

| File | Adds |
|---|---|
| `0001_initial.sql` | `users`, `organizations`, `org_members`, `org_invitations` |
| `0002_grc_tables.sql` | `evidence`, `risks`, `vendors`, `calendar_events`, `snapshots`, `audit_log` |
| `0003_rate_limiting.sql` | `rate_limits` (login attempt throttling) |
| `0004_extended_grc.sql` | `policies`, `incidents`, `assets`, `control_status` |
| `0005_evidence_dedup.sql` | `content_hash` column on `evidence`, `evidence_ctrl_mappings` junction table |

---

## Schema

### `users`
```sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,         -- "pbkdf2-hex:salt-hex"
  name         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `organizations`
```sql
CREATE TABLE organizations (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  plan                TEXT NOT NULL DEFAULT 'free',   -- free | pro | enterprise
  stripe_customer_id  TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `org_members`
```sql
CREATE TABLE org_members (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL DEFAULT 'member',   -- owner | admin | member
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, user_id)
);
```

### `org_invitations`
```sql
CREATE TABLE org_invitations (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  token       TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL REFERENCES users(id),
  accepted_at TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `evidence`
```sql
CREATE TABLE evidence (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL,
  fw_id           TEXT NOT NULL,          -- primary framework (e.g. "soc2")
  ctrl_key        TEXT NOT NULL,          -- primary control ID (e.g. "CC6.1")
  name            TEXT NOT NULL,          -- original filename
  mime_type       TEXT NOT NULL DEFAULT '',
  size            INTEGER NOT NULL DEFAULT 0,  -- bytes
  r2_key          TEXT,                   -- R2 object key for retrieval
  owner           TEXT NOT NULL DEFAULT '',
  collection_date TEXT NOT NULL DEFAULT '',
  uploaded_by     TEXT,                   -- user_id
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now')),
  content_hash    TEXT NOT NULL DEFAULT ''  -- SHA-256 hex for dedup (migration 0005)
);
CREATE INDEX idx_evidence_org  ON evidence(org_id);
CREATE INDEX idx_evidence_hash ON evidence(org_id, content_hash);
```

### `evidence_ctrl_mappings` *(migration 0005)*
```sql
CREATE TABLE evidence_ctrl_mappings (
  id          TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  org_id      TEXT NOT NULL,
  framework   TEXT NOT NULL DEFAULT '',
  control_id  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(evidence_id, framework, control_id)
);
CREATE INDEX idx_ecm_evidence ON evidence_ctrl_mappings(evidence_id);
CREATE INDEX idx_ecm_org      ON evidence_ctrl_mappings(org_id);
```

Many-to-many: one evidence file → many (framework, control_id) pairs. The `UNIQUE` constraint prevents duplicate mappings. `INSERT OR IGNORE` is used for idempotent upserts.

### `risks`
```sql
CREATE TABLE risks (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,   -- JSON: {title, category, likelihood, impact, status, owner, notes}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Risk score = `likelihood × impact` (both 1–5 scale). Categories: technical, operational, legal, reputational, financial. Statuses: open, mitigating, resolved, accepted.

### `vendors`
```sql
CREATE TABLE vendors (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,   -- JSON: {name, category, riskLevel, status, contact, website, notes, reviewDate, dataAccess}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `calendar_events`
```sql
CREATE TABLE calendar_events (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,   -- JSON: {title, type, status, dueDate, assignee, framework, notes}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `snapshots`
```sql
CREATE TABLE snapshots (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  score      REAL NOT NULL DEFAULT 0,
  details    TEXT NOT NULL DEFAULT '{}',  -- full score JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `audit_log`
```sql
CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  details    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_org ON audit_log(org_id, created_at DESC);
```

### `rate_limits` *(migration 0003)*
```sql
CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,   -- e.g. "login:ip:1.2.3.4"
  attempts   INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `policies` *(migration 0004)*
```sql
CREATE TABLE policies (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,   -- JSON: {title, category, status, version, owner, content, frameworks[], reviewDate, approvedBy}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `incidents` *(migration 0004)*
```sql
CREATE TABLE incidents (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,   -- JSON: {title, type, severity, status, description, affected, rootCause, remediation, owner, detectedAt, resolvedAt, reported}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `assets` *(migration 0004)*
```sql
CREATE TABLE assets (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  data       TEXT NOT NULL,   -- JSON: {name, type, classification, owner, location, description, status, criticality, tags[]}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `control_status` *(migration 0004)*
```sql
CREATE TABLE control_status (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  framework  TEXT NOT NULL,    -- soc2 | iso27001 | nist_csf | ai_rmf
  control_id TEXT NOT NULL,    -- e.g. "CC6.1", "A.5.15", "PR.AA", "GOV-1.1"
  data       TEXT NOT NULL DEFAULT '{}',  -- JSON: {status, owner, notes}
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, framework, control_id)
);
```

The `UNIQUE` constraint enables upsert: the route checks for an existing record and does `UPDATE` or `INSERT` accordingly.

---

## Design Patterns

### JSON Blob Storage
GRC entities (risks, vendors, events, policies, incidents, assets) store all user-defined fields in a `data TEXT NOT NULL` column as JSON. Only the indexable columns (`id`, `org_id`, timestamps) are first-class.

**Benefits:** New fields can be added to the frontend schema without a database migration. The application always reads `...JSON.parse(r.data)` when returning a record.

**Trade-off:** Sorting or filtering on nested JSON fields requires `json_extract(data, '$.fieldName')` in SQLite. Currently all filtering is done in application code after fetching the org's full list.

### ID Generation
All primary keys are generated by `src/lib/crypto.ts` using `crypto.getRandomValues()` to produce a 16-byte hex string. Evidence IDs are prefixed with `ev_` for readability in R2 keys.

### Soft vs Hard Deletes
All deletes are hard deletes. The audit log captures the actor and action before deletion, providing a reconstruction trail without the storage overhead of soft-delete columns.
