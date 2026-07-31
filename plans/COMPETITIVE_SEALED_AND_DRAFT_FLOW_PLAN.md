# Competitive Sealed, Ready Flow + Draft Audio, Creator Voice Packs — Program Plan

Built by subagents in phases; this session is the project manager.

## Status
- ✅ **Phase 1a — Competitive Sealed (8 packs)**: done (pending commit).
- ✅ **Phase 1b — Leader Preview + two-stage start**: done (pending commit).
- ⏳ **Phase 2 — Player Ready flow + audio cue engine**
- ⏳ **Phase 3 — Creator voice packs (admin-minted links, /redeem, pod-level selection)**

## Shipped in Phase 1
1. **Competitive Sealed** — `competitive` on sealed pods (patron-gated create, gold theme),
   8 packs/player vs 6, `deck_lock_at` 20-min build deadline, Swiss practice play via
   widened pool-page gates, max 8 players.
2. **Leader Preview** — host "Ready" deals packs into new `draft_state.phase='leader_preview'`
   (leaders visible around table, `pick_status='waiting'`, `pick_started_at=NULL` — no picking,
   no timers); host-only "Start Draft" → `POST /api/draft/[shareId]/begin-picking` opens
   picking + starts timers.

## Product decisions (2026-07-30, user)
- **Pack count is free for everyone.** A 6 / 8 pack toggle lives on the sealed
  set-selection pages (solo and pod). Not gated.
- **Competitive Sealed stays Friends-of-the-Pod to CREATE, open to JOIN.** It keeps
  8 packs, 8 players, the 20-min deck lock, and Swiss practice rounds. Pack count is
  no longer what distinguishes it — the organized event is.
- **Sealed pods remain account-only.** No guest seats. Anonymous users are served by
  solo sealed (`/pools/new`), which already allows anonymous pools. Blocker if ever
  revisited: a seat is `pod_players.user_id` and there is no guest-token identity, so
  an anonymous player could not reliably reclaim their seat/pool across requests.

## Leader preview liveness (2026-07-30, user)
- A draft that hits "Ready" (enters `leader_preview`) and never progresses is
  **auto-cancelled after 24 hours**, reusing the existing host Cancel Draft path.
- **No auto-start.** A draft never begins picking without the host.
- Players **can leave during `leader_preview`** — the in-session escape hatch, so a
  vanished host never traps anyone.
- Why this matters: the two-stage start removed the old liveness guarantee. Packs and
  the pick timer used to start atomically, so an absent host was harmless (the pick
  timer force-picked and the draft completed). With `pick_started_at` NULL during
  preview, nothing advances the pod but the host.

## Phase 2 — Player Ready flow + audio cue engine

### Player Ready (lobby) — also the browser-audio unlock
- Each human player in the draft lobby gets a **Ready** toggle (bots always ready).
  Storage: `pod_players.lobby_ready BOOLEAN NOT NULL DEFAULT false` (migration 079).
- Host's deal button ("Ready" from Phase 1b, relabel if clearer e.g. "Deal Packs") is
  **enabled only when all human players are ready**.
- The Ready click is the user gesture that primes audio on that client: on click, every
  cue `Audio` element is played muted + paused so later programmatic `.play()` succeeds.
  Host's own click primes the host. Late joiners/spectators prime on their first click.

### Cue engine — 7 clip slots
`greeting`, `ready-the-draft`, `start-the-draft`, `count-30`, `count-15`, `count-5`, `time-is-up`.

Triggers:
- `ready-the-draft` — all clients, on lobby → `leader_preview` transition.
- `start-the-draft` — all clients, on `leader_preview` → `leader_draft` (begin-picking).
- `count-30/15/5` — competitive mode only, duration-aware (skip when
  `threshold > totalSeconds - 2`; Appendix C picks are short). Fire once per
  `pick_started_at`, TOP TimerPanel instance only (page renders two).
- `time-is-up` — competitive only, on timer expiry (`onExpire` path).
- `greeting` — not used in-draft for now (used on the /redeem confirmation, Phase 3).

Architecture: pure threshold service (tested) + `useVoicePackAudio` hook owning
preload/prime/play + mute pref (`useLocalStorage`); `CountdownTimer` gets an opt-in
`cues` prop. Default pack assets at `public/sounds/voice-packs/default/<clip>.mp3`
(generated; Samantha voice).

## Phase 3 — Creator voice packs

### Data (migration 080)
- `voice_pack_invites` — `token` (unguessable, single-use), `created_by`, `expires_at`, `used_at`.
- `voice_packs` — id, `code` (UNIQUE, normalized uppercase), display name, `logo` bytea + mime,
  `invite_id`, `status`.
- `voice_pack_assets` — pack_id, `clip_type` (7-value enum/check), audio bytea + mime.
  (DB bytea storage: clips are ≤ ~1 MB; serve via API route with immutable cache headers.)
- `voice_pack_entitlements` — user_id, pack_id, granted_at, UNIQUE(user_id, pack_id)
  (clone of `promo_entitlements` shape, migration 078).
- Pod selection: `pods.settings.voicePackId` (existing JSONB).

### Flows
1. **Admin mints creator link** — panel on existing `/admin` page (`AdminGrantPanel` pattern)
   → `POST /api/admin/voice-pack-invites` → link `/creator/voice-pack/[token]`.
   Not linked anywhere public; token is the only way in.
2. **Creator page** `/creator/voice-pack/[token]` — validates token; form: redemption code,
   7 audio uploads (mp3/m4a/ogg/wav ≤ 1 MB each), logo image (png/jpg/webp ≤ 2 MB);
   multipart upload (precedent: `app/api/import/upload-photo/route.ts`); preview-play each
   clip before submit; submit consumes the token.
3. **Redeem** `protectthepod.com/redeem` — code input (auth required, GC-claim pattern:
   rate-limit → requireAuth → idempotent `ON CONFLICT DO NOTHING`); confirmation shows the
   pack logo; clicking the logo plays `greeting`.
4. **Pod usage** — host picks a pack from their entitlements (+ default) in lobby host
   controls; stored in `pods.settings.voicePackId`; server validates ownership; broadcast
   includes it; **every client** in the pod plays that pack's audio (host's unlock covers
   the whole table for that draft).
   Assets served from `/api/voice-packs/[id]/asset/[clip]`.

## Standing rules
- Commit per phase after tests + build; NEVER push.
- Never the word "tournament". Update `PATREON_FEATURES` if anything patron-gated is added.
- Generated extra packs (protocol/droid/whisper voices) staged in session scratchpad —
  optional seed content, not required by Phase 3 (creator uploads are the real content).
