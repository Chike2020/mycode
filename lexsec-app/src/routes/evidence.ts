import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateId } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const evidenceRoutes = new Hono<AppType>()

evidenceRoutes.use('*', requireAuth)

const MAX_FILE_BYTES = 10 * 1024 * 1024   // 10 MB per file
const MAX_ORG_BYTES  = 200 * 1024 * 1024  // 200 MB per org

// GET /api/evidence — metadata grouped by "fwId|ctrlKey", with mappings array
evidenceRoutes.get('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const result = await c.env.DB.prepare(
    'SELECT id, fw_id, ctrl_key, name, mime_type, size, owner, collection_date, uploaded_by, uploaded_at, content_hash FROM evidence WHERE org_id = ? ORDER BY uploaded_at ASC'
  ).bind(orgId).all<{
    id: string; fw_id: string; ctrl_key: string; name: string
    mime_type: string; size: number; owner: string
    collection_date: string; uploaded_by: string | null; uploaded_at: string
    content_hash: string
  }>()

  // Load all mappings for this org in one query
  const mappingRows = await c.env.DB.prepare(
    'SELECT id, evidence_id, framework, control_id FROM evidence_ctrl_mappings WHERE org_id = ?'
  ).bind(orgId).all<{ id: string; evidence_id: string; framework: string; control_id: string }>()

  const mappingsByEvId: Record<string, { id: string; framework: string; controlId: string }[]> = {}
  for (const m of mappingRows.results) {
    if (!mappingsByEvId[m.evidence_id]) mappingsByEvId[m.evidence_id] = []
    mappingsByEvId[m.evidence_id].push({ id: m.id, framework: m.framework, controlId: m.control_id })
  }

  const grouped: Record<string, unknown[]> = {}
  for (const r of result.results) {
    const key = `${r.fw_id}|${r.ctrl_key}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push({
      id:             r.id,
      name:           r.name,
      type:           r.mime_type,
      size:           r.size,
      owner:          r.owner,
      collectionDate: r.collection_date,
      uploadedAt:     r.uploaded_at,
      contentHash:    r.content_hash,
      fileUrl:        `/api/evidence/${r.id}/file`,
      mappings:       mappingsByEvId[r.id] ?? [],
    })
  }
  return c.json(grouped)
})

// GET /api/evidence/:id/file — stream binary from R2
evidenceRoutes.get('/:id/file', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  const row = await c.env.DB.prepare(
    'SELECT r2_key, mime_type, name FROM evidence WHERE id = ? AND org_id = ?'
  ).bind(id, orgId).first<{ r2_key: string | null; mime_type: string; name: string }>()

  if (!row?.r2_key) return c.json({ error: 'Not found' }, 404)

  const obj = await c.env.BUCKET.get(row.r2_key)
  if (!obj) return c.json({ error: 'File not found in storage' }, 404)

  const headers = new Headers()
  headers.set('Content-Type', row.mime_type || 'application/octet-stream')
  headers.set('Content-Disposition', `attachment; filename="${row.name}"`)
  return new Response(obj.body, { headers })
})

// POST /api/evidence — upload a file (base64 dataUrl), with hash dedup
evidenceRoutes.post(
  '/',
  zValidator('json', z.object({
    fwId:           z.string().min(1),
    ctrlKey:        z.string().min(1),
    name:           z.string().min(1),
    mimeType:       z.string().default(''),
    dataUrl:        z.string().min(1),
    owner:          z.string().default(''),
    collectionDate: z.string().default(''),
    contentHash:    z.string().default(''),
  })),
  async (c) => {
    const orgId  = c.get('orgId')
    const userId = c.get('userId')
    if (!orgId) return c.json({ error: 'No organization context' }, 400)

    const { fwId, ctrlKey, name, mimeType, dataUrl, owner, collectionDate, contentHash } = c.req.valid('json')

    // Hash-based dedup: if we already have this content, just add a new mapping
    if (contentHash) {
      const existing = await c.env.DB.prepare(
        'SELECT id, name FROM evidence WHERE org_id = ? AND content_hash = ?'
      ).bind(orgId, contentHash).first<{ id: string; name: string }>()

      if (existing) {
        // Add a new mapping entry (INSERT OR IGNORE handles duplicates)
        const mapId = generateId()
        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO evidence_ctrl_mappings (id, evidence_id, org_id, framework, control_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(mapId, existing.id, orgId, fwId, ctrlKey).run()
        return c.json({ ok: true, id: existing.id, wasDuplicate: true, existingName: existing.name }, 200)
      }
    }

    // Decode base64 dataUrl → binary
    const commaIdx = dataUrl.indexOf(',')
    const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
    let binary: Uint8Array
    try {
      const raw = atob(b64)
      binary = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) binary[i] = raw.charCodeAt(i)
    } catch {
      return c.json({ error: 'Invalid file data' }, 400)
    }

    if (binary.byteLength > MAX_FILE_BYTES) {
      return c.json({ error: `File too large — max ${MAX_FILE_BYTES / 1024 / 1024} MB` }, 413)
    }

    const totRow = await c.env.DB.prepare('SELECT SUM(size) as s FROM evidence WHERE org_id = ?')
      .bind(orgId).first<{ s: number | null }>()
    if ((totRow?.s ?? 0) + binary.byteLength > MAX_ORG_BYTES) {
      return c.json({ error: 'Organisation storage limit reached' }, 413)
    }

    const id    = 'ev_' + generateId()
    const r2Key = `evidence/${orgId}/${id}`

    await c.env.BUCKET.put(r2Key, binary, {
      httpMetadata: { contentType: mimeType || 'application/octet-stream' },
    })

    await c.env.DB.prepare(`
      INSERT INTO evidence (id, org_id, fw_id, ctrl_key, name, mime_type, size, r2_key, owner, collection_date, uploaded_by, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, orgId, fwId, ctrlKey, name, mimeType, binary.byteLength, r2Key, owner, collectionDate, userId, contentHash).run()

    // Seed the primary mapping
    if (fwId && ctrlKey) {
      const mapId = generateId()
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO evidence_ctrl_mappings (id, evidence_id, org_id, framework, control_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(mapId, id, orgId, fwId, ctrlKey).run()
    }

    return c.json({ ok: true, id, uploadedAt: new Date().toISOString() }, 201)
  }
)

