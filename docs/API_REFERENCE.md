# API Reference

Base URL: `https://app.lexsecadvisory.com`

All `/api/*` routes (except `/api/auth/*`) require a valid session cookie set by a prior login. The cookie is `httpOnly; Secure; SameSite=Lax` and expires after 7 days.

---

## Authentication

### `POST /api/auth/register`
Create a new user account and organization.
```json
// Request
{ "email": "user@example.com", "password": "...", "name": "Jane Smith", "orgName": "Acme Corp" }

// Response 201
{ "token": "<jwt>", "user": { "id": "...", "email": "...", "name": "..." } }
```

### `POST /api/auth/login`
```json
// Request
{ "email": "user@example.com", "password": "..." }

// Response 200
{ "user": { "id": "...", "email": "...", "name": "..." }, "orgs": [...] }
```
Sets session cookie.

### `POST /api/auth/logout`
Clears session cookie. Returns `{ "ok": true }`.

### `GET /api/auth/me`
Returns the current authenticated user and their orgs.
```json
{ "user": { "id": "...", "email": "...", "name": "..." }, "orgs": [...] }
```

---

## Organizations

### `GET /api/orgs`
List orgs the current user belongs to.

### `GET /api/orgs/:id`
Get org details (name, plan, subscription status).

### `GET /api/orgs/:id/members`
List all members with their roles.

### `POST /api/orgs/:id/invite`
```json
// Request
{ "email": "colleague@example.com", "role": "member" }
```
Sends an invitation email via Resend. Returns `{ "ok": true }`.

### `POST /api/orgs/accept-invite`
```json
// Request
{ "token": "<invite-token>" }
```
Creates user-org membership. Returns `{ "ok": true }`.

### `DELETE /api/orgs/:id/members/:userId`
Remove a member from the org. Owner cannot be removed.

---

## Evidence

### `GET /api/evidence`
Returns files grouped by `"framework|controlId"` key.
```json
{
  "soc2|CC6.1": [
    {
      "id": "ev_abc123",
      "name": "access-policy.pdf",
      "type": "application/pdf",
      "size": 204800,
      "owner": "Security Team",
      "collectionDate": "2026-04-01",
      "uploadedAt": "2026-04-15T10:30:00Z",
      "contentHash": "sha256hex...",
      "fileUrl": "/api/evidence/ev_abc123/file",
      "mappings": [
        { "id": "map_xyz", "framework": "iso27001", "controlId": "A.5.15" }
      ]
    }
  ]
}
```

### `GET /api/evidence/:id/file`
Streams the raw file binary from R2. Sets `Content-Disposition: attachment`.

### `POST /api/evidence`
Upload a file. Accepts base64 `dataUrl`. Runs hash dedup check.
```json
// Request
{
  "fwId": "soc2",
  "ctrlKey": "CC6.1",
  "name": "access-policy.pdf",
  "mimeType": "application/pdf",
  "dataUrl": "data:application/pdf;base64,...",
  "owner": "Security Team",
  "collectionDate": "2026-04-01",
  "contentHash": "sha256hex..."
}

// Response 201 (new upload)
{ "ok": true, "id": "ev_abc123", "uploadedAt": "..." }

// Response 200 (duplicate detected)
{ "ok": true, "id": "ev_abc123", "wasDuplicate": true, "existingName": "access-policy.pdf" }
```

Max file size: 10 MB. Max org storage: 200 MB.

### `POST /api/evidence/:id/mappings`
Map an existing evidence file to an additional control.
```json
// Request
{ "framework": "iso27001", "controlId": "A.5.15" }

// Response 201
{ "ok": true, "id": "map_xyz", "evidenceId": "ev_abc123", "framework": "iso27001", "controlId": "A.5.15" }
```

### `DELETE /api/evidence/:id/mappings/:mapId`
Remove a control mapping (does not delete the file).

### `DELETE /api/evidence/:id`
Delete a file and all its mappings from D1 and R2.

### `DELETE /api/evidence`
Delete all evidence for the org (bulk). Also cleans up mappings and R2 objects.

---

## Risks

### `GET /api/risks`
Returns all risks for the org.
```json
[{ "id": "...", "title": "Ransomware", "category": "technical", "likelihood": 3, "impact": 5, "status": "open", "owner": "IT", "notes": "..." }]
```

### `POST /api/risks`
```json
{ "title": "...", "category": "technical|operational|legal|reputational|financial", "likelihood": 1-5, "impact": 1-5, "status": "open|mitigating|resolved|accepted", "owner": "...", "notes": "..." }
```

### `PUT /api/risks/:id`
Same body as POST. Full replacement.

### `DELETE /api/risks/:id`

---

## Vendors

### `GET /api/vendors`
### `POST /api/vendors`
```json
{ "name": "...", "category": "saas|infrastructure|professional|data-processor|other", "riskLevel": "low|medium|high|critical", "status": "active|inactive|under-review", "contact": "...", "website": "...", "notes": "...", "reviewDate": "YYYY-MM-DD", "dataAccess": true }
```
### `PUT /api/vendors/:id`
### `DELETE /api/vendors/:id`

