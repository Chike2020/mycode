import { Hono } from 'hono'
import { requirePlatformAdmin } from '../middleware/auth'
import type { AppType } from '../types'

export const adminRoutes = new Hono<AppType>()

adminRoutes.use('*', requirePlatformAdmin)

adminRoutes.get('/stats', async (c) => {
  const [users, orgs, waitlist, last7] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM organizations').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM waitlist').first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 days')").first<{ n: number }>(),
  ])
  return c.json({
    users:        users?.n     ?? 0,
    orgs:         orgs?.n      ?? 0,
    waitlist:     waitlist?.n  ?? 0,
    signups_7d:   last7?.n     ?? 0,
  })
})

adminRoutes.get('/users', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.full_name, u.created_at, u.is_platform_admin,
           o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.plan AS org_plan,
           m.role AS role
    FROM users u
    LEFT JOIN org_members m ON m.user_id = u.id
    LEFT JOIN organizations o ON o.id = m.org_id
    ORDER BY u.created_at DESC
  `).all()
  return c.json(result.results)
})

adminRoutes.get('/orgs', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT o.id, o.name, o.slug, o.plan, o.plan_status, o.created_at,
           COUNT(DISTINCT m.user_id) AS member_count
    FROM organizations o
    LEFT JOIN org_members m ON m.org_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all()
  return c.json(result.results)
})

adminRoutes.get('/waitlist', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT id, name, email, org, created_at FROM waitlist ORDER BY created_at DESC'
  ).all()
  return c.json(result.results)
})

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n')
}

adminRoutes.get('/users.csv', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT u.created_at, u.full_name, u.email, o.name AS org, m.role
    FROM users u
    LEFT JOIN org_members m ON m.user_id = u.id
    LEFT JOIN organizations o ON o.id = m.org_id
    ORDER BY u.created_at DESC
  `).all<Record<string, unknown>>()
  return new Response(csv(result.results), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lexsec-users.csv"',
    },
  })
})

adminRoutes.get('/waitlist.csv', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT created_at, name, email, org FROM waitlist ORDER BY created_at DESC'
  ).all<Record<string, unknown>>()
  return new Response(csv(result.results), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lexsec-waitlist.csv"',
    },
  })
})
