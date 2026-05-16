const router = require('express').Router();
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/settings
router.get('/', requireAuth, (req, res) => {
  const row = db.prepare('SELECT data FROM branding WHERE org_id = ?').get(req.user.orgId);
  res.json(row ? JSON.parse(row.data) : {});
});

// PUT /api/settings
router.put('/', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const data = JSON.stringify(req.body);
  db.prepare(`
    INSERT INTO branding (org_id, data, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(org_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(req.user.orgId, data);
  res.json({ ok: true });
});

module.exports = router;
