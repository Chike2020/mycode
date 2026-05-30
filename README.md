# LexSec Advisory — Monorepo

> **LexSec Advisory LLC** — GRC and cybersecurity advisory practice operated by a NY-licensed attorney and CISSP-certified consultant.

This repository contains the full source code for both web properties operated under the LexSec Advisory brand.

---

## Repository Structure

```
mycode/
├── lexsec-site/                    # Marketing website  (lexsecadvisory.com)
├── lexsec-app/                     # SaaS GRC platform  (app.lexsecadvisory.com)
├── Accave Verilink GRC Platform/   # Original Express.js reference app
├── docs/                           # Technical documentation
└── wrangler.toml                   # Cloudflare Worker config for lexsecadvisory.com
```

---

## Quick Reference

| Property | URL | Stack |
|---|---|---|
| Marketing site | lexsecadvisory.com | Static HTML/CSS → Cloudflare Workers |
| SaaS platform | app.lexsecadvisory.com | Hono.js + D1 + R2 → Cloudflare Workers |

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, technology choices, and reasoning |
| [GRC Modules](docs/GRC_MODULES.md) | Every compliance module: what, how, why |
| [Compliance Frameworks](docs/FRAMEWORKS.md) | SOC 2, ISO 27001, NIST CSF 2.0, AI RMF coverage & crossmap |
| [Data Model](docs/DATA_MODEL.md) | Full database schema and relationships |
| [API Reference](docs/API_REFERENCE.md) | All API endpoints with request/response shapes |
| [Deployment Guide](docs/DEPLOYMENT.md) | Step-by-step setup and deploy instructions |

---

## Author

**Chike Okechukwu** — [okechukwuchike@gmail.com](mailto:okechukwuchike@gmail.com)
NY-licensed attorney · CISSP · PMP · SOC 2 · HIPAA · ISO 27001
