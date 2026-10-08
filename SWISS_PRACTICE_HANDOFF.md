# Swiss Practice live-capture debugging — handoff / state of the world

_Last updated by Claude (Opus 4.8) during a long live-debug session. Two repos involved:_
- **PTP (swupod):** `/Users/lee/Repos/ledwards/swupod` — app server on **:3000** (`npm run dev` = `tsx server.ts`, runs migrations on boot). Worktree in use: `.claude/worktrees/relaxed-elion-6d99ad` (branch `claude/relaxed-elion-6d99ad`).
- **Wayfinder (hub + extension):** `/Users/lee/Repos/ledwards/wayfinder-ptp-live-swiss` — hub (Next.js) on **:3001** (subdomain `plugin.localhost:3001`), branch `codex/ptp-live-swiss-practice`. Extension dist: `apps/extension-chrome/dist`.

The two apps use **separate databases**: PTP `DATABASE_URL` (its own pg), hub `DATABASE_URL = localhost/wayfinder_dev`. They talk over HTTP with `PTP_SERVICE_KEY` (must match on both; hub reads `PTP_API_URL=http://localhost:3000`).

Node: use `nvm use 20.20.2`.

## The pipeline (where a lobby/result event travels)

```
Karabast tab (content script: capture-shell.ts)
  → emits PTP_PRACTICE_LIFECYCLE / PTP_GAME_RESULT via chrome.runtime.sendMessage
    → background SW (background.ts) — DURABLE queue, POSTs with the user's PLUGIN TOKEN
      → hub route /api/plugins/ptp-practice-lifecycle  (apps/web) — auth → rate → ownership GATE (ptp_pools) → claim row in ptp_practice_lifecycle_posts → forward
        → PTP /api/plugin/v1/practice/match-game/lifecycle  (with PTP_SERVICE_KEY)
          → updates practice_match_games / practice_matches, broadcasts to opponent socket
```

Result reporting is the sibling path: extension `PTP_GAME_RESULT` → hub → PTP `/api/plugin/v1/match/result`.

## Root causes FOUND + FIXED this session (all were stacked)

1. **Hub DB missing `ptp_practice_lifecycle_posts`** — migrations `0301_ptp_practice_lifecycle_ledger.sql` + `0302_ptp_practice_game_reconciliation.sql` were never applied to `wayfinder_dev` (hub was started before they existed). Every lifecycle POST 500'd at the hub. **FIXED:** applied both migrations (table now exists, with the `(user_id, idempotency_key)` unique index the route's ON CONFLICT needs). A hub restart would also have done this.

2. **Ownership gate 403** — the user's Swiss draft pool `n3xgUIrU` (owner `terronk`, PTP user `cd21932e-855e-4e01-ad18-0c76245df6de`, discord `511342370286206980`) was not in the hub's `ptp_pools`. The route's JIT-sync (`syncPtpForMember` → PTP `/api/private/user-data`) is supposed to populate it but had never run for this user. **FIXED:** forced a real lifecycle POST through the hub with terronk's token, which ran the JIT-sync; `n3xgUIrU` is now in `ptp_pools`. Verified PTP's `/api/private/user-data` DOES return the pool (132 pools, `n3xgUIrU` type=draft) and `fetchPtpUserData` unwraps the `{success,data}` envelope correctly.

3. **PTP app server (:3000) crashed** (SIGABRT/exit 134 — a Node/Next dev abort, not code). **FIXED:** restarted (`npm run dev` from the worktree), confirmed :3000→200, pool API→200, hub→200.

4. **Proven:** pushed a real `lobby_ready` through the hub with terronk's plugin token → HTTP 200, gate passed, forward attempted. **The entire server pipeline works.**

## What I COMMITTED (code)

- wayfinder `8892067e1` — `capture-shell.ts`: (a) observation-driven `lobby_ready` in the `ws_lobbystate` handler so a MANUALLY-created lobby is reported (not just auto-create); (b) sessionStorage persist/re-hydrate of practice context to survive a Karabast-tab refresh. + 2 red-first harness tests in `karabast-ptp-practice.test.ts` (17/17 green). 507 unit tests green.
- swupod `1de886cd` — `tests/e2e/live-swiss-manual-lobby-recovery.spec.ts` (new) proving failed→manual `lobby_ready` recovery surfaces Join to the opponent; fixed stale `/Play Game/i`,`/Join Game/i` selectors in `live-swiss-fake-companion.spec.ts` (button was renamed to icon-only "Play"/"Join" via `aria-label` in `1e45ac0b`; now drive off `data-live-game-action` + `.match-card-live-button`).

