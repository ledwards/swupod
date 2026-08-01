-- Store per-seat Forceteki launch data returned by the runtime adapter.

ALTER TABLE ptp_play_seats
  ADD COLUMN IF NOT EXISTS launch_url TEXT,
  ADD COLUMN IF NOT EXISTS runtime_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ptp_play_seats_runtime_user
  ON ptp_play_seats(runtime_user_id)
  WHERE runtime_user_id IS NOT NULL;
