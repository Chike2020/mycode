# LexSec Advisory — Monorepo

Source code for **LexSec Advisory LLC** — a GRC and cybersecurity advisory practice operated by a NY-licensed attorney and CISSP-certified consultant.

---

## Repository Structure

```
mycode/
├── lexsec-site/                    # Marketing website (lexsecadvisory.com)
├── lexsec-app/                     # SaaS GRC platform (app.lexsecadvisory.com)
├── Accave Verilink GRC Platform/   # Original Express.js GRC app (reference)
└── wrangler.toml                   # Cloudflare Worker config for lexsecadvisory.com
```

---

## 1. lexsec-site — Marketing Website

Static HTML/CSS site served via Cloudflare Workers Assets.

- **URL:** `https://lexsecadvisory.com`
- **Stack:** HTML, CSS, vanilla JS
- **Hosting:** Cloudflare Worker (`mycode`) with custom domain

### Deploy
```bash
npx wrangler deploy
```

---

## 2. lexsec-app — SaaS GRC Platform

Full-stack serverless application for GRC compliance management.

- **URL:** `https://app.lexsecadvisory.com`
- **Stack:** TypeScript, Hono.js, Cloudflare Workers, D1 (SQLite), R2 (object storage)
- **Auth:** JWT in httpOnly cookies, PBKDF2 password hashing via Web Crypto API
- **Payments:** Stripe subscriptions (Free / Pro $299/mo / Enterprise)
- **Email:** Resend transactional emails

### Features

| Module | Description |
|---|---|
| Auth | Register, login, logout, JWT session management |
| Organizations | Multi-tenant orgs, member roles (owner / admin / member) |
| Invitations | Email invite flow with token-based accept page |
| Evidence | File uploads mapped to compliance controls, stored in R2 |
| Risk Register | Track and score cybersecurity and compliance risks |
| Vendors | Third-party vendor risk tracking |
| Compliance Calendar | Deadlines, audits, assessments, renewals |
| Snapshots | Point-in-time compliance score captures |
| Audit Log | Append-only activity log with CSV export (12-month retention) |
| Billing | Stripe Checkout, Customer Portal, webhook handler |

### API Routes

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/orgs
GET    /api/orgs/:id
GET    /api/orgs/:id/members
GET    /api/orgs/:id/invitations
POST   /api/orgs/:id/invite
POST   /api/orgs/accept-invite
DELETE /api/orgs/:id/members/:userId

GET    /api/evidence
GET    /api/evidence/:id/file
POST   /api/evidence
DELETE /api/evidence/:id
DELETE /api/evidence

GET    /api/risks
POST   /api/risks
PUT    /api/risks/:id
DELETE /api/risks/:id

GET    /api/vendors
POST   /api/vendors
PUT    /api/vendors/:id
DELETE /api/vendors/:id

GET    /api/calendar
POST   /api/calendar
PUT    /api/calendar/:id
DELETE /api/calendar/:id
DELETE /api/calendar

GET    /api/snapshots
POST   /api/snapshots
DELETE /api/snapshots/all
DELETE /api/snapshots/:id

GET    /api/audit
POST   /api/audit
GET    /api/audit/export
DELETE /api/audit/old

GET    /api/billing/plans
GET    /api/billing/subscription
POST   /api/billing/checkout
POST   /api/billing/portal

POST   /webhooks/stripe
```

### First-time Setup

```bash
cd lexsec-app

# 1. Install dependencies
npm install

# 2. Create D1 database — copy the database_id output into wrangler.toml
npx wrangler d1 create lexsec-db

# 3. Create R2 bucket
npx wrangler r2 bucket create lexsec-files

# 4. Run migrations
npx wrangler d1 execute lexsec-db --file=migrations/0001_initial.sql --remote
npx wrangler d1 execute lexsec-db --file=migrations/0002_grc_tables.sql --remote

# 5. Set secrets (each command prompts for the value)
npx wrangler secret put JWT_SECRET
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_PRO_MONTHLY
npx wrangler secret put STRIPE_PRICE_ENTERPRISE_MONTHLY
npx wrangler secret put RESEND_API_KEY

# 6. Deploy
npx wrangler deploy
```

### Local Development

```bash
cd lexsec-app
npm run dev    # starts wrangler dev on localhost:8787
```

---

## 3. Accave Verilink GRC Platform

The original Express.js/Node.js GRC platform this project was ported from. Kept as a reference — not actively deployed.

- **Stack:** Node.js, Express, better-sqlite3
- **Auth:** Session-based
- **Storage:** Local SQLite database

---

## Infrastructure

| Resource | Provider | Name |
|---|---|---|
| Marketing site Worker | Cloudflare Workers | `mycode` |
| App Worker | Cloudflare Workers | `lexsec-app` |
| Database | Cloudflare D1 | `lexsec-db` |
| File storage | Cloudflare R2 | `lexsec-files` |
| Email | Resend | `noreply@lexsecadvisory.com` |
| Payments | Stripe | — |

---

## Author

**Chike Okechukwu** — [okechukwuchike@gmail.com](mailto:okechukwuchike@gmail.com)  
NY-licensed attorney · CISSP · PMP · SOC 2 · HIPAA · ISO 27001
