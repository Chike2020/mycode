import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { generateId } from '../lib/crypto'
import type { AppType } from '../types'

export const policyRoutes = new Hono<AppType>()
policyRoutes.use('*', requireAuth)

const policySchema = z.object({
  title:       z.string().min(1),
  category:    z.string().min(1).default('Information Security'),
  status:      z.enum(['draft', 'review', 'active', 'retired']).default('draft'),
  version:     z.string().default('1.0'),
  owner:       z.string().default(''),
  content:     z.string().default(''),
  frameworks:  z.array(z.string()).default([]),
  review_date: z.string().default(''),
  approved_by: z.string().default(''),
})

policyRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const rows = await c.env.DB.prepare(
    'SELECT id, data, created_at, updated_at FROM policies WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all<{ id: string; data: string; created_at: string; updated_at: string }>()
  return c.json(rows.results.map(r => ({ id: r.id, ...JSON.parse(r.data), created_at: r.created_at, updated_at: r.updated_at })))
})

policyRoutes.post('/', zValidator('json', policySchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const body = c.req.valid('json')
  const id = generateId()
  await c.env.DB.prepare('INSERT INTO policies (id, org_id, data) VALUES (?, ?, ?)')
    .bind(id, orgId, JSON.stringify(body)).run()
  return c.json({ id, ...body }, 201)
})

policyRoutes.put('/:id', zValidator('json', policySchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const r = await c.env.DB.prepare(
    "UPDATE policies SET data = ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?"
  ).bind(JSON.stringify(body), id, orgId).run()
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id, ...body })
})

policyRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const id = c.req.param('id')
  const r = await c.env.DB.prepare('DELETE FROM policies WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
