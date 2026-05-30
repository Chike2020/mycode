import { Hono } from 'hono'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const riskRoutes = new Hono<AppType>()

riskRoutes.use('*', requireAuth)

// GET /api/risks
riskRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const result = await c.env.DB.prepare(
    'SELECT data FROM risks WHERE org_id = ? ORDER BY created_at ASC'
  ).bind(orgId).all<{ data: string }>()

  return c.json(result.results.map(r => JSON.parse(r.data)))
})

// POST /api/risks
riskRoutes.post('/', async (c) => {
  const orgId  = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const risk = await c.req.json<Record<string, unknown>>()
  if (!risk.id) risk.id = 'R-' + generateId().slice(0, 8).toUpperCase()
  risk.createdAt = risk.createdAt ?? new Date().toISOString()
  risk.updatedAt = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO risks (id, org_id, data) VALUES (?, ?, ?)')
    .bind(risk.id, orgId, JSON.stringify(risk)).run()

  return c.json(risk, 201)
})

// PUT /api/risks/:id
riskRoutes.put('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  const exists = await c.env.DB.prepare('SELECT 1 FROM risks WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first()
  if (!exists) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  const risk  = { ...body, updatedAt: new Date().toISOString() }

  await c.env.DB.prepare("UPDATE risks SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(risk), id).run()

  return c.json(risk)
})

// DELETE /api/risks/:id
riskRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  await c.env.DB.prepare('DELETE FROM risks WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  return c.json({ ok: true })
})
