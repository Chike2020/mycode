import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const calendarRoutes = new Hono<AppType>()

calendarRoutes.use('*', requireAuth)

const eventSchema = z.object({
  title:     z.string().min(1).max(500),
  type:      z.string().max(100).default(''),
  status:    z.enum(['scheduled','in-progress','completed','cancelled','overdue']).default('scheduled'),
  dueDate:   z.string().max(20).default(''),
  assignee:  z.string().max(200).default(''),
  framework: z.string().max(100).default(''),
  notes:     z.string().max(5000).default(''),
}).passthrough()

calendarRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const result = await c.env.DB.prepare(
    'SELECT data FROM calendar_events WHERE org_id = ? ORDER BY created_at ASC'
  ).bind(orgId).all<{ data: string }>()
  return c.json(result.results.map(r => JSON.parse(r.data)))
})

calendarRoutes.post('/', zValidator('json', eventSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const item: Record<string, unknown> = { ...c.req.valid('json') }
  if (!item.id) item.id = 'cal_' + generateId()
  await c.env.DB.prepare('INSERT INTO calendar_events (id, org_id, data) VALUES (?, ?, ?)')
    .bind(item.id, orgId, JSON.stringify(item)).run()
  return c.json(item, 201)
})

calendarRoutes.put('/:id', zValidator('json', eventSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { id } = c.req.param()
  const exists = await c.env.DB.prepare('SELECT 1 FROM calendar_events WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first()
  if (!exists) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')
  await c.env.DB.prepare('UPDATE calendar_events SET data = ? WHERE id = ?')
    .bind(JSON.stringify(body), id).run()
  return c.json(body)
})

calendarRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { id } = c.req.param()
  await c.env.DB.prepare('DELETE FROM calendar_events WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  return c.json({ ok: true })
})

calendarRoutes.delete('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  await c.env.DB.prepare('DELETE FROM calendar_events WHERE org_id = ?').bind(orgId).run()
  return c.json({ ok: true })
})
