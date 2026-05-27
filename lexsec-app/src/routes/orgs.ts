import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateId, generateToken } from '../lib/crypto'
import { sendInviteEmail } from '../lib/email'
import { requireAuth } from '../middleware/auth'
import type { AppType, OrgMember } from '../types'

export const orgRoutes = new Hono<AppType>()

orgRoutes.use('*', requireAuth)

// List orgs the current user belongs to
orgRoutes.get('/', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT o.id, o.name, o.slug, o.plan, o.plan_status, m.role
    FROM organizations o
    JOIN org_members m ON m.org_id = o.id
    WHERE m.user_id = ?
    ORDER BY m.joined_at
  `).bind(c.get('userId')).all()
  return c.json(result.results)
})

// Get org detail (must be a member)
orgRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()
  if (!(await isMember(c.env.DB, id, c.get('userId')))) return c.json({ error: 'Not found' }, 404)

  const org = await c.env.DB.prepare(
    'SELECT id, name, slug, plan, plan_status, trial_ends_at, created_at FROM organizations WHERE id = ?'
  ).bind(id).first()
  return c.json(org)
})

// List members
orgRoutes.get('/:id/members', async (c) => {
  const { id } = c.req.param()
  if (!(await isMember(c.env.DB, id, c.get('userId')))) return c.json({ error: 'Not found' }, 404)

  const result = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.full_name, m.role, m.joined_at
    FROM users u
    JOIN org_members m ON m.user_id = u.id
    WHERE m.org_id = ?
    ORDER BY m.joined_at
  `).bind(id).all()
  return c.json(result.results)
})

// List pending invitations (admin+)
orgRoutes.get('/:id/invitations', async (c) => {
  const { id } = c.req.param()
  const m = await getMembership(c.env.DB, id, c.get('userId'))
  if (!m || !isAdmin(m.role)) return c.json({ error: 'Forbidden' }, 403)

  const result = await c.env.DB.prepare(`
    SELECT i.id, i.email, i.role, i.created_at, i.expires_at, u.full_name AS invited_by_name
    FROM invitations i
    JOIN users u ON u.id = i.invited_by
    WHERE i.org_id = ? AND i.accepted_at IS NULL AND i.expires_at > datetime('now')
    ORDER BY i.created_at DESC
  `).bind(id).all()
  return c.json(result.results)
})

// Send invite
orgRoutes.post(
  '/:id/invite',
  zValidator('json', z.object({
    email: z.string().email(),
    role:  z.enum(['admin', 'member']).default('member'),
  })),
  async (c) => {
    const { id } = c.req.param()
    const { email, role } = c.req.valid('json')
    const actorId = c.get('userId')

    const m = await getMembership(c.env.DB, id, actorId)
    if (!m || !isAdmin(m.role)) return c.json({ error: 'Forbidden' }, 403)

    const token     = generateToken(24)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await c.env.DB.prepare(
      'INSERT INTO invitations (id, org_id, email, role, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(generateId(), id, email.toLowerCase(), role, token, actorId, expiresAt).run()

    const inviteUrl = `${c.env.FRONTEND_URL}/accept-invite.html?token=${token}`

    // Fetch inviter name + org name for the email
    const [inviter, org] = await Promise.all([
      c.env.DB.prepare('SELECT full_name FROM users WHERE id = ?').bind(actorId).first<{ full_name: string }>(),
      c.env.DB.prepare('SELECT name FROM organizations WHERE id = ?').bind(id).first<{ name: string }>(),
    ])

    // Fire-and-forget — don't fail the request if email delivery fails
    if (c.env.RESEND_API_KEY) {
      c.executionCtx.waitUntil(
        sendInviteEmail(c.env.RESEND_API_KEY, email, inviter?.full_name ?? 'Someone', org?.name ?? 'your organization', inviteUrl)
          .catch(err => console.error('[invite email]', err))
      )
    }

    return c.json({ invite_url: inviteUrl }, 201)
  }
)

// Accept invite (must already be logged in)
orgRoutes.post(
  '/accept-invite',
  zValidator('json', z.object({ token: z.string() })),
  async (c) => {
    const userId = c.get('userId')
    const { token } = c.req.valid('json')

    const invite = await c.env.DB.prepare(
      "SELECT id, org_id, role FROM invitations WHERE token = ? AND accepted_at IS NULL AND expires_at > datetime('now')"
    ).bind(token).first<{ id: string; org_id: string; role: string }>()
    if (!invite) return c.json({ error: 'Invalid or expired invitation' }, 400)

    const existing = await c.env.DB.prepare('SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?')
      .bind(invite.org_id, userId).first()
    if (existing) return c.json({ error: 'Already a member of this organization' }, 409)

    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)')
        .bind(invite.org_id, userId, invite.role),
      c.env.DB.prepare("UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?")
        .bind(invite.id),
    ])

    return c.json({ org_id: invite.org_id, role: invite.role })
  }
)

// Remove member (admin+ only, can't remove owner, can't remove self)
orgRoutes.delete('/:id/members/:userId', async (c) => {
  const { id, userId: targetId } = c.req.param()
  const actorId = c.get('userId')

  if (actorId === targetId) return c.json({ error: 'Cannot remove yourself' }, 400)

  const actor = await getMembership(c.env.DB, id, actorId)
  if (!actor || !isAdmin(actor.role)) return c.json({ error: 'Forbidden' }, 403)

  const target = await getMembership(c.env.DB, id, targetId)
  if (!target) return c.json({ error: 'Member not found' }, 404)
  if (target.role === 'owner') return c.json({ error: 'Cannot remove the org owner' }, 400)

  await c.env.DB.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?').bind(id, targetId).run()
  return c.json({ ok: true })
})

// helpers
async function getMembership(db: D1Database, orgId: string, userId: string) {
  return db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?')
    .bind(orgId, userId).first<Pick<OrgMember, 'role'>>()
}
async function isMember(db: D1Database, orgId: string, userId: string) {
  return !!(await getMembership(db, orgId, userId))
}
function isAdmin(role: string) {
  return role === 'admin' || role === 'owner'
}
