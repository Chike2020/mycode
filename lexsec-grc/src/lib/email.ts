const FROM        = 'LexSec Advisory <noreply@lexsecadvisory.com>'
const ADMIN_EMAIL = 'info@lexsecadvisory.com'

async function send(apiKey: string, payload: object): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}

function wrap(body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#F7F3EE;padding:40px 0}
    .wrap{max-width:540px;margin:0 auto;background:#fff}
    .hdr{background:#0E1F3D;padding:36px;text-align:center}
    .hdr h1{font-family:Georgia,serif;color:#C8A96E;font-size:20px;letter-spacing:.06em}
    .hdr p{color:rgba(255,255,255,.4);font-size:11px;margin-top:6px;letter-spacing:.04em;text-transform:uppercase}
    .body{padding:40px}
    .body p{color:#1A1A2E;font-size:15px;line-height:1.8;margin-bottom:16px}
    .cta{display:block;background:#0B7A63;color:#fff;text-decoration:none;
         padding:14px 32px;text-align:center;font-size:12px;font-weight:600;
         letter-spacing:.08em;text-transform:uppercase;margin:28px 0}
    .divider{border:none;border-top:1px solid #E8E4DE;margin:24px 0}
    .ftr{background:#F7F3EE;padding:20px 40px}
    .ftr p{color:#6B6B7A;font-size:11px;line-height:1.7}
    .ftr a{color:#0B7A63;word-break:break-all}
  </style></head><body>
  <div class="wrap">
    <div class="hdr"><h1>LEXSEC ADVISORY</h1><p>Where Law Meets Security</p></div>
    ${body}
  </div></body></html>`
}

// ── INVITE ────────────────────────────────────────────────────────────────
export async function sendInviteEmail(
  apiKey: string, to: string, inviterName: string, orgName: string, inviteUrl: string
): Promise<void> {
  await send(apiKey, {
    from: FROM, to: [to],
    subject: `You've been invited to join ${orgName} on LexSec`,
    html: wrap(`
      <div class="body">
        <p>Hi,</p>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on LexSec Advisory — an integrated GRC and compliance platform for organizations at the intersection of legal and cybersecurity risk.</p>
        <a href="${inviteUrl}" class="cta">Accept Invitation →</a>
        <p style="font-size:13px;color:#6B6B7A">This invitation expires in 7 days.</p>
      </div>
      <div class="ftr"><p>Or copy this link: <a href="${inviteUrl}">${inviteUrl}</a></p></div>
    `),
  })
}

// ── WELCOME ───────────────────────────────────────────────────────────────
export async function sendWelcomeEmail(
  apiKey: string, to: string, fullName: string
): Promise<void> {
  const firstName = fullName.split(' ')[0] || fullName
  await send(apiKey, {
    from: FROM, to: [to],
    subject: 'Welcome to LexSec Advisory',
    html: wrap(`
      <div class="body">
        <p>Hi ${firstName},</p>
        <p>Welcome to <strong>LexSec Advisory</strong>. Your account is ready.</p>
        <p>You have full access to the GRC platform — Risk Register, Evidence Management, Framework Controls (SOC 2, ISO 27001, NIST CSF, HIPAA), Compliance Calendar, Incident Tracking, and more.</p>
        <a href="https://app.lexsecadvisory.com" class="cta">Open LexSec Advisory →</a>
        <hr class="divider">
        <p style="font-size:13px;color:#6B6B7A">We recommend starting with the <strong>Onboarding</strong> module — it takes under five minutes and will show you exactly where to focus first.</p>
      </div>
      <div class="ftr"><p>Questions? Reply to this email or contact us at <a href="mailto:info@lexsecadvisory.com">info@lexsecadvisory.com</a></p></div>
    `),
  })
}

// ── WAITLIST CONFIRMATION ─────────────────────────────────────────────────
export async function sendWaitlistConfirmationEmail(
  apiKey: string, to: string, name: string
): Promise<void> {
  const firstName = name.split(' ')[0] || name
  await send(apiKey, {
    from: FROM, to: [to],
    subject: "You're on the VeriLink waitlist",
    html: wrap(`
      <div class="body">
        <p>Hi ${firstName},</p>
        <p>You're on the list. We'll reach out as soon as <strong>VeriLink</strong> is ready for early access.</p>
        <p>VeriLink will add automated environment assessment, AI regulatory translation, and gap analysis on top of the LexSec GRC platform you already have access to.</p>
        <hr class="divider">
        <p style="font-size:13px;color:#6B6B7A">In the meantime, you can start building your compliance posture with the free GRC modules at <a href="https://app.lexsecadvisory.com">app.lexsecadvisory.com</a>.</p>
      </div>
      <div class="ftr"><p>Questions? <a href="mailto:info@lexsecadvisory.com">info@lexsecadvisory.com</a></p></div>
    `),
  })
}

// ── ADMIN: WAITLIST NOTIFICATION ──────────────────────────────────────────
export async function sendWaitlistAdminNotification(
  apiKey: string, name: string, email: string, org: string
): Promise<void> {
  await send(apiKey, {
    from: FROM, to: [ADMIN_EMAIL],
    subject: `New VeriLink waitlist signup — ${name}`,
    html: wrap(`
      <div class="body">
        <p><strong>New VeriLink waitlist signup</strong></p>
        <p>Name: <strong>${name}</strong><br>
           Email: <a href="mailto:${email}">${email}</a><br>
           Organization: ${org || '—'}</p>
      </div>
      <div class="ftr"><p>Sent automatically by LexSec Advisory.</p></div>
    `),
  })
}