## Manual data fix applied

- Match `b7f471da` (Round 1, p1=terronk vs p2=realleebo, pod `c2fec978`): set `game1_result='player1'` (terronk won game 1) via direct SQL because capture missed it. Match left open (Bo3, 1-0). realleebo = PTP user `462eadf2-78cb-4e8b-b7d8-d8ca44db0b82`, discord `1467923176364310686`.

## THE REMAINING BUG (what to fix)

**Symptom:** user conceded **game 2 during turn 1** and got **no toast** and no result captured. Game 1 lobby/join worked; game 2 "breaks." "No toast" means the extension content script never even LOCALLY detected the game-over — so this is a **content-script / pure-reducer bug in the Bo3 game-2 (same-lobby) capture path**, NOT the server/env (those are repaired) and NOT only the hub-delivery issue.

**Where to look:**
- `packages/extension-shared/src/capture-reducer.ts` (pure; unit-testable) — the game-over / concede detection and Bo3 game-2 transition. Key bits (names from the minified bundle): `ws_gamestate` case sets `gameOverDetected` when `winners.length>0 && gameOver`; `tick`/`chat_messages` case scans `currentGame.messages` for `wa()` (concede regex `(.+?)\s+(wins the game|has won|concedes)`); game-2 start comes via `url_changed` to a new `/game/<id>` with `pendingRematch`. Bo3 same-lobby continuation uses `pendingRematch`, `lastSubmittedLobbyId`, `bo3AnnouncedForLobby`.
- Existing tests that DON'T cover this exact case: `capture-reducer-set-concede.test.ts`, `capture-reducer-bo3-native-game2.test.ts`, `bo3-set-concede.test.ts`, `capture-reducer-chat-bo3.test.ts`. The gap is **a single-game concede during turn 1 of GAME 2** (not a set-concede, not game 1).

**Hypothesis to test first:** after game 1 is submitted/saved (Bo3 incomplete), is the extension actually `isInGame` with a fresh `currentGame` for game 2 when the concede chat arrives during turn 1? If `currentGame` is stale/null or `isInGame` is false at that moment, the concede scan no-ops → no `gameOverDetected` → no toast → no result. Reproduce by driving the reducer: lobby → game1 start → game1 result → game2 start (same lobby, pendingRematch) → very early `concedes` chat on turn 1 → assert `gameOverDetected` + a result effect.

**Caveat (separate issue, not the toast):** the extension's background SW is **not authed to the local hub** (`plugin.localhost:3001`) — by elimination its lifecycle/result POSTs aren't reaching the hub route (ptp_pools was never synced until I forced it). Even with a correct local capture, delivery to PTP needs the extension popup **Logged In to the local hub** (fresh plugin token). The SW console line (`sent` / `deferred httpStatus=401` / `queued (not configured)`) on a real event tells which. This is the user's to fix (re-login); the toast/detection bug is ours.

## UPDATE — root cause of "no toast / no capture on game 2" (RESOLVED in code) + the ONE user action

Traced the "concede game 2, no toast, nothing" symptom to the **recording gate**, not
the reducer. The pure reducer DOES detect a game-2 turn-1 concede (proved by new
`capture-reducer-bo3-game2-concede.test.ts`). The break was downstream in the shell:

`capture-shell.ts` `executeEffect` consults `canRecordNow()` (= `isCaptureAllowed`,
`capture-gate.ts`). When the gate is **closed** — `gateLoggedIn = Boolean(wf_config.pluginToken)`
is false (extension signed out / no plugin token), or recording paused — it suppressed the
game-over `show_toast` entirely, fired the `submit_capture` "sign in" warning only ONCE per
session, and warned NOT AT ALL on the Bo3 mid-set `save_session_storage`. So after game 1
ate the one-shot warning, game 2's concede was dead silent.

**This is the unifying root cause of ALL the user-facing symptoms:** the extension is
**signed out of the local hub** (no plugin token) → gate closed → no toast + no capture, AND
SW unconfigured → lifecycle/result POSTs never reach `plugin.localhost:3001` (which is why
`ptp_pools` was never synced until I forced it). terronk HAS 3 valid plugin tokens in the hub
DB, but the EXTENSION's `wf_config.pluginToken` is empty → it's logged out client-side.

