import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import type { AppType } from '../types'

export const billingRoutes = new Hono<AppType>()

billingRoutes.use('*', requireAuth)

const PLANS = {
  free: {
    name: 'Advisory GRC',
    price: 0,
    features: ['Risk register', 'SOC 2 · ISO 27001 · NIST CSF · HIPAA', 'Evidence upload', 'Incidents, assets, calendar', 'Up to 2 users'],
  },
  pro: {
    name: 'VeriLink Pro',
    price: null,
    features: ['Everything in free', 'AI translation engine', 'Cloud connectors (AWS, Azure, GitHub)', 'TPRM vendor management', 'AI policy generation', 'Board-ready reports', 'AI RMF & SP 800-53', 'Unlimited users'],
  },
}

billingRoutes.get('/plans', (c) => c.json(PLANS))

billingRoutes.get('/subscription', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const org = await c.env.DB.prepare(
    'SELECT plan, plan_status FROM organizations WHERE id = ?'
  ).bind(orgId).first()
  return c.json(org ?? { plan: 'free', plan_status: 'active' })
})
