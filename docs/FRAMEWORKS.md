# Compliance Frameworks

The platform supports four frameworks natively. Each framework's controls are hardcoded in `public/app.html` under the `FRAMEWORKS` constant. Implementation status is stored per-control in the `control_status` D1 table.

---

## SOC 2 (30 Criteria)

SOC 2 is organized around the **Trust Services Criteria (TSC)** published by the AICPA. The platform covers the Security category (CC series) which is required for all SOC 2 reports, plus the Availability, Confidentiality, Processing Integrity, and Privacy categories.

| Category | Criteria | Description |
|---|---|---|
| CC1 — Control Environment | CC1.1–CC1.5 | COSO principles, board oversight, commitment to competence |
| CC2 — Communication & Information | CC2.1–CC2.3 | Internal/external communication of control objectives |
| CC3 — Risk Assessment | CC3.1–CC3.4 | Fraud risk, change risk, vendor risk assessment |
| CC4 — Monitoring Activities | CC4.1–CC4.2 | Ongoing monitoring, separate evaluations |
| CC5 — Control Activities | CC5.1–CC5.3 | Control selection, technology controls |
| CC6 — Logical & Physical Access | CC6.1–CC6.8 | Access provisioning, MFA, encryption, physical security |
| CC7 — System Operations | CC7.1–CC7.5 | Vulnerability management, incident response |
| CC8 — Change Management | CC8.1 | Change authorization, testing, deployment |
| CC9 — Risk Mitigation | CC9.1–CC9.2 | Risk transfer, vendor/business partner management |

---

## ISO 27001:2022 (93 Controls)

ISO 27001:2022 reorganized the control set into four annexes (A.5–A.8), reducing from 114 controls (2013 version) to 93. Eleven controls are new in the 2022 revision.

| Clause | Controls | Themes |
|---|---|---|
| A.5 — Organizational | A.5.1–A.5.37 (37 controls) | Policies, roles, asset management, access control, cryptography, supplier relationships, incidents, business continuity, compliance |
| A.6 — People | A.6.1–A.6.8 (8 controls) | Screening, terms of employment, security awareness, disciplinary process, remote work, monitoring |
| A.7 — Physical | A.7.1–A.7.14 (14 controls) | Physical security perimeters, equipment protection, clear desk, secure disposal |
| A.8 — Technological | A.8.1–A.8.34 (34 controls) | User endpoints, access rights, authentication, logging, malware protection, vulnerability management, network security, SSDLC, data masking, DLP, web filtering, secure coding |

New 2022 controls include: Threat intelligence (A.5.7), Information security for cloud services (A.5.23), ICT readiness for business continuity (A.5.30), Physical security monitoring (A.7.4), Configuration management (A.8.9), Data masking (A.8.11), Data leakage prevention (A.8.12), Monitoring activities (A.8.16), Web filtering (A.8.23), Secure coding (A.8.28).

---

## NIST CSF 2.0 (23 Categories)

The NIST Cybersecurity Framework 2.0 (released February 2024) added a sixth function — **Govern** — to the original five. The platform covers all six functions.

| Function | Categories | Purpose |
|---|---|---|
| **GV — Govern** | GV.OC, GV.RM, GV.RR, GV.PO, GV.OV, GV.SC | Cybersecurity risk strategy, expectations, policy, and oversight |
| **ID — Identify** | ID.AM, ID.RA, ID.IM | Asset management, risk assessment, improvement |
| **PR — Protect** | PR.AA, PR.AT, PR.DS, PR.PS, PR.IR | Access control, awareness, data security, platform security, resilience |
| **DE — Detect** | DE.CM, DE.AE | Continuous monitoring, adverse event analysis |
| **RS — Respond** | RS.MA, RS.AN, RS.CO, RS.MI | Incident management, analysis, communication, mitigation |
| **RC — Recover** | RC.RP, RC.CO | Recovery planning, communications |

---

## NIST AI RMF (59 Subcategories)

The NIST Artificial Intelligence Risk Management Framework (AI RMF 1.0, January 2023) provides a voluntary framework for managing risks specific to AI systems. It is organized around four core functions.

