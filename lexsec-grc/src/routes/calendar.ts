import { Hono } from 'hono'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const calendarRoutes = new Hono<AppType>()

calendarRoutes.use('*', requireAuth)

// GET /api/calendar
calendarRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const result = await c.env.DB.prepare(
    'SELECT data FROM calendar_events WHERE org_id = ? ORDER BY created_at ASC'
  ).bind(orgId).all<{ data: string }>()

  return c.json(result.results.map(r => JSON.parse(r.data)))
})

// POST /api/calendar
calendarRoutes.post('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const item = await c.req.json<Record<string, unknown>>()
  if (!item.id) item.id = 'cal_' + generateId()

  await c.env.DB.prepare('INSERT INTO calendar_events (id, org_id, data) VALUES (?, ?, ?)')
    .bind(item.id, orgId, JSON.stringify(item)).run()

  return c.json(item, 201)
})

// PUT /api/calendar/:id
calendarRoutes.put('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  const exists = await c.env.DB.prepare('SELECT 1 FROM calendar_events WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first()
  if (!exists) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  await c.env.DB.prepare('UPDATE calendar_events SET data = ? WHERE id = ?')
    .bind(JSON.stringify(body), id).run()

  return c.json(body)
})

// DELETE /api/calendar/:id — must come before DELETE / to avoid ambiguity
calendarRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  await c.env.DB.prepare('DELETE FROM calendar_events WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  return c.json({ ok: true })
})

// DELETE /api/calendar — clear all for org (Hono matches exact path first)
calendarRoutes.delete('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  await c.env.DB.prepare('DELETE FROM calendar_events WHERE org_id = ?').bind(orgId).run()
  return c.json({ ok: true })
})
