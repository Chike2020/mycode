ALTER TABLE users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_platform_admin ON users(is_platform_admin) WHERE is_platform_admin = 1;
