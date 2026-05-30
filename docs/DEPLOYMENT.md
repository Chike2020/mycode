# Deployment Guide

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- Cloudflare account with Workers and D1 enabled
- Stripe account (for billing)
- Resend account (for transactional email)

---

## First-Time Setup

### 1. Clone and install

```bash
git clone https://github.com/Chike2020/mycode.git
cd mycode/lexsec-app
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 3. Create D1 database

```bash
npx wrangler d1 create lexsec-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "lexsec-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 4. Create R2 bucket

```bash
npx wrangler r2 bucket create lexsec-files
```

### 5. Run all migrations (in order)

```bash
npx wrangler d1 execute lexsec-db --remote --file=migrations/0001_initial.sql
npx wrangler d1 execute lexsec-db --remote --file=migrations/0002_grc_tables.sql
npx wrangler d1 execute lexsec-db --remote --file=migrations/0003_rate_limiting.sql
npx wrangler d1 execute lexsec-db --remote --file=migrations/0004_extended_grc.sql
npx wrangler d1 execute lexsec-db --remote --file=migrations/0005_evidence_dedup.sql
```

> **Note:** Always run from the `lexsec-app/` directory so Wrangler finds `wrangler.toml`.

### 6. Set secrets

Each command below will prompt you to paste the value:

```bash
npx wrangler secret put JWT_SECRET
# Paste a long random string (e.g. openssl rand -hex 32)

npx wrangler secret put STRIPE_SECRET_KEY
# Paste sk_live_... from Stripe Dashboard → Developers → API keys

npx wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste whsec_... from Stripe Dashboard → Webhooks → your endpoint

npx wrangler secret put STRIPE_PRICE_PRO_MONTHLY
# Paste price_... for the Pro plan from Stripe Dashboard → Products

npx wrangler secret put STRIPE_PRICE_ENTERPRISE_MONTHLY
# Paste price_... for the Enterprise plan

npx wrangler secret put RESEND_API_KEY
# Paste re_... from resend.com → API Keys
```

### 7. Deploy

```bash
npx wrangler deploy
```

The Worker will be live at `https://app.lexsecadvisory.com` (or whatever custom domain is set in `wrangler.toml`).

### 8. Register the Stripe webhook

In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), add an endpoint:
- URL: `https://app.lexsecadvisory.com/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` (step 6).

---

## Routine Deployments

After making code changes:

```bash
cd lexsec-app
npx wrangler deploy
```

After adding a new migration file:

```bash
npx wrangler d1 execute lexsec-db --remote --file=migrations/<new-file>.sql
npx wrangler deploy
```

---

## Local Development

```bash
cd lexsec-app
npm run dev
```

Starts a local Worker at `http://localhost:8787`. Note that D1 and R2 in local dev use local emulated storage, not the remote database. To test against the real D1, add `--remote` flag to the wrangler command.

---

## Marketing Site

The marketing site (`lexsec-site/`) is a separate Worker deployment:

```bash
cd mycode    # repo root (not lexsec-app)
npx wrangler deploy
```

This deploys the `mycode` Worker that serves `lexsec-site/` as static assets at `https://lexsecadvisory.com`.

---

## Environment Variables (non-secret)

Set in `wrangler.toml` under `[vars]`:

```toml
[vars]
FRONTEND_URL = "https://app.lexsecadvisory.com"
```

This value is used in CORS configuration to allow the frontend origin.

---

## Infrastructure Summary

| Resource | Provider | Name | Used For |
|---|---|---|---|
| Marketing site Worker | Cloudflare Workers | `mycode` | lexsecadvisory.com |
| App Worker | Cloudflare Workers | `lexsec-app` | app.lexsecadvisory.com |
| Database | Cloudflare D1 | `lexsec-db` | All structured data |
| File storage | Cloudflare R2 | `lexsec-files` | Evidence file uploads |
| Email | Resend | — | Invitations, notifications |
| Payments | Stripe | — | Subscriptions, invoicing |

---

## Secrets Reference

| Secret | Where to get it |
|---|---|
| `JWT_SECRET` | Generate locally: `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → endpoint → Signing secret |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe Dashboard → Products → Pro → price ID |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Stripe Dashboard → Products → Enterprise → price ID |
| `RESEND_API_KEY` | resend.com → API Keys |

---

## Troubleshooting

### "Unable to read SQL text file"
You are running `wrangler d1 execute` from the wrong directory. Always run from `lexsec-app/`:
```bash
cd mycode/lexsec-app
npx wrangler d1 execute lexsec-db --remote --file=migrations/0005_evidence_dedup.sql
```

### Score shows stale data
The score is computed live on each request to `GET /api/score`. If you see an unexpected value, open DevTools → Network → look for the `/api/score` response body to see the raw JSON.

### CORS errors in browser
Verify `FRONTEND_URL` in `wrangler.toml` matches the exact origin (including `https://`). The CORS config allows `FRONTEND_URL`, `https://lexsecadvisory.com`, and `https://app.lexsecadvisory.com`.

### Stripe webhooks not processing
1. Check that the endpoint URL is correct in the Stripe dashboard
2. Verify `STRIPE_WEBHOOK_SECRET` matches the webhook's signing secret
3. Check the Stripe dashboard → Webhooks → recent deliveries for error details
