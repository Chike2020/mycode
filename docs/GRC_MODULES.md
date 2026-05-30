# GRC Modules

Every module in the platform follows the same pattern:
- A Hono route file in `src/routes/*.ts` handles the API
- The `requireAuth` middleware enforces authentication and org-scoping on every route
- Data is stored in D1 (SQLite) with a `data TEXT NOT NULL` JSON blob for flexible fields
- The frontend renders the module in `SECTIONS.*()` inside `public/app.html`

---

## 1. Dashboard

**What:** The landing page after login. Shows a compliance score dial (0–100, letter grade A–F), a breakdown of the four scoring components, and quick-stat cards linking to each module.

**How:** `GET /api/score` computes a weighted score from four components:
- **Evidence** (35%) — quantity and freshness of uploaded evidence files
- **Risks** (30%) — ratio of open/unresolved risks
- **Vendors** (20%) — ratio of vendors flagged as high-risk
- **Calendar** (15%) — overdue compliance events as a fraction of total events

The dial and grade are rendered client-side as SVG. Empty-state labels explain what action drives each component score up.

**Why:** A single composite score gives leadership a one-number answer to "how compliant are we?" while the breakdown shows where to focus effort. The weighting reflects practical GRC priorities: evidence is the most auditor-facing artifact, so it carries the most weight.

---

## 2. Evidence Management

**What:** Upload and manage files (PDFs, screenshots, exports, policies, audit reports) that serve as evidence of control implementation. Files are mapped to specific compliance controls. One file can satisfy multiple controls across multiple frameworks.

**How:**
- Files are uploaded as base64 `dataUrl` in a `POST /api/evidence` request
- The Worker decodes the base64 payload, writes the binary to R2 under `evidence/{orgId}/{evidenceId}`, and records metadata in D1
- `GET /api/evidence` returns files grouped by `fwId|ctrlKey`, with a `mappings[]` array on each file listing all its control associations
- Files are retrieved via `GET /api/evidence/:id/file`, which streams the R2 object body directly — no public URL exposure

**Deduplication (migration 0005):**
- Before uploading, the browser computes a SHA-256 hash of the file using `crypto.subtle.digest('SHA-256', buffer)`
- The hash is sent as `contentHash` in the POST body
- If a file with that hash already exists for the org, the upload is skipped and a new control mapping is added instead
- The user sees a green banner: _"This file already exists as X. A new mapping has been added instead of re-uploading."_

**Many-to-many mappings:**
- The `evidence_ctrl_mappings` junction table stores `(evidence_id, framework, control_id)` tuples
- `POST /api/evidence/:id/mappings` — map an existing file to an additional control
- `DELETE /api/evidence/:id/mappings/:mapId` — remove a mapping without deleting the file
- Each file row in the UI shows mapping chips (e.g. `soc2:CC6.1`) with a × button to remove, and a `+ Map` button to add new ones

**Why dedup:** In a real audit, the same SOC 2 access control policy PDF will satisfy CC6.1, CC6.2, and an ISO 27001 A.5.15 requirement simultaneously. Without dedup, users would upload the same file three times. Dedup saves storage and keeps the evidence library clean.

---

## 3. Risk Register

**What:** Log, score, and track cybersecurity and compliance risks. Each risk has a calculated risk score (impact × likelihood) and a status lifecycle.

**How:**
- Stored in the `risks` table as a JSON blob
- Fields: `title`, `category` (technical/operational/legal/reputational/financial), `likelihood` (1–5), `impact` (1–5), `status` (open/mitigating/resolved/accepted), `owner`, `notes`
- Risk score = `likelihood × impact`, displayed as a colored badge (red ≥16, amber ≥9, green otherwise)
- Full CRUD: `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`

**Why:** A risk register is the foundational artifact auditors ask for in SOC 2 (CC3.2), ISO 27001 (Clause 6.1), and NIST CSF (ID.RA). Having a structured register — not a spreadsheet — means you can generate reports directly from the platform.

---

## 4. Vendor Management

**What:** Track third-party vendors and their risk tier. Used to demonstrate vendor due diligence required by SOC 2 CC9.2, ISO 27001 A.5.19, and NIST CSF GV.SC.

**How:**
- Stored in the `vendors` table as a JSON blob
- Fields: `name`, `category` (saas/infrastructure/professional/data-processor/other), `riskLevel` (low/medium/high/critical), `status` (active/inactive/under-review), `contact`, `website`, `notes`, `reviewDate`, `dataAccess` (boolean)
- Full CRUD with status badges

**Why:** The compliance score's vendor component (20% weight) incentivizes keeping this list current. High-risk vendors lower the score; marking them as reviewed or inactive restores it.

---

## 5. Compliance Calendar

**What:** Schedule and track compliance deadlines — audits, penetration tests, policy reviews, certifications, assessments.

**How:**
- Stored in the `calendar_events` table
- Fields: `title`, `type` (audit/pentest/review/training/certification/assessment/other), `status` (scheduled/in-progress/completed/cancelled/overdue), `dueDate`, `assignee`, `framework`, `notes`
- Calendar score component penalizes overdue events; completing them restores the score
- Full CRUD

**Why:** Compliance is a calendar-driven discipline. SOC 2 requires annual risk assessments, quarterly access reviews, and regular security training. The calendar module ensures none of these slip.

---

## 6. Policies

**What:** Manage the lifecycle of compliance policies — from drafting through approval to retirement.

