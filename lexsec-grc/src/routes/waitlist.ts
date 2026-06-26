import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateId } from '../lib/crypto'
import { sendWaitlistConfirmationEmail, sendWaitlistAdminNotification } from '../lib/email'
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
    const cleanEmail = email.toLowerCase().trim()
    const cleanName  = name.trim()
    const cleanOrg   = org.trim()
    const id = generateId()

    try {
      await c.env.DB.prepare(
        'INSERT INTO waitlist (id, name, email, org) VALUES (?, ?, ?, ?)'
      ).bind(id, cleanName, cleanEmail, cleanOrg).run()
    } catch {
      // UNIQUE constraint — already on the list
      return c.json({ ok: true, alreadyRegistered: true })
    }

    if (c.env.RESEND_API_KEY) {
      c.executionCtx.waitUntil(
        Promise.all([
          sendWaitlistConfirmationEmail(c.env.RESEND_API_KEY, cleanEmail, cleanName).catch(() => {}),
          sendWaitlistAdminNotification(c.env.RESEND_API_KEY, cleanName, cleanEmail, cleanOrg).catch(() => {}),
        ])
      )
    }

    return c.json({ ok: true }, 201)
  }
)
