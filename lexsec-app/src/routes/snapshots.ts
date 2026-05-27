import { Hono } from 'hono'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const snapshotRoutes = new Hono<AppType>()

snapshotRoutes.use('*', requireAuth)

// GET /api/snapshots
snapshotRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const result = await c.env.DB.prepare(
    'SELECT id, label, auto, scores, timestamp, created_by FROM snapshots WHERE org_id = ? ORDER BY timestamp DESC'
  ).bind(orgId).all<{
    id: string; label: string; auto: number
    scores: string; timestamp: string; created_by: string | null
  }>()

  return c.json(result.results.map(r => ({
    id:        r.id,
    label:     r.label,
    auto:      !!r.auto,
    scores:    JSON.parse(r.scores || '{}'),
    timestamp: r.timestamp,
    createdBy: r.created_by,
  })))
})

// POST /api/snapshots
snapshotRoutes.post('/', async (c) => {
  const orgId  = c.get('orgId')
  const userId = c.get('userId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { label, scores, auto } = await c.req.json<{
    label?: string; scores?: Record<string, unknown>; auto?: boolean
  }>()

  const id        = 'snap_' + generateId()
  const timestamp = new Date().toISOString()

  await c.env.DB.prepare(
    'INSERT INTO snapshots (id, org_id, label, auto, scores, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, orgId, label ?? 'Snapshot', auto ? 1 : 0, JSON.stringify(scores ?? {}), userId).run()

  return c.json({ ok: true, id, timestamp }, 201)
})

// DELETE /api/snapshots/all — must be registered before /:id
snapshotRoutes.delete('/all', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  await c.env.DB.prepare('DELETE FROM snapshots WHERE org_id = ?').bind(orgId).run()
  return c.json({ ok: true })
})

// DELETE /api/snapshots/:id
snapshotRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  await c.env.DB.prepare('DELETE FROM snapshots WHERE id = ? AND org_id = ?').bind(id, orgId).run()
  return c.json({ ok: true })
})