---

## Compliance Calendar

### `GET /api/calendar`
### `POST /api/calendar`
```json
{ "title": "...", "type": "audit|pentest|review|training|certification|assessment|other", "status": "scheduled|in-progress|completed|cancelled|overdue", "dueDate": "YYYY-MM-DD", "assignee": "...", "framework": "...", "notes": "..." }
```
### `PUT /api/calendar/:id`
### `DELETE /api/calendar/:id`
### `DELETE /api/calendar` — bulk delete all events

---

## Policies

### `GET /api/policies`
### `POST /api/policies`
```json
{ "title": "...", "category": "security|privacy|hr|operational|legal|technical", "status": "draft|review|active|retired", "version": "1.0", "owner": "...", "content": "...", "frameworks": ["soc2", "iso27001"], "reviewDate": "YYYY-MM-DD", "approvedBy": "..." }
```
### `PUT /api/policies/:id`
### `DELETE /api/policies/:id`

---

## Incidents

### `GET /api/incidents`
### `POST /api/incidents`
```json
{ "title": "...", "type": "security|privacy|availability|integrity|other", "severity": "critical|high|medium|low", "status": "open|investigating|contained|resolved|closed", "description": "...", "affected": "...", "rootCause": "...", "remediation": "...", "owner": "...", "detectedAt": "YYYY-MM-DD", "resolvedAt": "YYYY-MM-DD", "reported": false }
```
### `PUT /api/incidents/:id`
### `DELETE /api/incidents/:id`

---

## Assets

### `GET /api/assets`
### `POST /api/assets`
```json
{ "name": "...", "type": "data|system|application|physical|people|service", "classification": "public|internal|confidential|restricted", "owner": "...", "location": "...", "description": "...", "status": "active|inactive|decommissioned", "criticality": "critical|high|medium|low", "tags": ["pii", "production"] }
```
### `PUT /api/assets/:id`
### `DELETE /api/assets/:id`

---

## Framework Controls

### `GET /api/controls?framework=soc2`
Returns all saved statuses for the org for the given framework. `framework` is optional; omit to return all frameworks.
```json
[{ "id": "...", "framework": "soc2", "control_id": "CC6.1", "status": "implemented", "owner": "IT", "notes": "...", "updated_at": "..." }]
```

### `PUT /api/controls`
Upsert a control status (insert or update by `org_id + framework + control_id`).
```json
{ "framework": "soc2|iso27001|nist_csf|ai_rmf", "control_id": "CC6.1", "status": "not_started|in_progress|implemented|na", "owner": "...", "notes": "..." }
```

---

## Compliance Score

### `GET /api/score`
Computes and returns the current compliance score.
```json
{
  "overall": 72,
  "grade": "C",
  "components": {
    "evidence": { "score": 85, "label": "Good evidence coverage", "count": 24, "stale": 2, "weight": 35 },
    "risks":    { "score": 60, "label": "...", "count": 8, "open": 3, "weight": 30 },
    "vendors":  { "score": 70, "label": "...", "count": 5, "highRisk": 1, "weight": 20 },
    "calendar": { "score": 80, "label": "...", "count": 6, "overdue": 1, "weight": 15 }
  },
  "computedAt": "2026-05-29T18:00:00Z"
}
```

---

## Snapshots

### `GET /api/snapshots`
### `POST /api/snapshots`
```json
{ "label": "Q2 2026 snapshot" }
```
Captures current score. Returns `{ "id": "...", "label": "...", "score": 72, "details": {...} }`.

### `DELETE /api/snapshots/:id`
### `DELETE /api/snapshots/all`

---

## Audit Log

### `GET /api/audit`
Returns paginated audit events. Query params: `?limit=50&before=<timestamp>`.

### `GET /api/audit/export`
Returns audit log as CSV download.

### `DELETE /api/audit/old`
Deletes entries older than 12 months.

---

## Billing

### `GET /api/billing/plans`
Returns plan definitions (free, pro, enterprise) with pricing.

### `GET /api/billing/subscription`
Returns the org's current Stripe subscription status and plan.

### `POST /api/billing/checkout`
```json
{ "plan": "pro" }
```
Returns `{ "url": "<stripe-checkout-url>" }`. Redirect the user to this URL.

### `POST /api/billing/portal`
Returns `{ "url": "<stripe-portal-url>" }`. Redirect to manage/cancel subscription.

---

## Webhooks

### `POST /webhooks/stripe`
Receives Stripe events. Verifies `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET`. Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

---

## Error Responses

All errors follow `{ "error": "Human-readable message" }` with an appropriate HTTP status code:

| Status | Meaning |
|---|---|
| 400 | Validation error or missing required field |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized for this org |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |
| 413 | File too large (>10 MB) or org storage limit reached |
| 429 | Rate limit exceeded |
| 500 | Internal server error (details logged, not exposed) |
