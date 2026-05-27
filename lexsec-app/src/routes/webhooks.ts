import { Hono } from 'hono'
import Stripe from 'stripe'
import type { AppType } from '../types'

export const webhookRoutes = new Hono<AppType>()

webhookRoutes.post('/stripe', async (c) => {
  const body = await c.req.text()
  const sig  = c.req.header('stripe-signature')
  if (!sig) return c.json({ error: 'Missing stripe-signature header' }, 400)

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY)
  let event: Stripe.Event

  try {
    // constructEventAsync uses Web Crypto — required for Cloudflare Workers
    event = await stripe.webhooks.constructEventAsync(body, sig, c.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return c.json({ error: 'Webhook signature verification failed' }, 400)
  }

  const obj     = event.data.object as unknown as Record<string, unknown>
  const orgId   = (obj.metadata as Record<string, string> | undefined)?.org_id
  const subId   = (obj as { id?: string }).id

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = obj as unknown as Stripe.Checkout.Session
      if (session.subscription && orgId) {
        await c.env.DB.prepare(
          'UPDATE organizations SET stripe_subscription_id = ?, plan = ?, plan_status = ? WHERE id = ?'
        ).bind(String(session.subscription), 'pro', 'active', orgId).run()
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub  = obj as unknown as Stripe.Subscription
      const plan = (sub.items.data[0]?.price?.metadata?.plan as string | undefined) ?? 'pro'
      await c.env.DB.prepare(
        'UPDATE organizations SET plan = ?, plan_status = ? WHERE stripe_subscription_id = ?'
      ).bind(plan, sub.status, sub.id).run()
      break
    }

    case 'customer.subscription.deleted': {
      await c.env.DB.prepare(
        "UPDATE organizations SET plan = 'free', plan_status = 'canceled', stripe_subscription_id = NULL WHERE stripe_subscription_id = ?"
      ).bind(subId).run()
      break
    }

    case 'invoice.payment_failed': {
      const invoice = obj as unknown as Stripe.Invoice
      if (invoice.subscription) {
        await c.env.DB.prepare(
          "UPDATE organizations SET plan_status = 'past_due' WHERE stripe_subscription_id = ?"
        ).bind(String(invoice.subscription)).run()
      }
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = obj as unknown as Stripe.Invoice
      if (invoice.subscription) {
        await c.env.DB.prepare(
          "UPDATE organizations SET plan_status = 'active' WHERE stripe_subscription_id = ?"
        ).bind(String(invoice.subscription)).run()
      }
      break
    }
  }

  return c.json({ received: true })
})
