import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const riskRoutes = new Hono<AppType>()

riskRoutes.use('*', requireAuth)

const riskSchema = z.object({
  title:      z.string().min(1).max(500),
  category:   z.string().max(100).default(''),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact:     z.number().int().min(1).max(5).optional(),
  status:     z.enum(['open','mitigating','resolved','accepted']).default('open'),
  owner:      z.string().max(200).default(''),
  notes:      z.string().max(5000).default(''),
}).passthrough()

riskRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const result = await c.env.DB.prepare(
    'SELECT data FROM risks WHERE org_id = ? ORDER BY created_at ASC'
  ).bind(orgId).all<{ data: string }>()
  return c.json(result.results.map(r => JSON.parse(r.data)))
})

riskRoutes.post('/', zValidator('json', riskSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const risk: Record<string, unknown> = { ...c.req.valid('json') }
  if (!risk.id) risk.id = 'R-' + generateId().slice(0, 8).toUpperCase()
  risk.createdAt = risk.createdAt ?? new Date().toISOString()
  risk.updatedAt = new Date().toISOString()
  await c.env.DB.prepare('INSERT INTO risks (id, org_id, data) VALUES (?, ?, ?)')
    .bind(risk.id, orgId, JSON.stringify(risk)).run()
  return c.json(risk, 201)
})

riskRoutes.put('/:id', zValidator('json', riskSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { id } = c.req.param()
  const exists = await c.env.DB.prepare('SELECT 1 FROM risks WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first()
  if (!exists) return c.json({ error: 'Not found' }, 404)
  const risk = { ...c.req.valid('json'), updatedAt: new Date().toISOString() }
  await c.env.DB.prepare("UPDATE risks SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(risk), id).run()
  return c.json(risk)
})

riskRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { id } = c.req.param()
  await c.env.DB.prepare('DELETE FROM risks WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  return c.json({ ok: true })
})
