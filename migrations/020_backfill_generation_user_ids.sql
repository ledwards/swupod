-- Migration 020: Backfill user_id in card_generations from source pools/drafts
-- This fixes records created before user_id was being tracked

-- Backfill user_id from sealed pools (source_type = 'sealed')
-- Match on source_share_id to card_pools.share_id
UPDATE card_generations cg
SET user_id = cp.user_id
FROM card_pools cp
WHERE cg.source_type = 'sealed'
  AND cg.source_share_id = cp.share_id
  AND cg.user_id IS NULL
  AND cp.user_id IS NOT NULL;

-- Backfill user_id from draft pods (source_type = 'draft')
-- Use the host_id as the user who generated the cards
UPDATE card_generations cg
SET user_id = dp.host_id
FROM draft_pods dp
WHERE cg.source_type = 'draft'
  AND cg.source_share_id = dp.share_id
  AND cg.user_id IS NULL
  AND dp.host_id IS NOT NULL;
