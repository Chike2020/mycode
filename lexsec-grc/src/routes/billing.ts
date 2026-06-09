import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import Stripe from 'stripe'
import { requireAuth } from '../middleware/auth'
import type { AppType, Organization } from '../types'

export const billingRoutes = new Hono<AppType>()

billingRoutes.use('*', requireAuth)

const PLANS = {
  free:       { name: 'Free',       price: 0,    users: 3,   features: ['1 org', '3 users', 'Basic GRC dashboard'] },
  pro:        { name: 'Pro',        price: 299,  users: -1,  features: ['Unlimited users', 'Full GRC suite', 'vCISO tools', 'Evidence automation', 'API access', 'Priority support'] },
  enterprise: { name: 'Enterprise', price: null, users: -1,  features: ['Everything in Pro', 'Custom integrations', 'SSO/SAML', 'Dedicated CSM', 'SLA', 'On-premise option'] },
}

billingRoutes.get('/plans', (c) => c.json(PLANS))

billingRoutes.get('/subscription', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const org = await c.env.DB.prepare(
    'SELECT plan, plan_status, stripe_subscription_id, trial_ends_at FROM organizations WHERE id = ?'
  ).bind(orgId).first()
  return c.json(org)
})

billingRoutes.post(
  '/checkout',
  zValidator('json', z.object({ plan: z.enum(['pro', 'enterprise']) })),
  async (c) => {
    const orgId  = c.get('orgId')
    const userId = c.get('userId')
    if (!orgId) return c.json({ error: 'No organization context' }, 400)

    const { plan } = c.req.valid('json')
    const priceId  = plan === 'pro' ? c.env.STRIPE_PRICE_PRO_MONTHLY : c.env.STRIPE_PRICE_ENTERPRISE_MONTHLY
    if (!priceId) return c.json({ error: 'Stripe price not configured' }, 500)

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY)
    const org    = await c.env.DB.prepare('SELECT name, stripe_customer_id FROM organizations WHERE id = ?')
      .bind(orgId).first<Pick<Organization, 'name' | 'stripe_customer_id'>>()

    let customerId = org?.stripe_customer_id
    if (!customerId) {
      const user = await c.env.DB.prepare('SELECT email, full_name FROM users WHERE id = ?')
        .bind(userId).first<{ email: string; full_name: string }>()

      const customer = await stripe.customers.create({
        email: user?.email,
        name:  org?.name,
        metadata: { org_id: orgId },
      })
      customerId = customer.id
      await c.env.DB.prepare('UPDATE organizations SET stripe_customer_id = ? WHERE id = ?')
        .bind(customerId, orgId).run()
    }

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: priceId, quantity: 1 }],
      success_url: `${c.env.FRONTEND_URL}/app.html#billing?success=true`,
      cancel_url:  `${c.env.FRONTEND_URL}/app.html#billing`,
      metadata:    { org_id: orgId },
      subscription_data: { trial_period_days: 14, metadata: { org_id: orgId } },
    })

    return c.json({ url: session.url })
  }
)

billingRoutes.post('/portal', async (c) => {
  const orgId = c.get('orgId')
  if (!orgId) return c.json({ error: 'No organization context' }, 400)

  const org = await c.env.DB.prepare('SELECT stripe_customer_id FROM organizations WHERE id = ?')
    .bind(orgId).first<Pick<Organization, 'stripe_customer_id'>>()
  if (!org?.stripe_customer_id) return c.json({ error: 'No billing account found' }, 404)

  const stripe  = new Stripe(c.env.STRIPE_SECRET_KEY)
  const session = await stripe.billingPortal.sessions.create({
    customer:   org.stripe_customer_id,
    return_url: `${c.env.FRONTEND_URL}/app.html#billing`,
  })
  return c.json({ url: session.url })
})
