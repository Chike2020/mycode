const FROM = 'LexSec Advisory <noreply@lexsecadvisory.com>'

export async function sendInviteEmail(
  apiKey: string,
  to: string,
  inviterName: string,
  orgName: string,
  inviteUrl: string
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: `You've been invited to join ${orgName} on LexSec`,
      html: inviteHtml(inviterName, orgName, inviteUrl),
    }),
  })
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`)
}

function inviteHtml(inviter: string, org: string, url: string) {
  return `<!DOCTYPE html><html><head><style>
    body{font-family:Arial,sans-serif;background:#F7F3EE;margin:0;padding:40px 0}
    .wrap{max-width:520px;margin:0 auto;background:#fff}
    .hdr{background:#0E1F3D;padding:36px;text-align:center}
    .hdr h1{font-family:Georgia,serif;color:#C8A96E;font-size:22px;margin:0;letter-spacing:.04em}
    .hdr p{color:rgba(255,255,255,.45);font-size:12px;margin:6px 0 0}
    .body{padding:40px}
    .body p{color:#1A1A2E;font-size:15px;line-height:1.75;margin:0 0 18px}
    .cta{display:block;background:#0B7A63;color:#fff;text-decoration:none;padding:14px 32px;
         text-align:center;font-size:13px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;margin:28px 0}
    .ftr{background:#F7F3EE;padding:20px 40px}
    .ftr p{color:#6B6B7A;font-size:11px;margin:0}
    .ftr a{color:#0B7A63;word-break:break-all}
  </style></head><body>
  <div class="wrap">
    <div class="hdr"><h1>LEXSEC ADVISORY</h1><p>Where Law Meets Security</p></div>
    <div class="body">
      <p>Hi,</p>
      <p><strong>${inviter}</strong> has invited you to join <strong>${org}</strong> on LexSec Advisory.</p>
      <p>LexSec is an integrated GRC and compliance platform built for organizations at the intersection of legal and cybersecurity risk.</p>
      <a href="${url}" class="cta">Accept Invitation</a>
      <p>This invitation expires in 7 days.</p>
    </div>
    <div class="ftr"><p>Or paste this link: <a href="${url}">${url}</a></p></div>
  </div>
  </body></html>`
}
