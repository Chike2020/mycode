import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { generateId } from '../lib/crypto'
import type { AppType } from '../types'

export const incidentRoutes = new Hono<AppType>()
incidentRoutes.use('*', requireAuth)

const incidentSchema = z.object({
  title:       z.string().min(1),
  type:        z.enum(['security', 'privacy', 'availability', 'integrity', 'other']).default('security'),
  severity:    z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  status:      z.enum(['open', 'investigating', 'contained', 'resolved', 'closed']).default('open'),
  description: z.string().default(''),
  affected:    z.string().default(''),
  root_cause:  z.string().default(''),
  remediation: z.string().default(''),
  owner:       z.string().default(''),
  detected_at: z.string().default(''),
  resolved_at: z.string().default(''),
  reported:    z.boolean().default(false),
})

incidentRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const rows = await c.env.DB.prepare(
    'SELECT id, data, created_at, updated_at FROM incidents WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all<{ id: string; data: string; created_at: string; updated_at: string }>()
  return c.json(rows.results.map(r => ({ id: r.id, ...JSON.parse(r.data), created_at: r.created_at, updated_at: r.updated_at })))
})

incidentRoutes.post('/', zValidator('json', incidentSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const body = c.req.valid('json')
  const id = generateId()
  await c.env.DB.prepare('INSERT INTO incidents (id, org_id, data) VALUES (?, ?, ?)')
    .bind(id, orgId, JSON.stringify(body)).run()
  return c.json({ id, ...body }, 201)
})

incidentRoutes.put('/:id', zValidator('json', incidentSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const r = await c.env.DB.prepare(
    "UPDATE incidents SET data = ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?"
  ).bind(JSON.stringify(body), id, orgId).run()
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id, ...body })
})

incidentRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const id = c.req.param('id')
  const r = await c.env.DB.prepare('DELETE FROM incidents WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
