import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { hashPassword, verifyPassword, signJWT, generateId, slugify } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import { sendWelcomeEmail } from '../lib/email'
import type { AppType, User } from '../types'

export const authRoutes = new Hono<AppType>()

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
}

// 10 failed attempts per email or 20 per IP within 15 minutes triggers lockout
async function isRateLimited(db: D1Database, email: string, ip: string): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    db.prepare(
      "SELECT COUNT(*) as c FROM login_attempts WHERE email = ? AND success = 0 AND created_at > datetime('now', '-15 minutes')"
    ).bind(email).first<{ c: number }>(),
    db.prepare(
      "SELECT COUNT(*) as c FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > datetime('now', '-15 minutes')"
    ).bind(ip).first<{ c: number }>(),
  ])
  return (byEmail?.c ?? 0) >= 10 || (byIp?.c ?? 0) >= 20
}

async function recordAttempt(db: D1Database, email: string, ip: string, success: boolean) {
  await db.prepare('INSERT INTO login_attempts (id, email, ip, success) VALUES (?, ?, ?, ?)')
    .bind(generateId(), email, ip, success ? 1 : 0).run()
}

async function pruneOldAttempts(db: D1Database) {
  // Keep the table small — delete entries older than 1 hour
  await db.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 hour')").run()
}

authRoutes.post(
  '/register',
  zValidator('json', z.object({
    email:    z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    full_name: z.string().min(1),
    org_name:  z.string().min(1),
  })),
  async (c) => {
    const { email, password, full_name, org_name } = c.req.valid('json')

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email.toLowerCase()).first()
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const userId = generateId()
    const orgId  = generateId()
    const passwordHash = await hashPassword(password)

    // Ensure unique slug
    const base = slugify(org_name)
    let slug = base
    for (let i = 1; await c.env.DB.prepare('SELECT id FROM organizations WHERE slug = ?').bind(slug).first(); i++) {
      slug = `${base}-${i}`
    }

    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)')
        .bind(userId, email.toLowerCase(), passwordHash, full_name),
      c.env.DB.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)')
        .bind(orgId, org_name, slug),
      c.env.DB.prepare('INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)')
        .bind(orgId, userId, 'owner'),
    ])

    const token = await signJWT({ sub: userId, orgId, role: 'owner' }, c.env.JWT_SECRET)
    setCookie(c, 'session', token, COOKIE_OPTS)

    if (c.env.RESEND_API_KEY) {
      c.executionCtx.waitUntil(
        sendWelcomeEmail(c.env.RESEND_API_KEY, email.toLowerCase(), full_name).catch(() => {})
      )
    }

    return c.json({
      user: { id: userId, email: email.toLowerCase(), full_name },
      org:  { id: orgId, name: org_name, slug },
    }, 201)
  }
)

authRoutes.post(
  '/login',
  zValidator('json', z.object({
    email:    z.string().email(),
    password: z.string(),
  })),
  async (c) => {
    const { email, password } = c.req.valid('json')
    const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown'
    const lowerEmail = email.toLowerCase()

    // Prune old attempts opportunistically (fire-and-forget)
    c.executionCtx.waitUntil(pruneOldAttempts(c.env.DB))

    if (await isRateLimited(c.env.DB, lowerEmail, ip)) {
      return c.json({ error: 'Too many failed attempts — try again in 15 minutes' }, 429)
    }

    const user = await c.env.DB
      .prepare('SELECT id, email, password_hash, full_name FROM users WHERE email = ?')
      .bind(lowerEmail)
      .first<Pick<User, 'id' | 'email' | 'full_name'> & { password_hash: string }>()

    // Constant-time check — always run verifyPassword to prevent timing attacks
    const valid = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, 'pbkdf2:00:00')

    if (!user || !valid) {
      c.executionCtx.waitUntil(recordAttempt(c.env.DB, lowerEmail, ip, false))
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    // Clear failed attempts on success
    c.executionCtx.waitUntil(
      c.env.DB.prepare('DELETE FROM login_attempts WHERE email = ?').bind(lowerEmail).run()
    )

    const membership = await c.env.DB
      .prepare('SELECT org_id, role FROM org_members WHERE user_id = ? ORDER BY joined_at LIMIT 1')
      .bind(user.id)
      .first<{ org_id: string; role: string }>()

    const token = await signJWT(
      { sub: user.id, orgId: membership?.org_id, role: membership?.role },
      c.env.JWT_SECRET
    )
    setCookie(c, 'session', token, COOKIE_OPTS)

    return c.json({ user: { id: user.id, email: user.email, full_name: user.full_name }, orgId: membership?.org_id })
  }
)

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

authRoutes.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId')

  const user = await c.env.DB
    .prepare('SELECT id, email, full_name, created_at FROM users WHERE id = ?')
    .bind(userId).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  const orgs = await c.env.DB.prepare(`
    SELECT o.id, o.name, o.slug, o.plan, o.plan_status, m.role
    FROM organizations o
    JOIN org_members m ON m.org_id = o.id
    WHERE m.user_id = ?
    ORDER BY m.joined_at
  `).bind(userId).all()

  return c.json({ user, orgs: orgs.results })
})
