const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/evidence — all evidence for org, grouped as { "fwId|ctrlKey": [items] }
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM evidence WHERE org_id = ?').all(req.user.orgId);
  const grouped = {};
  rows.forEach(r => {
    const key = r.fw_id + '|' + r.ctrl_key;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      id: r.id, name: r.name, type: r.mime_type, size: r.size,
      dataUrl: r.data_url, owner: r.owner,
      collectionDate: r.collection_date, uploadedAt: r.uploaded_at,
    });
  });
  res.json(grouped);
});

// POST /api/evidence — add a file
router.post('/', requireAuth, async (req, res) => {
  const { fwId, ctrlKey, name, mimeType, size, dataUrl, owner, collectionDate } = req.body;
  if (!fwId || !ctrlKey || !name || !dataUrl) return res.status(400).json({ error: 'fwId, ctrlKey, name, dataUrl required' });

  const MAX_FILE = 2 * 1024 * 1024;
  const MAX_ORG  = 50 * 1024 * 1024;  // 50 MB per org (server-side limit)

  const approxSize = Math.round((dataUrl.length * 3) / 4);
  if (approxSize > MAX_FILE) return res.status(413).json({ error: 'File too large — max 2 MB' });

  const total = db.prepare("SELECT SUM(size) as s FROM evidence WHERE org_id = ?").get(req.user.orgId);
  if ((total?.s || 0) + approxSize > MAX_ORG) return res.status(413).json({ error: 'Organisation storage limit reached' });

  const id = 'ev_' + uuid();
  db.prepare(`
    INSERT INTO evidence (id, org_id, fw_id, ctrl_key, name, mime_type, size, data_url, owner, collection_date, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.orgId, fwId, ctrlKey, name, mimeType || '', approxSize, dataUrl, owner || '', collectionDate || '', req.user.id);

  res.json({ ok: true, id, uploadedAt: new Date().toISOString() });
});

// DELETE /api/evidence/:id
router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM evidence WHERE id = ? AND org_id = ?').get(req.params.id, req.user.orgId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM evidence WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/evidence — clear all for org
router.delete('/', requireAuth, (req, res) => {
  db.prepare('DELETE FROM evidence WHERE org_id = ?').run(req.user.orgId);
  res.json({ ok: true });
});

module.exports = router;
