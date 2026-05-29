import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { generateId } from '../lib/crypto'
import type { AppType } from '../types'

export const assetRoutes = new Hono<AppType>()
assetRoutes.use('*', requireAuth)

const assetSchema = z.object({
  name:           z.string().min(1),
  type:           z.enum(['data', 'system', 'application', 'physical', 'people', 'service']).default('system'),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']).default('internal'),
  owner:          z.string().default(''),
  location:       z.string().default(''),
  description:    z.string().default(''),
  status:         z.enum(['active', 'inactive', 'decommissioned']).default('active'),
  criticality:    z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  tags:           z.array(z.string()).default([]),
})

assetRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const rows = await c.env.DB.prepare(
    'SELECT id, data, created_at, updated_at FROM assets WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all<{ id: string; data: string; created_at: string; updated_at: string }>()
  return c.json(rows.results.map(r => ({ id: r.id, ...JSON.parse(r.data), created_at: r.created_at, updated_at: r.updated_at })))
})

assetRoutes.post('/', zValidator('json', assetSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const body = c.req.valid('json')
  const id = generateId()
  await c.env.DB.prepare('INSERT INTO assets (id, org_id, data) VALUES (?, ?, ?)')
    .bind(id, orgId, JSON.stringify(body)).run()
  return c.json({ id, ...body }, 201)
})

assetRoutes.put('/:id', zValidator('json', assetSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const r = await c.env.DB.prepare(
    "UPDATE assets SET data = ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?"
  ).bind(JSON.stringify(body), id, orgId).run()
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id, ...body })
})

assetRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const id = c.req.param('id')
  const r = await c.env.DB.prepare('DELETE FROM assets WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
