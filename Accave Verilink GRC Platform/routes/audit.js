const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/audit
router.get('/', requireAuth, (req, res) => {
  const { limit = 500, offset = 0, type, search } = req.query;
  let sql = 'SELECT * FROM audit_log WHERE org_id = ?';
  const params = [req.user.orgId];
  if (type && type !== 'all') { sql += ' AND type = ?'; params.push(type); }
  if (search) { sql += ' AND (target LIKE ? OR detail LIKE ? OR actor LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// POST /api/audit
router.post('/', requireAuth, (req, res) => {
  const { type, target, detail, actor } = req.body;
  const id = 'al_' + uuid();
  db.prepare('INSERT INTO audit_log (id, org_id, user_id, actor, type, target, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user.orgId, req.user.id, actor || req.user.name, type || 'system', target || '', detail || '');
  res.json({ ok: true, id });
});

// DELETE /api/audit/old — prune entries older than 12 months
router.delete('/old', requireAuth, (req, res) => {
  db.prepare("DELETE FROM audit_log WHERE org_id = ? AND timestamp < datetime('now', '-12 months')").run(req.user.orgId);
  res.json({ ok: true });
});

// GET /api/audit/export — CSV export
router.get('/export', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log WHERE org_id = ? ORDER BY timestamp DESC').all(req.user.orgId);
  const headers = 'Timestamp,Actor,Type,Target,Detail\n';
  const csv = rows.map(r => [r.timestamp, r.actor, r.type, r.target, r.detail]
    .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
    .join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(headers + csv);
});

module.exports = router;
