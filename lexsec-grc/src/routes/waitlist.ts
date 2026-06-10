import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateId } from '../lib/crypto'
import type { AppType } from '../types'

export const waitlistRoutes = new Hono<AppType>()

waitlistRoutes.post(
  '/',
  zValidator('json', z.object({
    name:  z.string().min(1).max(120),
    email: z.string().email().max(200),
    org:   z.string().max(200).default(''),
  })),
  async (c) => {
    const { name, email, org } = c.req.valid('json')
    const id = generateId()

    try {
      await c.env.DB.prepare(
        'INSERT INTO waitlist (id, name, email, org) VALUES (?, ?, ?, ?)'
      ).bind(id, name.trim(), email.toLowerCase().trim(), org.trim()).run()
    } catch {
      // UNIQUE constraint — already on the list
      return c.json({ ok: true, alreadyRegistered: true })
    }

    return c.json({ ok: true }, 201)
  }
)