**Code fix committed (wayfinder `c9def5350`):** `gatedCaptureNotice` (pure, tested) +
shell wiring so a closed gate now surfaces exactly ONE clear notice per game-over — "Game
finished but not recorded — sign in to Wayfinder to record it" — covering both submit and the
previously-silent Bo3 save path. This does NOT make capture work while signed out; it removes
the silent failure that hid the need to sign in.

**THE ONE USER ACTION:** open the Wayfinder extension popup and **Log In against the LOCAL
hub** (`plugin.localhost:3001`) so `wf_config.pluginToken` is set and recording is on. Then —
with the server side already repaired (migrations, pool synced, :3000 restarted) and proven —
capture + lobby reporting should work end to end. Confirm the SW console shows `sent` (not
`queued (not configured)` / `deferred httpStatus=401`) on the next event.

## UPDATE 2 — "Swiss must count Round-1 concedes + other losses" (4-way trace + fix)

Ran a 4-agent trace (real-time path / ingestion backstop / PTP reconciliation / loss-type
detection) across both repos. Findings:

- **The Round-1-concession ANALYTICS exclusion is NOT the Swiss drop.** `classifyEarlyConcessionExclusion`
  (`karabast-terminal-signal.ts`) only writes hub-internal `excluded_from_analysis`; it never
  touches `practice_matches.gameN_result`. Ingestion already exempts competitive practice
  (`ingestion.ts:1468 isCompetitivePractice ? null : …`) and the PTP result path
  (`swupod app/api/plugin/v1/match/result/route.ts` → `liveGames.recordPracticeMatchGameResultInTransaction`
  → `mirrorGameResultToPracticeMatch`) has **no turn/round/concede gate at all**. So a clean
  **Round-1 concede counts** — it's detected via "concedes" and flows straight to `gameN_result`.
