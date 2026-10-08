-- Add auth_version for JWT privilege-freshness checks (U4, foundations hardening).
-- The version is baked into every JWT at sign-in; privileged gates
-- (requireAdmin / requireBetaAccess) compare the token claim to this column
-- and reject stale tokens. Grant/revoke paths increment it, so privilege
-- changes take effect immediately instead of after 30-day token expiry.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;
