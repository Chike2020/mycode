export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  ASSETS: Fetcher
  JWT_SECRET: string
  RESEND_API_KEY: string
  FRONTEND_URL: string
}

export type Variables = {
  userId: string
  orgId: string | undefined
  role: string | undefined
}

export type AppType = { Bindings: Env; Variables: Variables }

export type User = {
  id: string
  email: string
  full_name: string
  created_at: string
}

export type Organization = {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro'
  plan_status: 'active' | 'canceled'
  created_at: string
}

export type OrgMember = {
  org_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

export type Invitation = {
  id: string
  org_id: string
  email: string
  role: 'admin' | 'member'
  token: string
  invited_by: string
  accepted_at: string | null
  expires_at: string
  created_at: string
}