| Function | Subcategories | Focus |
|---|---|---|
| **GOV — Govern** | GOV-1.1 through GOV-6.2 (21 subcategories) | AI risk culture, accountability structures, policies, workforce competency, third-party risk |
| **MAP — Map** | MAP-1.1 through MAP-5.2 (18 subcategories) | AI context, risk categorization, scientific integrity, impact assessment |
| **MEA — Measure** | MEA-1.1 through MEA-2.13 (13 subcategories) | AI risk metrics, evaluation approaches, bias testing, monitoring |
| **MGE — Manage** | MGE-1.1 through MGE-4.2 (7 subcategories) | Risk response, prioritization, residual risk tracking |

The AI RMF is particularly relevant for organizations deploying machine learning models in compliance or legal contexts (e.g., contract review, fraud detection, automated decisioning).

---

## Framework Crossmap

The crossmap identifies 18 thematic clusters where controls from all four frameworks address the same underlying security domain. This allows organizations to implement a control once and credit it across multiple frameworks.

| Cluster | SOC 2 | ISO 27001 | NIST CSF | AI RMF |
|---|---|---|---|---|
| Access Control | CC6.1, CC6.2, CC6.3 | A.5.15, A.5.16, A.5.17, A.5.18, A.8.2, A.8.3 | PR.AA | GOV-5.2 |
| Incident Management | CC7.4, CC7.5 | A.5.24, A.5.25, A.5.26, A.5.27, A.5.28 | RS.MA, RS.AN, RS.CO, RS.MI | GOV-6.1, MGE-1.3, MGE-2.2 |
| Cryptography & Key Mgmt | CC6.7 | A.5.33, A.5.34, A.8.24 | PR.DS | — |
| Vendor / Supply Chain | CC9.2 | A.5.19, A.5.20, A.5.21, A.5.22, A.5.23 | GV.SC | GOV-5.1, GOV-5.2 |
| Change Management | CC8.1 | A.8.32 | PR.PS | MAP-3.5, MGE-3.2 |
| Business Continuity | CC9.1 | A.5.29, A.5.30 | RC.RP, RC.CO | — |
| Risk Assessment | CC3.1, CC3.2 | A.5.7, A.8.8 | ID.RA, GV.RM | MAP-1.5, MAP-2.3 |
| Asset Management | CC6.1 | A.5.9, A.5.10, A.5.11, A.5.12 | ID.AM | MAP-1.1 |
| Security Awareness | CC1.4 | A.6.3 | PR.AT | GOV-1.4 |
| Logging & Monitoring | CC7.2, CC7.3 | A.8.15, A.8.16 | DE.CM, DE.AE | MEA-2.9 |
| Vulnerability Mgmt | CC7.1 | A.8.8, A.8.29 | ID.RA, DE.CM | MEA-2.5 |
| Data Protection | CC6.7 | A.8.11, A.8.12 | PR.DS | MEA-2.6 |
| Physical Security | CC6.4, CC6.5 | A.7.1–A.7.6 | PR.AA | — |
| AI & Emerging Tech | — | A.5.23 | GV.OC | GOV-1.1 to GOV-6.2 |
| Privacy | — | A.5.34 | GV.OC | MAP-5.1, MAP-5.2 |
| Governance & Policy | CC1.1–CC1.5 | A.5.1, A.5.2 | GV.OC, GV.PO | GOV-1.1, GOV-1.7 |
| Third-Party AI Risk | — | A.5.19, A.5.21 | GV.SC | GOV-5.1, GOV-5.2 |
| Resilience & Recovery | CC7.5, CC9.1 | A.5.29, A.5.30 | RC.RP | MGE-4.1, MGE-4.2 |

### How to Use the Crossmap

1. Navigate to **Frameworks** → click **⟷ Crossmap**
2. Each row is a cluster. Each column is a framework.
3. Color-coded chips show implementation status: green = implemented, amber = in progress, gray = not started
4. Click any chip to jump directly to that control in its framework tab

### Why the Crossmap Matters

A typical mid-market company pursuing SOC 2 and ISO 27001 simultaneously will often implement access control twice — once framed as CC6.1 and once as A.5.15. The crossmap makes the overlap explicit so the same policy, evidence file, and control implementation satisfies both frameworks without duplication.
