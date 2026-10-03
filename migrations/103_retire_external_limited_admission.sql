-- Cancel unclaimed availability only. Never infer results or close active games.
UPDATE ptp_play_queue_entries SET status='cancelled',cancelled_at=COALESCE(cancelled_at,NOW()),updated_at=NOW() WHERE status='queued';
UPDATE open_games og SET status='cancelled',resolved_at=COALESCE(resolved_at,NOW()),updated_at=NOW()
WHERE status='open' AND NOT EXISTS (
  SELECT 1 FROM open_game_lobby_attempts a WHERE a.open_game_id=og.id AND a.status IN ('creating','lobby_ready','joined','in_progress')
);
-- Pre-created external lobbies remain reachable by their existing players,
-- but are no longer advertised for new matchmaking.
UPDATE open_games SET visibility='private',updated_at=NOW() WHERE status='open' AND visibility='public';
