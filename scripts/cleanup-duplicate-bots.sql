-- Cleanup script for duplicate bot users
-- Run this locally to remove duplicate bot users created before the fix
-- Usage: psql $DATABASE_URL -f scripts/cleanup-duplicate-bots.sql

-- First, show how many duplicates exist
SELECT 'Before cleanup:' as status;
SELECT username, COUNT(*) as count
FROM users
WHERE discord_id LIKE 'bot_%'
GROUP BY username
ORDER BY username;

-- Delete bot users with timestamp-based discord_ids (old format: bot_N_TIMESTAMP_N)
-- Keep only the ones with stable discord_ids (new format: bot_alpha, bot_beta, etc.)
-- Note: This will fail if there are FK constraints from draft_pod_players

-- First, reassign any draft_pod_players from duplicate bots to the canonical bot
-- For each bot name, find the canonical user (stable discord_id) and update references

-- Create temporary mapping of old bot user IDs to new canonical bot user IDs
WITH canonical_bots AS (
  SELECT id, username
  FROM users
  WHERE discord_id IN ('bot_alpha', 'bot_beta', 'bot_gamma', 'bot_delta',
                       'bot_epsilon', 'bot_zeta', 'bot_eta', 'bot_theta')
),
duplicate_bots AS (
  SELECT id, username
  FROM users
  WHERE discord_id LIKE 'bot_%'
    AND discord_id NOT IN ('bot_alpha', 'bot_beta', 'bot_gamma', 'bot_delta',
                           'bot_epsilon', 'bot_zeta', 'bot_eta', 'bot_theta')
)
UPDATE draft_pod_players dpp
SET user_id = cb.id
FROM duplicate_bots db
JOIN canonical_bots cb ON cb.username = db.username
WHERE dpp.user_id = db.id
  AND dpp.is_bot = true;

-- Now delete the duplicate bot users
DELETE FROM users
WHERE discord_id LIKE 'bot_%'
  AND discord_id NOT IN ('bot_alpha', 'bot_beta', 'bot_gamma', 'bot_delta',
                         'bot_epsilon', 'bot_zeta', 'bot_eta', 'bot_theta');

-- Show results
SELECT 'After cleanup:' as status;
SELECT username, discord_id, id
FROM users
WHERE discord_id LIKE 'bot_%'
ORDER BY username;

SELECT 'Bot users remaining: ' || COUNT(*) as result FROM users WHERE discord_id LIKE 'bot_%';
