import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { generateId } from '../lib/crypto'
import type { AppType } from '../types'

export const controlRoutes = new Hono<AppType>()
controlRoutes.use('*', requireAuth)

const controlSchema = z.object({
  framework:  z.enum(['soc2', 'iso27001', 'nist_csf', 'ai_rmf']),
  control_id: z.string().min(1),
  status:     z.enum(['not_started', 'in_progress', 'implemented', 'na']).default('not_started'),
  owner:      z.string().default(''),
  notes:      z.string().default(''),
})

// GET /api/controls?framework=soc2
controlRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const framework = c.req.query('framework')

  const query = framework
    ? 'SELECT id, framework, control_id, data, updated_at FROM control_status WHERE org_id = ? AND framework = ?'
    : 'SELECT id, framework, control_id, data, updated_at FROM control_status WHERE org_id = ?'

  const rows = await (framework
    ? c.env.DB.prepare(query).bind(orgId, framework)
    : c.env.DB.prepare(query).bind(orgId)
  ).all<{ id: string; framework: string; control_id: string; data: string; updated_at: string }>()

  return c.json(rows.results.map(r => ({
    id: r.id, framework: r.framework, control_id: r.control_id,
    ...JSON.parse(r.data), updated_at: r.updated_at,
  })))
})

// PUT /api/controls — upsert by org+framework+control_id
controlRoutes.put('/', zValidator('json', controlSchema), async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { framework, control_id, ...rest } = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM control_status WHERE org_id = ? AND framework = ? AND control_id = ?'
  ).bind(orgId, framework, control_id).first<{ id: string }>()

  if (existing) {
    await c.env.DB.prepare(
      "UPDATE control_status SET data = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(JSON.stringify(rest), existing.id).run()
    return c.json({ id: existing.id, framework, control_id, ...rest })
  }

  const id = generateId()
  await c.env.DB.prepare(
    'INSERT INTO control_status (id, org_id, framework, control_id, data) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, orgId, framework, control_id, JSON.stringify(rest)).run()
  return c.json({ id, framework, control_id, ...rest }, 201)
})
