const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/risks
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT data FROM risks WHERE org_id = ? ORDER BY created_at ASC').all(req.user.orgId);
  res.json(rows.map(r => JSON.parse(r.data)));
});

// POST /api/risks
router.post('/', requireAuth, requireRole('owner', 'admin', 'member'), (req, res) => {
  const risk = req.body;
  if (!risk.id) risk.id = 'R-' + uuid().slice(0, 8).toUpperCase();
  risk.createdAt = risk.createdAt || new Date().toISOString();
  risk.updatedAt = new Date().toISOString();
  db.prepare('INSERT INTO risks (id, org_id, data) VALUES (?, ?, ?)').run(risk.id, req.user.orgId, JSON.stringify(risk));
  res.json(risk);
});

// PUT /api/risks/:id
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'member'), (req, res) => {
  const row = db.prepare('SELECT id FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.orgId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const risk = { ...req.body, updatedAt: new Date().toISOString() };
  db.prepare('UPDATE risks SET data = ?, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify(risk), req.params.id);
  res.json(risk);
});

// DELETE /api/risks/:id
router.delete('/:id', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  db.prepare('DELETE FROM risks WHERE id = ? AND org_id = ?').run(req.params.id, req.user.orgId);
  res.json({ ok: true });
});

module.exports = router;
