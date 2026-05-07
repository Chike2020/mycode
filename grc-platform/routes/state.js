const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/state
router.get('/', requireAuth, (req, res) => {
  const row = db.prepare('SELECT data FROM grc_state WHERE org_id = ?').get(req.user.orgId);
  res.json(row ? JSON.parse(row.data) : { answers: {}, notes: {}, active: null });
});

// PUT /api/state
router.put('/', requireAuth, (req, res) => {
  const data = JSON.stringify(req.body);
  db.prepare(`
    INSERT INTO grc_state (org_id, data, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(org_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(req.user.orgId, data);
  res.json({ ok: true });
});

module.exports = router;
