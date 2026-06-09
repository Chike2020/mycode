import { Hono } from 'hono'
import type { AppType } from '../types'

export const webhookRoutes = new Hono<AppType>()

// Stripe webhooks removed — billing is contact-us model, no self-serve checkout
webhookRoutes.post('/stripe', (c) => c.json({ received: true }))
