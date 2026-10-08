-- Add user role columns for admin and beta tester access
-- These are simple boolean flags for role-based access control

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_beta_tester BOOLEAN DEFAULT FALSE;

-- Partial indexes for efficient querying of users with specific roles
CREATE INDEX IF NOT EXISTS idx_users_is_beta_tester ON users(is_beta_tester) WHERE is_beta_tester = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
