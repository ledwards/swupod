# Plan: Both-Decks Logging + Identity Unification (#5)

Cross-repo (`swupod` = PTP, `../wayfinder` = hub + extension). This is the
remaining piece after the bug fixes #1–#4. See
`memory/reference_ptp_wayfinder_identity_loss_failure_modes.md` for the diagnosis.

## Goal

A single Karabast game should log to **every PTP deck/pool a player attached to
that lobby**, with the correct per-seat result + leader/base — even when:
- the player plays **both seats** (self-play across two browsers), and/or
- a seat is **logged out of Karabast** (shows as `anonymous <hex>`), and/or
- the player uses **multiple Karabast handles** under one PTP account.

## Core principle

**Seat identity for PTP comes from the authenticated plugin session, not the
Karabast handle.** Every `ptp_lobby_pool_links` row is written by an extension
authenticated to the hub with a plugin token → it already carries `user_id`
(the wayfinder/PTP user). So "anonymous on Karabast / multiple handles still maps
to my identity" is satisfied by `user_id` on the link; the Karabast handle is
used only to disambiguate **which seat** maps to **which pool** within a lobby.

## Why it's broken today (verified 2026-06-20)

`ptp_lobby_pool_links` has `UNIQUE (lobby_id)` and the registration route
(`apps/web/app/api/plugin/ptp-lobby-pool/route.ts`) does
`ON CONFLICT (lobby_id) DO UPDATE`. Two browsers in one lobby → the second
registration **overwrites** the first, so only one pool ever survives, and
ingestion (`ingestion.ts` ~line 1382) resolves that single pool. Confirmed: lobby
`9d44d220…` had exactly one row (`Z_Gu3dPn`); the `rNbsEyMY` registration was
wiped.

## Prerequisites (NOT part of this plan — must land first)

1. **#1/#4 identity fix pushed** (unpushed local wayfinder commits
   `1bc1a3b18`+`c635e391e`; reconcile with `origin/main` and push). Both-decks
   logging is pointless without per-seat identity.
2. **#2 dup-key fix** (`linkGameToMatch` in `karabast-match-creation.ts`) landed.
3. **#3 PTP pool-scoping** (swupod `migrations/072` + route `canonicalMatchId`)
   landed — this is the PTP receiving side and is **already done**.
4. wayfinder repo settled (it was actively churning during diagnosis).

## Work

### A. wayfinder — link table (migration `0297_ptp_lobby_pool_links_per_seat.sql`)
- Drop `UNIQUE (lobby_id)`.
- Add `UNIQUE (lobby_id, user_id, ptp_share_id)` — lets multiple pools survive
  per lobby (cross-user AND self-play), idempotent per (lobby,user,pool).
- Add nullable `karabast_handle TEXT` and `is_owner BOOLEAN` — seat hints,
  populated by the extension (see D). Nullable so the server works before the
  extension ships.
- Index `(lobby_id, user_id)` for ingestion lookup.

### B. wayfinder — registration route (`app/api/plugin/ptp-lobby-pool/route.ts`)
- Accept optional `karabastHandle`, `isOwner` in the body.
- `ON CONFLICT (lobby_id, user_id, ptp_share_id) DO UPDATE SET
  karabast_handle = EXCLUDED.karabast_handle, is_owner = EXCLUDED.is_owner`.
- **Must ship in the same migration deploy** — the old `ON CONFLICT (lobby_id)`
  breaks the moment the unique constraint changes.

### C. wayfinder — ingestion fan-out (`src/server/ingestion.ts`, the PTP block ~1380–1478)
Replace the single-pool resolve with: resolve **all** links for
`(lobby_id, user_id)`, then for each link write back its seat's perspective.
- **1 link** → current behavior (owner perspective, the reporting deck).
- **N links + seat info** (`karabast_handle`/`is_owner` present) → map each link
  to a captured seat; for each pool send `{ result, replayUrl, identity }` from
  that seat's POV (player/opponent leader/base swapped; result inverted for the
  non-owner seat: win↔loss, draw=draw). Use the **bare** matchId (already the
  case post-#1) so PTP's `(user, pool, canonical_id)` upsert stores one row per
  deck.
- **N links + no seat info** (pre-extension-release) → fall back to single
  best-effort pool (owner/most-recent), `log()` that both-decks was skipped — no
  silent truncation. No regression vs today.

### D. extension (`packages/extension-shared`) — RELEASE-GATED
- When calling `POST /api/plugin/ptp-lobby-pool`, include the seat's
  `karabastHandle` (or `anonymous` marker) and `isOwner`.
- Forward-compatible: server already tolerates their absence (C fallback).
- **Requires**: build all three (chrome/firefox/safari) → store review →
  **explicit publish approval** (see `feedback_never_publish_without_approval`).
  Until shipped + adopted, self-play logs one deck (the fallback).

### E. swupod (PTP) — already done
`migrations/072` (pool-scoped `casual_matches`) + `canonicalMatchId` mean both
decks can store distinct, deduped, idempotent rows as soon as wayfinder fans out.
No further swupod work.

## Perspective mapping (self-play)
Capture has owner seat (e.g. `terronk`, result `R`) and opponent seat
(`anonymous <hex>`). Owner's pool ← `{ result: R, player = owner deck,
opponent = other deck }`. Opponent's pool ← `{ result: invert(R), player =
other deck, opponent = owner deck }`.

## Risks / edge cases
- **Incomplete capture** (this game had `isComplete=false, deckCardCount=0`) →
  identity may be partial/absent even after the fix; nothing to recover for that
  specific historical game.
- **Perspective correctness** — get the owner/opponent result inversion right;
  cover with a self-play integration test.
- **Stale links** — a user switching pools mid-lobby leaves an extra link;
  harmless (ingestion maps by seat) but worth a TTL reap later.
- Two redundant `(match_id, game_number)` indexes already noted in #2.

## Test plan
- wayfinder integration (`useTestTransaction`): two links for one
  `(lobby,user)` with distinct `is_owner` → ingestion writes back to **both**
  pools with inverted results + swapped identity; single-link path unchanged;
  no-seat-info fallback logs + writes one.
- swupod: already covered by `canonicalMatchId` tests + the pool-scoped index.
- Manual: re-run the self-play scenario after the extension ships; both
  `/pool/<a>/deck/stats` and `/pool/<b>/deck/stats` show the game with correct
  leaders and inverse W/L.

## Rollout order
1. Land prerequisites (#1/#4 push, #2, #3).
2. Deploy A+B+C together (wayfinder server; forward-compatible, no extension yet).
3. Ship D (extension) → review → approved publish.
4. Verify with a self-play game.
