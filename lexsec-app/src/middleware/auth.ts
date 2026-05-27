import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyJWT } from '../lib/crypto'
import type { AppType } from '../types'

type C = Context<AppType>

export async function requireAuth(c: C, next: Next): Promise<Response | void> {
  const token = getCookie(c, 'session') ?? bearerToken(c)
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const payload = await verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Invalid or expired session' }, 401)

  c.set('userId', payload.sub as string)
  c.set('orgId', payload.orgId as string | undefined)
  c.set('role', payload.role as string | undefined)
  await next()
}

export async function requireOrgAccess(c: C, next: Next): Promise<Response | void> {
  await requireAuth(c, async () => {})
  if (!c.get('orgId')) return c.json({ error: 'No organization context' }, 400)
  await next()
}

export function requireRole(...allowed: string[]) {
  return async (c: C, next: Next): Promise<Response | void> => {
    const role = c.get('role')
    if (!role || !allowed.includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
    await next()
  }
}

function bearerToken(c: C): string | undefined {
  const auth = c.req.header('Authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : undefined
}
