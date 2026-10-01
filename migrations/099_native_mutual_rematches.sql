CREATE TABLE IF NOT EXISTS ptp_native_rematches (
  parent_match_id UUID PRIMARY KEY REFERENCES ptp_native_matches(id),
  new_match_id UUID UNIQUE REFERENCES ptp_native_matches(id),
  player0_consent BOOLEAN NOT NULL DEFAULT FALSE,
  player1_consent BOOLEAN NOT NULL DEFAULT FALSE,
  declined BOOLEAN NOT NULL DEFAULT FALSE
);