**How:**
- Stored in the `policies` table as a JSON blob
- Fields: `title`, `category` (security/privacy/hr/operational/legal/technical), `status` (draft/review/active/retired), `version`, `owner`, `content` (full policy text), `frameworks[]` (which frameworks the policy satisfies), `reviewDate`, `approvedBy`
- Full CRUD

**Why:** Policies are the "G" in GRC — the governance layer. SOC 2, ISO 27001, and NIST CSF all require formal written policies. Tracking version, approval status, and review date demonstrates a policy management program, not just a folder of PDFs.

---

## 7. Incident Management

**What:** Log and track security incidents from detection through resolution. Maintains an audit trail of the response timeline.

**How:**
- Stored in the `incidents` table as a JSON blob
- Fields: `title`, `type` (security/privacy/availability/integrity/other), `severity` (critical/high/medium/low), `status` (open/investigating/contained/resolved/closed), `description`, `affected` (systems or data affected), `rootCause`, `remediation`, `owner`, `detectedAt`, `resolvedAt`, `reported` (boolean — whether regulators/customers were notified)
- Full CRUD with severity-coded badges

**Why:** SOC 2 CC7.4–CC7.5 and ISO 27001 A.5.24–A.5.28 require a documented incident response program. The `reported` field tracks notification obligations (e.g., HIPAA breach notification, GDPR 72-hour rule). Having a structured log — not email threads — is what auditors want to see.

---

## 8. Asset Inventory

**What:** Maintain a register of all information assets — systems, applications, data stores, physical devices, people, and services.

**How:**
- Stored in the `assets` table as a JSON blob
- Fields: `name`, `type` (data/system/application/physical/people/service), `classification` (public/internal/confidential/restricted), `owner`, `location`, `description`, `status` (active/inactive/decommissioned), `criticality` (critical/high/medium/low), `tags[]`
- Full CRUD

**Why:** You cannot protect what you don't know you have. ISO 27001 A.5.9 (Inventory of information and other associated assets) and SOC 2 CC6.1 both require asset awareness. Classification (public/internal/confidential/restricted) feeds into data handling controls and breach notification scope.

---

## 9. Framework Controls

**What:** Track the implementation status of every individual control across four compliance frameworks. See which controls are not started, in progress, implemented, or not applicable.

**How:**
- Stored in the `control_status` table with a `UNIQUE(org_id, framework, control_id)` constraint to support upsert
- `GET /api/controls?framework=soc2` — returns all saved statuses for a framework
- `PUT /api/controls` — upserts a control status (checks for existing record, then UPDATE or INSERT)
- The frontend renders a filterable table of all controls for the selected framework with inline status dropdowns
- Clicking any status chip saves immediately via the API

**Supported frameworks:**

| Framework | Controls | Scope |
|---|---|---|
| SOC 2 | 30 criteria | CC1.1–CC9.2 (9 categories) |
| ISO 27001:2022 | 93 controls | A.5–A.8 (4 clauses) |
| NIST CSF 2.0 | 23 categories | GV, ID, PR, DE, RS, RC functions |
| NIST AI RMF | 59 subcategories | GOV, MAP, MEA, MGE functions |

**Crossmap:** The "⟷ Crossmap" view groups controls into 18 thematic clusters (Access Control, Incident Management, Cryptography, etc.) and shows the implementation status of the related control in each framework side-by-side. Clicking any control chip navigates directly to that control in its framework tab.

**Why:** Compliance teams working toward multiple certifications simultaneously (e.g., SOC 2 + ISO 27001) often do redundant work because they don't realize that implementing CC6.1 also satisfies A.5.15, A.5.16, and PR.AA. The crossmap surfaces these overlaps so controls are implemented once and credited everywhere.

---

## 10. Audit Log

**What:** An append-only log of every significant action taken in the platform — uploads, deletions, status changes, logins.

**How:**
- Stored in the `audit_log` table (no UPDATE or DELETE from application code)
- Fields: `action`, `entity`, `entity_id`, `actor_id`, `details` (JSON), `created_at`
- `GET /api/audit` — paginated log for the org
- `GET /api/audit/export` — CSV export
- 12-month retention via `DELETE /api/audit/old`

**Why:** Auditors in SOC 2, ISO 27001, and NIST CSF all want evidence of who did what and when. An immutable audit log also serves as a forensic record in the event of a security incident or insider threat investigation.

---

## 11. Compliance Snapshots

**What:** Capture the compliance score at a point in time. Useful for tracking progress quarter over quarter, or producing evidence of score improvement for auditors.

**How:**
- `POST /api/snapshots` computes the current score and stores it with a label and timestamp
- `GET /api/snapshots` returns all historical snapshots
- Individual snapshots or all snapshots can be deleted

**Why:** Auditors often ask "what was your score at the start of the audit period?" Snapshots provide a timestamped answer and demonstrate a culture of continuous improvement.

---

## 12. Team Management

**What:** Invite team members to the organization, assign roles, and remove members.

**How:**
- `POST /api/orgs/:id/invite` — generates a signed invite token, sends an email via Resend
- `POST /api/orgs/accept-invite` — validates the token, creates the user-org membership
- Roles: `owner`, `admin`, `member`
- `DELETE /api/orgs/:id/members/:userId` — revoke access

**Why:** SOC 2 CC6.2 requires that access to systems is provisioned on a need-to-know basis and terminated promptly when no longer needed. The platform's own team management module demonstrates that principle.