// POST /api/evidence/:id/mappings — add a control mapping to an existing file
evidenceRoutes.post(
  '/:id/mappings',
  zValidator('json', z.object({
    framework: z.string().min(1),
    controlId: z.string().min(1),
  })),
  async (c) => {
    const orgId = c.get('orgId')
    if (!orgId) return c.json({ error: 'No organization context' }, 400)
    const evId = c.req.param('id')

    // Verify the evidence belongs to this org
    const ev = await c.env.DB.prepare('SELECT id FROM evidence WHERE id = ? AND org_id = ?')
      .bind(evId, orgId).first<{ id: string }>()
    if (!ev) return c.json({ error: 'Not found' }, 404)

    const { framework, controlId } = c.req.valid('json')
    const mapId = generateId()
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO evidence_ctrl_mappings (id, evidence_id, org_id, framework, control_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(mapId, evId, orgId, framework, controlId).run()

    return c.json({ ok: true, id: mapId, evidenceId: evId, framework, controlId }, 201)
  }
)

// DELETE /api/evidence/:id/mappings/:mapId — remove a single control mapping
evidenceRoutes.delete('/:id/mappings/:mapId', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)
  const { id, mapId } = c.req.param()

  const r = await c.env.DB.prepare(
    'DELETE FROM evidence_ctrl_mappings WHERE id = ? AND evidence_id = ? AND org_id = ?'
  ).bind(mapId, id, orgId).run()
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// DELETE /api/evidence/:id
evidenceRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const { id } = c.req.param()
  const row = await c.env.DB.prepare('SELECT r2_key FROM evidence WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first<{ r2_key: string | null }>()
  if (!row) return c.json({ error: 'Not found' }, 404)

  const ops: Promise<unknown>[] = [
    c.env.DB.prepare('DELETE FROM evidence_ctrl_mappings WHERE evidence_id = ?').bind(id).run(),
    c.env.DB.prepare('DELETE FROM evidence WHERE id = ?').bind(id).run(),
  ]
  if (row.r2_key) ops.push(c.env.BUCKET.delete(row.r2_key))
  await Promise.all(ops)

  return c.json({ ok: true })
})

// DELETE /api/evidence — clear all evidence for org
evidenceRoutes.delete('/', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const rows = await c.env.DB.prepare('SELECT r2_key FROM evidence WHERE org_id = ? AND r2_key IS NOT NULL')
    .bind(orgId).all<{ r2_key: string }>()

  await Promise.all([
    c.env.DB.prepare('DELETE FROM evidence_ctrl_mappings WHERE org_id = ?').bind(orgId).run(),
    c.env.DB.prepare('DELETE FROM evidence WHERE org_id = ?').bind(orgId).run(),
  ])

  if (rows.results.length > 0) {
    await c.env.BUCKET.delete(rows.results.map(r => r.r2_key))
  }

  return c.json({ ok: true })
})
