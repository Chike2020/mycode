const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const { v4: uuid } = require('uuid');
const db      = require('../db/database');
const { signToken, requireAuth } = require('../middleware/auth');

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, orgName } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash   = await bcrypt.hash(password, 12);
  const userId = uuid();
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(userId, email.toLowerCase(), name, hash);

  // Create a default org for this user
  const org = _createOrg(orgName || `${name}'s Organisation`, userId);

  const token = signToken({ id: userId, email: email.toLowerCase(), name, orgId: org.id, role: 'owner' });
  res.cookie('grc_token', token, COOKIE_OPTS).json({ ok: true, user: { id: userId, email, name }, org });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  // Get first org membership
  const membership = db.prepare(`
    SELECT om.org_id, om.role, o.name as org_name
    FROM org_members om JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = ?
    ORDER BY om.joined_at ASC LIMIT 1
  `).get(user.id);

  const orgId   = membership?.org_id || null;
  const orgName = membership?.org_name || '';
  const role    = membership?.role || 'member';

  const token = signToken({ id: user.id, email: user.email, name: user.name, orgId, role });
  res.cookie('grc_token', token, COOKIE_OPTS).json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    org: orgId ? { id: orgId, name: orgName } : null,
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('grc_token').json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const orgs = db.prepare(`
    SELECT o.id, o.name, o.plan, om.role
    FROM org_members om JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = ?
    ORDER BY om.joined_at ASC
  `).all(user.id);

  res.json({ user, orgs, currentOrgId: req.user.orgId, currentRole: req.user.role });
});

// POST /api/auth/switch-org
router.post('/switch-org', requireAuth, (req, res) => {
  const { orgId } = req.body;
  const membership = db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').get(orgId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Not a member of that organisation' });

  const org = db.prepare('SELECT id, name FROM organizations WHERE id = ?').get(orgId);
  const token = signToken({ id: req.user.id, email: req.user.email, name: req.user.name, orgId, role: membership.role });
  res.cookie('grc_token', token, COOKIE_OPTS).json({ ok: true, org });
});

// PATCH /api/auth/me — update name or password
router.patch('/me', requireAuth, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (name) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
  }
  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'currentPassword required' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password too short' });
    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  }
  res.json({ ok: true });
});

function _createOrg(name, ownerId) {
  const orgId = uuid();
  const slug  = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + orgId.slice(0, 6);
  db.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)').run(orgId, name, slug);
  db.prepare('INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)').run(orgId, ownerId, 'owner');
  return { id: orgId, name, slug };
}

module.exports = router;