- **The real gap (FIXED, wayfinder `21d22ed19`):** the real-time detector `determineChatWinner`
  (`karabast-winner.ts`) matched only win/has-won/concede — it **missed "has left the game"**
  (leave/disconnect). The canonical server grammar (`TERMINAL_PHRASES` = win/concede/**leave**)
  and the ingestion parser already counted a leave as a loss; the real-time path had drifted.
  Now aligned: a leave = a loss for the named player (opponent wins), same as a concede.
- **Timeout:** there is NO timeout phrase in the canonical grammar (server doesn't handle it
  either). If Karabast emits a distinct timeout terminal, add it to `TERMINAL_PHRASES` (server)
  AND `determineChatWinner` (extension) together. Unknown phrase → left as a follow-up.

### Other ways a Swiss loss can still be lost (NOT concede/loss-type bugs — lifecycle/delivery)
These are the remaining drop points the trace found; they are tied to the upstream lifecycle
failing (the issues fixed in UPDATE 1 — migrations / pool sync / sign-in), not to the kind of loss:
- `ingestion.ts:1686` — the practice writeback only fires if the capture payload carries the
  `ptpPractice` anchor; without it the game falls to the casual fan-out and never reaches
  `gameN_result`. The anchor is set when the player Claims via Play and the extension is working.
- `swupod liveGames.ts:~1124` — `inactive_game_row` (409): a result for a `practice_match_games`
  row already marked `failed` (e.g. by the "Timed out waiting for Wayfinder lobby" stale-claim
  timeout) or `voided` is rejected. So a game whose **lobby lifecycle failed upstream** can't
  record its result even if it was really played. If you want a played game to count despite a
  failed lobby row, that's a deliberate guard to loosen **for the practice path only** (revive
  the row, like `recordLobbyRecoveryAttempt` does for lobby_ready) — flagged, not changed, since
  it alters a deliberate guard and needs your call.

## UPDATE 3 — the "round 2 / hours-old match" jam (a game stuck in_progress) — FIXED

User reported a "round 2 bug" on an HOURS-OLD match and asked if age was the cause. It was.
Empirical DB state of match `b7f471da` (Round 1, terronk vs realleebo, pod `c2fec978`):
- aggregate `game1_result=player1` (set manually earlier), `game2/3` null, not confirmed.
- four `game_number=1` attempts: att1-3 `failed` ("Timed out waiting for Wayfinder lobby"),
  **att4 `f3182d69` stuck `in_progress` for ~2h** (finally got a lobby at 00:30, result never landed).
- `pod.status=complete` is NORMAL (it's a draft pod — "complete" = draft done; play happens after).

ROOT CAUSE: `RETRYABLE_STALE_STATUSES = ['creating','lobby_ready']` — **`in_progress` is never
stale**, so a game whose result never arrived has NO recovery path: the read model
(`summarizeCurrentPracticeGame`) sits on it, the card shows a disabled "Game in progress", and
the match jams forever. (This match happened to be masked because the manually-set
`game1_result` made `nextNeededGameNumber` skip to game 2 — verified by running the real read
model on live data → it returns `pending` game 2 — but a NORMAL match with no manual aggregate
jams permanently on the stuck game.)

FIX (swupod):
- `liveGames.ts`: new `IN_PROGRESS_STALE_AFTER_MS = 90min`; `isStalePracticeGame` now stales an
  `in_progress` game older than that (anchored on last activity, so a genuinely live game is
  never interrupted). The claim already fails a stale official game + opens a fresh attempt, so
  recovery is automatic; failure reason is now status-aware ("Game stalled in progress").
- `MatchmakingPanel.helpers.ts`: a stale/retryable `in_progress` game now offers an enabled
  **Retry** ("This game stalled — retry to reopen the lobby") instead of a dead disabled button.
- Tests: `liveGames.test.ts` (+1, the hours-old jam: stale after 90min, live <90min stays
  untouched, read model marks it retryable). 9/9 liveGames + 28/28 helper green; tsc clean.
- Data: voided the stuck att4 (`f3182d69`) so this match cleanly offers game 2. **Refresh the
  play page** (or it re-broadcasts on the next event) to see "Play Game 2".

## UPDATE 4 — native-Bo3 game 2/3 "never records" (intermittent) — FIXED at the source

User isolated it: a Bo1, or 3 SEPARATE lobbies, records fine; **game 2/3 of a single
native Bo3 series (all in one Karabast lobby) often doesn't.** Grounded data: `practice_match_games`
g#2 = 3 complete vs **2 stuck in_progress**; same-lobby series split between fully-recorded
(`d435d952`, `d28229e1`, `397bc2ab`) and stuck-at-game-2 (`4f17ff47`, `93ddbd3b`).

ROOT CAUSE (a race): the **lifecycle** (`in_progress`) fires off `ws_gamestate`, so PTP sees
game 2 start. But the **capture state machine** only ENTERS a game on a `url_changed` to its
`/game/<uuid>`. In one Bo3 lobby, a FAST game 2/3 (e.g. a turn-1 concede) can end before the URL
navigation (2s poll / pushState hook) enters it → its game-over is never detected →
`sendPtpGameResult` never fires → the game sticks `in_progress`, never recording. Intermittent
because it depends on whether the URL navigation beats the game ending.

FIX (wayfinder `1225289e5`, `capture-shell.ts` ws_gamestate handler): a gamestate is the
earliest reliable "game started" signal. When a gamestate for a NEW game id arrives in a Bo3
series (`winHistory.currentGameNumber >= 2`) and the capture isn't recording it, ENTER it off
the gamestate id — a synthetic `/game/<gamestate.id>` url_changed (matches Karabast's real
per-game URL, so the real nav that follows is a no-op) — **before** processing the gamestate, so
even a same-frame game-over is caught in-game. Also logs the divergence (`[ptp-pipeline] BO3
continuation: …`) so it's visible if it ever recurs. Test: capture-reducer-bo3-game2-concede.test.ts
(+1, fresh-URL game 2 + gamestate-win → finalized with an outcome). 527 unit green; dists rebuilt.

NEEDS LIVE VALIDATION: tested at the reducer level, but the shell dispatch on real gamestates
should be confirmed by playing a native Bo3 — game 2/3 should now record, and the console shows
`BO3 continuation: … entering off gamestate`. UI: also "Game N Ready" → "Game N Ready to Play"
(swupod `186a611c`).

## Verify commands
- wayfinder unit: `cd apps/web && pnpm exec vitest run` (or per-package in `packages/extension-shared`). Reducer tests live in `packages/extension-shared/src/*.test.ts`.
- rebuild dists: `pnpm --filter @wayfinder/extension-chrome build` (also -firefox, -safari).
- swupod live-swiss e2e (needs :3000 + PTP_SERVICE_KEY + DB): `npx playwright test tests/e2e/live-swiss-*.spec.ts --project=chromium --workers=1`.
