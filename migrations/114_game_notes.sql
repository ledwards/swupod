-- Private player notes, anchored to immutable runtime command steps (including undo history).
CREATE TABLE IF NOT EXISTS ptp_game_notes (
 id UUID PRIMARY KEY,
 user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 match_id TEXT NOT NULL,
 seat SMALLINT NOT NULL CHECK(seat IN (0,1)),
 step INTEGER NOT NULL CHECK(step BETWEEN 1 AND 20001),
 entry_index INTEGER NOT NULL CHECK(entry_index BETWEEN 0 AND 1000),
 note TEXT NOT NULL CHECK(length(note) BETWEEN 1 AND 2000),
 engine_revision TEXT NOT NULL,
 snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ptp_game_notes_cursor ON ptp_game_notes(created_at,id);
CREATE INDEX IF NOT EXISTS ptp_game_notes_match ON ptp_game_notes(match_id,step);
