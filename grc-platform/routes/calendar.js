const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/calendar
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT data FROM calendar WHERE org_id = ? ORDER BY created_at ASC').all(req.user.orgId);
  res.json(rows.map(r => JSON.parse(r.data)));
});

// POST /api/calendar
router.post('/', requireAuth, requireRole('owner', 'admin', 'member'), (req, res) => {
  const item = req.body;
  if (!item.id) item.id = 'cal_' + uuid();
  db.prepare('INSERT INTO calendar (id, org_id, data) VALUES (?, ?, ?)').run(item.id, req.user.orgId, JSON.stringify(item));
  res.json(item);
});

// PUT /api/calendar/:id
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'member'), (req, res) => {
  const row = db.prepare('SELECT id FROM calendar WHERE id = ? AND org_id = ?').get(req.params.id, req.user.orgId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE calendar SET data = ? WHERE id = ?').run(JSON.stringify(req.body), req.params.id);
  res.json(req.body);
});

// DELETE /api/calendar/:id
router.delete('/:id', requireAuth, requireRole('owner', 'admin', 'member'), (req, res) => {
  db.prepare('DELETE FROM calendar WHERE id = ? AND org_id = ?').run(req.params.id, req.user.orgId);
  res.json({ ok: true });
});

// DELETE /api/calendar — clear all
router.delete('/', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  db.prepare('DELETE FROM calendar WHERE org_id = ?').run(req.user.orgId);
  res.json({ ok: true });
});

module.exports = router;
