import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes }     from './routes/auth'
import { orgRoutes }      from './routes/orgs'
import { billingRoutes }  from './routes/billing'
import { webhookRoutes }  from './routes/webhooks'
import { evidenceRoutes } from './routes/evidence'
import { riskRoutes }     from './routes/risks'
import { vendorRoutes }   from './routes/vendors'
import { calendarRoutes } from './routes/calendar'
import { snapshotRoutes } from './routes/snapshots'
import { auditRoutes }    from './routes/audit'
import { scoreRoutes }    from './routes/score'
import { policyRoutes }   from './routes/policies'
import { incidentRoutes } from './routes/incidents'
import { assetRoutes }    from './routes/assets'
import { controlRoutes }  from './routes/controls'
import type { AppType } from './types'

const app = new Hono<AppType>()

// Logging
app.use('*', logger())

// CORS — allow the frontend domain with credentials
app.use('/api/*', cors({
  origin: (origin, c) => {
    const allowed = [
      c.env.FRONTEND_URL,
      'https://lexsecadvisory.com',
      'https://app.lexsecadvisory.com',
    ]
    return allowed.includes(origin) ? origin : ''
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

// Health check
app.get('/health', (c) => c.json({ ok: true, env: c.env.FRONTEND_URL }))

// Routes
app.route('/api/auth',      authRoutes)
app.route('/api/orgs',      orgRoutes)
app.route('/api/billing',   billingRoutes)
app.route('/webhooks',      webhookRoutes)
app.route('/api/evidence',  evidenceRoutes)
app.route('/api/risks',     riskRoutes)
app.route('/api/vendors',   vendorRoutes)
app.route('/api/calendar',  calendarRoutes)
app.route('/api/snapshots', snapshotRoutes)
app.route('/api/audit',     auditRoutes)
app.route('/api/score',     scoreRoutes)
app.route('/api/policies',  policyRoutes)
app.route('/api/incidents', incidentRoutes)
app.route('/api/assets',    assetRoutes)
app.route('/api/controls',  controlRoutes)

// Serve frontend assets for all non-API routes
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

// 404 / error handlers
app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error('[error]', err.message)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
