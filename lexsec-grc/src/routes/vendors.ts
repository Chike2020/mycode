import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const vendorRoutes = new Hono<AppType>()

vendorRoutes.use('*', requireAuth)

const vendorSchema = z.object({
  name:       z.string().min(1).max(300),
  category:   z.string().max(100).default(''),
  riskLevel:  z.enum(['low','medium','high','critical']).default('medium'),
  status:     z.enum(['active','inactive','under-review']).default('active'),
  contact:    z.string().max(300).default(''),
  website:    z.string().max(500).default(''),
  notes:      z.string().max(5000).default(''),
  reviewDate: z.string().max(20).default(''),
  dataAccess: z.boolean().default(false),
}).passthrough()

vendorRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const result = await c.env.DB.prepare(
    'SELECT data FROM vendors WHERE org_id = ? ORDER BY created_at ASC'
  ).bind(orgId).all<{ data: string }>()
  return c.json(result.results.map(r => JSON.parse(r.data)))
})

vendorRoutes.post('/', zValidator('json', vendorSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const vendor: Record<string, unknown> = { ...c.req.valid('json') }
  if (!vendor.id) vendor.id = 'V-' + generateId().slice(0, 8).toUpperCase()
  vendor.createdAt = vendor.createdAt ?? new Date().toISOString()
  vendor.updatedAt = new Date().toISOString()
  await c.env.DB.prepare('INSERT INTO vendors (id, org_id, data) VALUES (?, ?, ?)')
    .bind(vendor.id, orgId, JSON.stringify(vendor)).run()
  return c.json(vendor, 201)
})

vendorRoutes.put('/:id', zValidator('json', vendorSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { id } = c.req.param()
  const exists = await c.env.DB.prepare('SELECT 1 FROM vendors WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first()
  if (!exists) return c.json({ error: 'Not found' }, 404)
  const vendor = { ...c.req.valid('json'), updatedAt: new Date().toISOString() }
  await c.env.DB.prepare("UPDATE vendors SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(vendor), id).run()
  return c.json(vendor)
})

vendorRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { id } = c.req.param()
  await c.env.DB.prepare('DELETE FROM vendors WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  return c.json({ ok: true })
})
