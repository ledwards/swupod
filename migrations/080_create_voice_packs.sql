-- Creator voice packs: admin-minted creator links → creator upload → /redeem →
-- per-pod selection.
--
-- Four tables, one flow:
--   voice_pack_invites      an admin mints an unguessable single-use token; the
--                           creator page at /creator/voice-pack/<token> is the ONLY
--                           way to author a pack. Consumed atomically on submit.
--   voice_packs             one authored pack: a normalized redemption `code`, a
--                           display name, and the logo bytes shown on the /redeem
--                           confirmation.
--   voice_pack_assets       the 7 clip slots. clip_type is CHECK-constrained to the
--                           exact ids the cue engine plays — a typo'd slot fails at
--                           write time instead of silently never firing.
--   voice_pack_entitlements per-account unlock. Mirrors promo_entitlements (078):
--                           the claim endpoint INSERTs with ON CONFLICT DO NOTHING so
--                           re-redeeming a code is an idempotent no-op, and grants are
--                           PERMANENT (no revoke path, only ON DELETE CASCADE on the
--                           user so rows vanish with the account).
--
-- Bytes live in Postgres as bytea deliberately: clips are 1–3 seconds and capped at
-- 1 MB server-side, logos at 2 MB. No object storage is involved. They are served by
-- /api/voice-packs/[id]/asset/[clip] with immutable cache headers, so each byte is
-- read at most once per client.
--
-- Pod selection is NOT stored here — the chosen pack is `voicePackId` inside the
-- existing pods.settings JSONB, written by /api/voice-packs/pod/[shareId].

CREATE TABLE IF NOT EXISTS voice_pack_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 32-char base64url random (see app/api/admin/voice-pack-invites). Unguessable and
  -- the sole entry point to the creator form — nothing links to it.
  token TEXT NOT NULL UNIQUE,
  -- Admin who minted the link. SET NULL so removing an admin never deletes history.
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Free-text admin note ("Ahsoka's channel") so a list of tokens is legible.
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Single-use: set atomically by the submit route (UPDATE ... WHERE used_at IS NULL).
  used_at TIMESTAMPTZ,
  -- The creator need not have an account, so this stays nullable.
  used_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_pack_invites_created_by
  ON voice_pack_invites (created_by);

CREATE TABLE IF NOT EXISTS voice_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized redemption code (trimmed, whitespace-stripped, uppercased by
  -- normalizeVoicePackCode in src/services/voicePacks.ts). UNIQUE is what makes
  -- "that code is taken" a database fact rather than a race-prone precheck.
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  creator_name TEXT,
  -- Logo shown on the /redeem confirmation; clicking it plays the greeting clip.
  logo BYTEA,
  logo_mime TEXT,
  -- 'active' | 'disabled'. Only active packs can be redeemed or served.
  status TEXT NOT NULL DEFAULT 'active',
  invite_id UUID REFERENCES voice_pack_invites(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_pack_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES voice_packs(id) ON DELETE CASCADE,
  clip_type TEXT NOT NULL,
  audio BYTEA NOT NULL,
  audio_mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The 7 cue slots. Must stay identical to VOICE_PACK_CLIP_TYPES in
  -- src/services/voicePacks.ts (asserted by src/services/voicePacks.test.ts).
  CONSTRAINT voice_pack_assets_clip_type_check CHECK (
    clip_type IN (
      'greeting',
      'ready-the-draft',
      'start-the-draft',
      'count-30',
      'count-15',
      'count-5',
      'time-is-up'
    )
  ),
  CONSTRAINT voice_pack_assets_pack_clip_unique UNIQUE (pack_id, clip_type)
);

CREATE INDEX IF NOT EXISTS idx_voice_pack_assets_pack
  ON voice_pack_assets (pack_id);

CREATE TABLE IF NOT EXISTS voice_pack_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES voice_packs(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_pack_entitlements_user_pack_unique UNIQUE (user_id, pack_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_pack_entitlements_user
  ON voice_pack_entitlements (user_id);
