CREATE TABLE IF NOT EXISTS practice_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES practice_rounds(id) ON DELETE CASCADE,
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  is_bye BOOLEAN NOT NULL DEFAULT false,
  game1_result TEXT,
  game2_result TEXT,
  game3_result TEXT,
  player1_submitted BOOLEAN NOT NULL DEFAULT false,
  player2_submitted BOOLEAN NOT NULL DEFAULT false,
  final_confirmed BOOLEAN NOT NULL DEFAULT false,
  match_winner TEXT,
  wayfinder_match_id TEXT,
  pod_owner_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_matches_round ON practice_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_practice_matches_pod ON practice_matches(pod_id);
CREATE INDEX IF NOT EXISTS idx_practice_matches_players ON practice_matches(player1_id, player2_id);
