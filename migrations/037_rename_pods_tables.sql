-- Rename tables: draft_pods -> pods, draft_pod_players -> pod_players
-- These tables now serve both draft and sealed pods (distinguished by pod_type)

-- Rename tables
ALTER TABLE draft_pods RENAME TO pods;
ALTER TABLE draft_pod_players RENAME TO pod_players;

-- Rename foreign key column in pod_players
ALTER TABLE pod_players RENAME COLUMN draft_pod_id TO pod_id;

-- Rename foreign key column in card_pools
ALTER TABLE card_pools RENAME COLUMN draft_pod_id TO pod_id;
