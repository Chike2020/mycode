import { Hono } from 'hono'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const vendorRoutes = new Hono<AppType>()

vendorRoutes.use('*', requireAuth)

// GET /api/vendors
vendorRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const result = await c.env.DB.prepare(
    'SELECT data FROM vendors WHERE org_id = ? ORDER BY created_at ASC'
  ).bind(orgId).all<{ data: string }>()

  return c.json(result.results.map(r => JSON.parse(r.data)))
})

// POST /api/vendors
vendorRoutes.post('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const vendor = await c.req.json<Record<string, unknown>>()
  if (!vendor.id) vendor.id = 'V-' + generateId().slice(0, 8).toUpperCase()
  vendor.createdAt = vendor.createdAt ?? new Date().toISOString()
  vendor.updatedAt = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO vendors (id, org_id, data) VALUES (?, ?, ?)')
    .bind(vendor.id, orgId, JSON.stringify(vendor)).run()

  return c.json(vendor, 201)
})

// PUT /api/vendors/:id
vendorRoutes.put('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  const exists = await c.env.DB.prepare('SELECT 1 FROM vendors WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first()
  if (!exists) return c.json({ error: 'Not found' }, 404)

  const body   = await c.req.json<Record<string, unknown>>()
  const vendor = { ...body, updatedAt: new Date().toISOString() }

  await c.env.DB.prepare("UPDATE vendors SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(vendor), id).run()

  return c.json(vendor)
})

// DELETE /api/vendors/:id
vendorRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  await c.env.DB.prepare('DELETE FROM vendors WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  return c.json({ ok: true })
})
