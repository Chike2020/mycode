import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const scoreRoutes = new Hono<AppType>()

scoreRoutes.use('*', requireAuth)

// ── Scoring helpers ────────────────────────────────────────────────────────

function freshnessFactor(uploadedAt: string, now: number): number {
  const ageDays = (now - new Date(uploadedAt).getTime()) / 86_400_000
  if (ageDays < 30)  return 1.0
  if (ageDays < 90)  return 0.9
  if (ageDays < 180) return 0.7
  if (ageDays < 365) return 0.4
  return 0.1
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

function grade(score: number): string {
  if (score >= 95) return 'A+'
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 55) return 'D'
  return 'F'
}

function evidenceScore(rows: { uploaded_at: string }[], now: number) {
  if (!rows.length) return { score: 0, label: 'Upload evidence files to start building your score', count: 0, stale: 0 }
  const avg   = rows.reduce((s, r) => s + freshnessFactor(r.uploaded_at, now), 0) / rows.length
  const score = clamp(avg * 100)
  const stale = rows.filter(r => freshnessFactor(r.uploaded_at, now) < 0.7).length
  return {
    score,
    count: rows.length,
    stale,
    label: stale > 0 ? `${stale} file${stale > 1 ? 's' : ''} older than 90 days — re-collect to refresh` : 'All evidence is fresh',
  }
}

function riskScore(risks: Record<string, unknown>[]) {
  if (!risks.length) return { score: 0, label: 'Log your known risks to assess your risk posture', count: 0, open: 0 }
  const open    = risks.filter(r => r.status === 'open' || !r.status)
  const penalty = open.reduce((p, r) => {
    const lvl = Number(r.likelihood ?? 1) * Number(r.impact ?? 1)
    return p + (lvl >= 20 ? 20 : lvl >= 12 ? 10 : lvl >= 6 ? 5 : 2)
  }, 0)
  const score = clamp(100 - penalty)
  return {
    score,
    count: risks.length,
    open:  open.length,
    label: open.length === 0 ? 'All risks resolved' : `${open.length} open risk${open.length > 1 ? 's' : ''} — work to mitigate or accept them`,
  }
}

function vendorScore(vendors: Record<string, unknown>[]) {
  if (!vendors.length) return { score: 0, label: 'Add your vendors to assess third-party risk', count: 0, highRisk: 0 }
  const active    = vendors.filter(v => v.status === 'active' || !v.status)
  const penalty   = active.reduce((p, v) => {
    const lvl = String(v.riskLevel || 'low')
    return p + (lvl === 'critical' ? 18 : lvl === 'high' ? 10 : lvl === 'medium' ? 4 : 0)
  }, 0)
  const score    = clamp(100 - penalty)
  const highRisk = active.filter(v => v.riskLevel === 'critical' || v.riskLevel === 'high').length
  return {
    score,
    count: vendors.length,
    highRisk,
    label: highRisk > 0 ? `${highRisk} high/critical risk vendor${highRisk > 1 ? 's' : ''} — review or remediate` : 'Vendor risk is under control',
  }
}

function calendarScore(events: Record<string, unknown>[]) {
  if (!events.length) return { score: 0, label: 'Schedule compliance deadlines and audits to track obligations', count: 0, overdue: 0 }
  const overdue    = events.filter(e => e.status === 'overdue').length
  const inProgress = events.filter(e => e.status === 'in progress').length
  const completed  = events.filter(e => e.status === 'completed').length
  const penalty    = overdue * 15 + inProgress * 3
  const bonus      = completed > 0 ? Math.min(10, completed * 2) : 0
  const score      = clamp(100 - penalty + bonus)
  return {
    score,
    count: events.length,
    overdue,
    label: overdue > 0 ? `${overdue} overdue event${overdue > 1 ? 's' : ''} — address immediately` : 'No overdue events',
  }
}

// ── GET /api/score ─────────────────────────────────────────────────────────

scoreRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const now = Date.now()

  const [evRows, riskRows, vendorRows, calRows] = await Promise.all([
    c.env.DB.prepare('SELECT uploaded_at FROM evidence WHERE org_id = ?')
      .bind(orgId).all<{ uploaded_at: string }>(),
    c.env.DB.prepare('SELECT data FROM risks WHERE org_id = ?')
      .bind(orgId).all<{ data: string }>(),
    c.env.DB.prepare('SELECT data FROM vendors WHERE org_id = ?')
      .bind(orgId).all<{ data: string }>(),
    c.env.DB.prepare('SELECT data FROM calendar_events WHERE org_id = ?')
      .bind(orgId).all<{ data: string }>(),
  ])

  const ev  = evidenceScore(evRows.results, now)
  const rs  = riskScore(riskRows.results.map(r => JSON.parse(r.data)))
  const vs  = vendorScore(vendorRows.results.map(r => JSON.parse(r.data)))
  const cal = calendarScore(calRows.results.map(r => JSON.parse(r.data)))

  const overall = clamp(0.35 * ev.score + 0.30 * rs.score + 0.20 * vs.score + 0.15 * cal.score)

  return c.json({
    overall,
    grade: grade(overall),
    components: {
      evidence: { ...ev,  weight: 35 },
      risks:    { ...rs,  weight: 30 },
      vendors:  { ...vs,  weight: 20 },
      calendar: { ...cal, weight: 15 },
    },
    computedAt: new Date().toISOString(),
  })
})
