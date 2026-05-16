const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db/database');
const { requireAuth, requireRole, signToken } = require('../middleware/auth');

const COOKIE_OPTS = {
  httpOnly: true, sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
};

// GET /api/org — current org details
router.get('/', requireAuth, (req, res) => {
  if (!req.user.orgId) return res.status(404).json({ error: 'No organisation selected' });
  const org = db.prepare('SELECT id, name, slug, plan, created_at FROM organizations WHERE id = ?').get(req.user.orgId);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });
  res.json(org);
});

// POST /api/org — create new org
router.post('/', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const orgId = uuid();
  const slug  = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + orgId.slice(0, 6);
  db.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)').run(orgId, name.trim(), slug);
  db.prepare('INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)').run(orgId, req.user.id, 'owner');

  // Issue new token with this org
  const token = signToken({ id: req.user.id, email: req.user.email, name: req.user.name, orgId, role: 'owner' });
  res.cookie('grc_token', token, COOKIE_OPTS).json({ id: orgId, name, slug, plan: 'free' });
});

// PATCH /api/org — update name
router.patch('/', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  db.prepare('UPDATE organizations SET name = ? WHERE id = ?').run(name.trim(), req.user.orgId);
  res.json({ ok: true });
});

// GET /api/org/members
router.get('/members', requireAuth, (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.email, u.name, u.created_at, om.role, om.joined_at
    FROM org_members om JOIN users u ON u.id = om.user_id
    WHERE om.org_id = ?
    ORDER BY om.joined_at ASC
  `).all(req.user.orgId);
  res.json(members);
});

// PATCH /api/org/members/:userId — change role
router.patch('/members/:userId', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const { role } = req.body;
  const validRoles = ['owner', 'admin', 'member', 'viewer'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const m = db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').get(req.user.orgId, req.params.userId);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  // Cannot demote the only owner
  if (m.role === 'owner' && role !== 'owner') {
    const owners = db.prepare("SELECT COUNT(*) as c FROM org_members WHERE org_id = ? AND role = 'owner'").get(req.user.orgId);
    if (owners.c <= 1) return res.status(400).json({ error: 'Cannot remove the only owner' });
  }
  db.prepare('UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?').run(role, req.user.orgId, req.params.userId);
  res.json({ ok: true });
});

// DELETE /api/org/members/:userId — remove member
router.delete('/members/:userId', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' });
  db.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?').run(req.user.orgId, req.params.userId);
  res.json({ ok: true });
});

// POST /api/org/invite — invite by email
router.post('/invite', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const { email, role = 'member' } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  // If user already exists, add them directly
  const targetUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (targetUser) {
    const existing = db.prepare('SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?').get(req.user.orgId, targetUser.id);
    if (existing) return res.status(409).json({ error: 'User is already a member' });
    db.prepare('INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)').run(req.user.orgId, targetUser.id, role);
    return res.json({ ok: true, added: true });
  }

  // Create invitation token
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const token = uuid();
  const invId = uuid();
  db.prepare('INSERT INTO invitations (id, org_id, email, role, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(invId, req.user.orgId, email.toLowerCase(), role, token, req.user.id, expires);

  const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(req.user.orgId);
  res.json({ ok: true, invited: true, token, inviteLink: `/register?invite=${token}`, orgName: org?.name });
});

// GET /api/org/invite/:token — validate invite token
router.get('/invite/:token', (req, res) => {
  const inv = db.prepare('SELECT * FROM invitations WHERE token = ?').get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invalid invitation' });
  if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: 'Invitation expired' });
  const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(inv.org_id);
  res.json({ email: inv.email, role: inv.role, orgName: org?.name, orgId: inv.org_id });
});

// PUT /api/org/apikey — set Anthropic API key
router.put('/apikey', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const { key } = req.body;
  db.prepare('UPDATE organizations SET anthropic_key = ? WHERE id = ?').run(key || null, req.user.orgId);
  res.json({ ok: true, hasKey: !!key });
});

// GET /api/org/apikey — check if key is set (never expose key)
router.get('/apikey', requireAuth, (req, res) => {
  const org = db.prepare('SELECT anthropic_key FROM organizations WHERE id = ?').get(req.user.orgId);
  res.json({ hasKey: !!org?.anthropic_key });
});

module.exports = router;
