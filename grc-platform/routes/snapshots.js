const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/snapshots
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM snapshots WHERE org_id = ? ORDER BY timestamp DESC').all(req.user.orgId);
  res.json(rows.map(r => ({
    id: r.id, label: r.label, auto: !!r.auto,
    scores: JSON.parse(r.scores || '{}'),
    timestamp: r.timestamp, createdBy: r.created_by,
  })));
});

// POST /api/snapshots
router.post('/', requireAuth, (req, res) => {
  const { label, scores, auto } = req.body;
  const id = 'snap_' + uuid();
  db.prepare('INSERT INTO snapshots (id, org_id, label, auto, scores, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.user.orgId, label || 'Snapshot', auto ? 1 : 0, JSON.stringify(scores || {}), req.user.id);
  res.json({ ok: true, id, timestamp: new Date().toISOString() });
});

// DELETE /api/snapshots/all
router.delete('/all', requireAuth, (req, res) => {
  db.prepare('DELETE FROM snapshots WHERE org_id = ?').run(req.user.orgId);
  res.json({ ok: true });
});

// DELETE /api/snapshots/:id
router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM snapshots WHERE id = ? AND org_id = ?').run(req.params.id, req.user.orgId);
  res.json({ ok: true });
});

module.exports = router;
