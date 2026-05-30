import { Hono } from 'hono'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const auditRoutes = new Hono<AppType>()

auditRoutes.use('*', requireAuth)

type AuditRow = {
  id: string; actor: string; type: string
  target: string; detail: string; timestamp: string
  user_id: string | null
}

// GET /api/audit/export — CSV (must be before /:id-style routes)
auditRoutes.get('/export', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const result = await c.env.DB.prepare(
    'SELECT id, actor, type, target, detail, timestamp FROM grc_audit_log WHERE org_id = ? ORDER BY timestamp DESC'
  ).bind(orgId).all<AuditRow>()

  const escape = (v: string | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = 'Timestamp,Actor,Type,Target,Detail\n'
  const body   = result.results
    .map(r => [r.timestamp, r.actor, r.type, r.target, r.detail].map(escape).join(','))
    .join('\n')

  return new Response(header + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
    },
  })
})

// GET /api/audit — filtered list
auditRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { limit = '500', offset = '0', type, search } = c.req.query()

  let sql    = 'SELECT * FROM grc_audit_log WHERE org_id = ?'
  const params: (string | number)[] = [orgId]

  if (type && type !== 'all') {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (search) {
    sql += ' AND (target LIKE ? OR detail LIKE ? OR actor LIKE ?)'
    const s = `%${search}%`
    params.push(s, s, s)
  }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  params.push(Math.min(Number(limit), 1000), Number(offset))

  const result = await c.env.DB.prepare(sql).bind(...params).all<AuditRow>()
  return c.json(result.results)
})

// POST /api/audit
auditRoutes.post('/', async (c) => {
  const orgId  = c.get('orgId')
  const userId = c.get('userId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { type, target, detail, actor } = await c.req.json<{
    type?: string; target?: string; detail?: string; actor?: string
  }>()

  const id = 'al_' + generateId()

  await c.env.DB.prepare(
    'INSERT INTO grc_audit_log (id, org_id, user_id, actor, type, target, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, orgId, userId, actor ?? '', type ?? 'system', target ?? '', detail ?? '').run()

  return c.json({ ok: true, id }, 201)
})

// DELETE /api/audit/old — prune entries older than 12 months
auditRoutes.delete('/old', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  await c.env.DB.prepare(
    "DELETE FROM grc_audit_log WHERE org_id = ? AND timestamp < datetime('now', '-12 months')"
  ).bind(orgId).run()

  return c.json({ ok: true })
})
