# Architecture

## What Was Built

LexSec Advisory is a dual-property deployment serving two distinct audiences:

1. **lexsecadvisory.com** — a static marketing site describing the firm's advisory services
2. **app.lexsecadvisory.com** — a multi-tenant SaaS GRC (Governance, Risk & Compliance) platform that helps organizations manage their compliance posture across SOC 2, ISO 27001, NIST CSF 2.0, and NIST AI RMF

The platform was rebuilt from scratch from an original Express.js/Node.js application ("Accave Verilink") into a fully serverless, edge-native architecture.

---

## System Diagram

```
Browser
  │
  ├── GET lexsecadvisory.com  →  Cloudflare Worker (mycode)
  │                               └── Serves static HTML/CSS from Workers Assets
  │
  └── GET/POST app.lexsecadvisory.com  →  Cloudflare Worker (lexsec-app)
                                            ├── Hono.js router
                                            ├── /api/*  →  Route handlers
                                            │              ├── D1 (SQLite)  ← structured data
                                            │              └── R2 (Object)  ← evidence files
                                            └── /*      →  Workers Assets (app.html SPA)
```

---

## Technology Stack

### Runtime: Cloudflare Workers

**Why:** Workers run at the edge (300+ global PoPs), have near-zero cold starts (~0ms vs ~100–500ms for AWS Lambda), and bill per request rather than per instance-hour. For a compliance SaaS where clients expect consistent sub-100ms API responses, edge compute is a natural fit.

**Why not:** Workers have a 128MB memory limit, no persistent TCP connections, and no native file system — which is why D1 and R2 exist as companion services.

### Web Framework: Hono.js

**Why:** Hono is purpose-built for edge runtimes. It's 14kB, has zero runtime dependencies, and its routing API closely mirrors Express while being fully compatible with the Web Fetch API that Workers expose. It also ships `@hono/zod-validator` for schema validation and `hono/cors`, `hono/logger` middleware out of the box.

**Why not Express/Fastify:** Those frameworks depend on Node.js built-ins (`net`, `fs`, `http`) that are unavailable in the Workers runtime.

### Database: Cloudflare D1 (SQLite)

**Why:** D1 is serverless SQLite that lives at Cloudflare's edge. No connection pooling, no VPC config, no idle connection costs. Schema is declared in SQL migration files and applied via `wrangler d1 execute`. SQLite's full-text capabilities and JSON functions cover everything the platform needs.

**Schema pattern:** Most GRC entities (risks, vendors, policies, incidents, assets) use a `data TEXT NOT NULL` JSON blob column rather than individual columns for every field. This lets the schema stay stable across feature additions while the actual data shape evolves with the product. The tradeoff is that you can't `ORDER BY` or `WHERE` on nested JSON fields without using SQLite's `json_extract()` — acceptable given the current data volume.

### File Storage: Cloudflare R2

**Why:** R2 is S3-compatible object storage with **zero egress fees**. Evidence files (PDFs, screenshots, exports) are uploaded to R2 with the key `evidence/{orgId}/{evidenceId}`. The API streams the object body directly from R2 to the browser — no base64 round-trip on reads.

### Frontend: Single-Page Application in `app.html`

**Why a single file:** The platform has no build step. `public/app.html` is a ~1,500-line self-contained SPA written in vanilla JS. It imports DM Sans/DM Mono fonts from Google Fonts and nothing else. Deployment is `wrangler deploy` — there is no `npm run build`, no Webpack, no tree-shaking to debug.

**Navigation model:** A `nav()` function swaps the `<main>` content by calling the appropriate `SECTIONS.*()` function. Page state (current org, filter selections, cached data) is held in module-level JS variables. No URL routing or history management is used.

**Why not React/Vue/Svelte:** The audience is a small legal and compliance team. The platform will never have thousands of concurrent users generating complex UI interactions. Vanilla JS avoids dependency bloat, eliminates supply-chain risk from NPM packages, and keeps the entire frontend deliverable as a single cacheable file.

---

## Authentication & Session Model

- Registration: email + password → PBKDF2 key derivation (100,000 iterations, SHA-256) → stored as `hash:salt` in the `users` table
- Login: derive key from submitted password, compare hex strings
- Session: HS256 JWT signed with `JWT_SECRET`, set as `httpOnly; Secure; SameSite=Lax` cookie. Expires in 7 days.
- `requireAuth` middleware: extracts and verifies the JWT from the cookie, sets `userId` and `orgId` on the Hono context for all downstream handlers

**Why httpOnly cookies over Authorization header Bearer tokens:**
- httpOnly prevents XSS-based token theft entirely — JavaScript cannot read the cookie
- Cookies are sent automatically by the browser, simplifying every frontend API call
- SameSite=Lax blocks CSRF for state-mutating cross-site requests

---

## Multi-Tenancy

Every database table that holds org-scoped data has an `org_id TEXT NOT NULL` column. Every API query is bound with `orgId = c.get('orgId')` extracted from the JWT. There is no shared data between orgs. A user may belong to multiple orgs; the active org is stored in the JWT and switched via `POST /api/auth/switch-org` (or equivalent).

---

## Billing Model

Stripe powers subscription management. Three tiers:

| Plan | Price | D1 binding key |
|---|---|---|
| Free | $0 | (no Stripe subscription) |
| Pro | $299/month | `STRIPE_PRICE_PRO_MONTHLY` |
| Enterprise | Custom | `STRIPE_PRICE_ENTERPRISE_MONTHLY` |

Stripe webhooks (`/webhooks/stripe`) update the `subscription_status` and `stripe_customer_id` fields on the org record. The `billing/subscription` endpoint reads this to gate feature access.

---

## Security Decisions

| Decision | Reason |
|---|---|
| PBKDF2 with 100k iterations | Slows offline brute force without requiring bcrypt (unavailable in Workers) |
| httpOnly JWT cookie | Eliminates XSS token theft |
| SameSite=Lax | Mitigates CSRF without requiring a separate CSRF token |
| R2 files served via API (not public bucket) | Files are scoped to `org_id` — direct R2 URLs would bypass auth |
| CORS allowlist (not `*`) | Only `lexsecadvisory.com`, `app.lexsecadvisory.com`, and `FRONTEND_URL` are permitted |
| Rate limiting table (migration 0003) | Tracks login attempts per IP to prevent credential stuffing |
| Input validation with Zod on every POST/PUT | Rejects malformed or oversized payloads before any DB write |
