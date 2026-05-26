const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/vendors
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT data FROM vendors WHERE org_id = ? ORDER BY created_at ASC').all(req.user.orgId);
  res.json(rows.map(r => JSON.parse(r.data)));
});

// POST /api/vendors
router.post('/', requireAuth, requireRole('owner', 'admin', 'member'), (req, res) => {
  const vendor = req.body;
  if (!vendor.id) vendor.id = 'V-' + uuid().slice(0, 8).toUpperCase();
  vendor.createdAt = vendor.createdAt || new Date().toISOString();
  vendor.updatedAt = new Date().toISOString();
  db.prepare('INSERT INTO vendors (id, org_id, data) VALUES (?, ?, ?)').run(vendor.id, req.user.orgId, JSON.stringify(vendor));
  res.json(vendor);
});

// PUT /api/vendors/:id
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'member'), (req, res) => {
  const row = db.prepare('SELECT id FROM vendors WHERE id = ? AND org_id = ?').get(req.params.id, req.user.orgId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const vendor = { ...req.body, updatedAt: new Date().toISOString() };
  db.prepare("UPDATE vendors SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(vendor), req.params.id);
  res.json(vendor);
});

// DELETE /api/vendors/:id
router.delete('/:id', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  db.prepare('DELETE FROM vendors WHERE id = ? AND org_id = ?').run(req.params.id, req.user.orgId);
  res.json({ ok: true });
});

module.exports = router;
