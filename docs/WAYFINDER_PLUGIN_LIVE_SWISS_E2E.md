# Live Swiss Practice — Cross-Repo E2E Harness Contract

**Audience:** the Wayfinder Companion e2e harness (lives in the Wayfinder repo).
This document is the PTP side of the joint test. It explains how to stand up,
drive, and tear down a live Swiss Practice pod on a **running PTP instance** so
the **real** Companion extension can be exercised against it.

For the runtime message/callback contract (intents, lifecycle, result payloads)
see [`WAYFINDER_PLUGIN_LIVE_SWISS.md`](./WAYFINDER_PLUGIN_LIVE_SWISS.md). This
document only covers the test-harness bootstrap that contract assumes.

---

## Where this fits in the test layers

`WAYFINDER_PLUGIN_LIVE_SWISS.md` defines three layers. This contract powers
layers 2 and 3 — the ones that use the real extension:

| Layer | Lives in | Karabast | PTP | What it proves |
|-------|----------|----------|-----|----------------|
| 1. PTP deterministic journey | **PTP** (`tests/e2e/live-swiss-fake-companion.spec.ts`) | none (fake Companion) | real, in-process | PTP state machine, read model, advancement |
| 2. Real Companion + fake Karabast | **Wayfinder** | fake | real (local), seeded via **this contract** | extension consumes PTP intents, sends callbacks |
| 3. Staging smoke | either | real | real (staging) | end-to-end sanity |

PTP's own layer-1 spec and these test-only endpoints now share **one** fixture
implementation: [`lib/testFixtures/liveSwiss.ts`](../lib/testFixtures/liveSwiss.ts).
So a pod the harness seeds over HTTP is byte-for-byte the pod PTP seeds in its
own e2e — assertions transfer.

---

## Prerequisites: running a local PTP for the harness

Start PTP (`npm run dev`, which runs Next + Socket.io via `server.js`) with:

| Env | Why |
|-----|-----|
| `NODE_ENV` ≠ `production` (default in dev) | Enables the test-only endpoints. In a prod-like env you must instead set `ALLOW_TEST_USERS=1` — **do not** do this on real production. |
| `PTP_SERVICE_KEY=<shared>` | Bearer token PTP requires on the lifecycle/result callbacks. The Wayfinder side (web or harness) must send the **same** value. |
| `DATABASE_URL` / `POSTGRES_URL` | A disposable dev/test Postgres. Seeding writes real rows (users, pod, pools, matches). |
| `JWT_SECRET` | Used to mint the player session tokens `seed` returns. No cross-repo sharing needed — PTP mints and verifies them itself. |

Pod cleanup is the harness's responsibility (call `cleanup`). Seeded users use
the `test_<testId>_%` discord-id convention, same as `createTestUser`.

---

## Test-only endpoints

All three are gated by the same guard as `/api/test/create-user`: available
unless `NODE_ENV === 'production' && !ALLOW_TEST_USERS`. They return `403`
otherwise. No auth header is required (the env guard is the gate).

### 1. Seed a pod — `POST /api/test/live-swiss/seed`

Creates four beta-tester users, a competitive pod in the `matchmaking` phase,
their pools, an active round 1, and two matches. Round-1 pairing is **seats
(1 vs 3) and (2 vs 4)**, chosen so completing round 1 yields the deterministic
round-2 pairing **(1 vs 2) and (3 vs 4)**.

Request body (all optional):

```json
{ "testId": "wf-live-swiss-001", "setCode": "SOR" }
```

Response:

```json
{
  "testId": "wf-live-swiss-001",
  "podId": "uuid",
  "podShareId": "live-swiss-pod-...",
  "roundId": "uuid",
  "players": [
    { "userId": "uuid", "username": "LiveA", "poolShareId": "live-swiss-pool-0-...", "token": "<jwt>", "cookieName": "swupod_session" },
    { "userId": "uuid", "username": "LiveB", "poolShareId": "live-swiss-pool-1-...", "token": "<jwt>", "cookieName": "swupod_session" },
    { "userId": "uuid", "username": "LiveC", "poolShareId": "live-swiss-pool-2-...", "token": "<jwt>", "cookieName": "swupod_session" },
    { "userId": "uuid", "username": "LiveD", "poolShareId": "live-swiss-pool-3-...", "token": "<jwt>", "cookieName": "swupod_session" }
  ],
  "matches": [
    { "matchId": "uuid", "player1Id": "<A>", "player2Id": "<C>", "player1PoolShareId": "...", "player2PoolShareId": "..." },
    { "matchId": "uuid", "player1Id": "<B>", "player2Id": "<D>", "player1PoolShareId": "...", "player2PoolShareId": "..." }
  ]
}
```

To **log in** as a player in a Playwright context, set the session cookie on the
PTP origin:

```ts
await context.addCookies([{ name: player.cookieName, value: player.token, url: PTP_BASE_URL }])
```

Then open `${PTP_BASE_URL}/pool/${player.poolShareId}/deck/play?wayfinder=1`.
The `?wayfinder=1` hint mirrors how the in-process spec forces the
Wayfinder-detected path.

### 2. Read state — `GET /api/test/live-swiss/state?podShareId=...`

Returns the live state for deterministic assertions without scraping the DOM:

```json
{
  "podId": "uuid",
  "podShareId": "live-swiss-pod-...",
  "currentRound": 1,
  "rounds": [
    {
      "roundId": "uuid",
      "roundNumber": 1,
      "status": "active",
      "matches": [
        {
          "matchId": "uuid",
          "player1Id": "uuid",
          "player2Id": "uuid",
          "isBye": false,
          "gameResults": [null, null, null],
          "finalConfirmed": false,
          "matchWinner": null,
          "wayfinderMatchId": null,
          "games": [
            {
              "gameId": "uuid",
              "gameNumber": 1,
              "attemptNumber": 1,
              "status": "lobby_ready",
              "lobbyId": "karabast-lobby-id",
              "lobbyUrl": "https://...",
              "spectateUrl": "https://...",
              "wayfinderMatchId": "wf-...",
              "wayfinderGameId": "wf-game-...",
              "result": null,
              "replayUrl": null,
              "failureReason": null
            }
          ]
        }
      ]
    }
  ]
}
```

Poll this to assert lobby creation (`games[].status === 'lobby_ready'`),
in-progress, per-game results, match completion (`finalConfirmed`,
`matchWinner`), and round advancement (`currentRound`, a new round object).

### 3. Tear down — `POST /api/test/live-swiss/cleanup`

```json
{ "testId": "wf-live-swiss-001" }
```

Accepts any of `{ podId, podShareId, testId }`. With `podId`/`podShareId` it
deletes the pod and all pod-scoped rows; with `testId` it also deletes the
seeded users. Pass `testId` (and optionally `podShareId`) to fully clean up.

---

## Recommended harness flow

```
1.  POST /api/test/live-swiss/seed  { testId }            → ids + player tokens
2.  Load the real unpacked Companion extension into a Playwright context.
3.  Context A: set player[0] cookie, open player[0] play page (?wayfinder=1).
    Context C: set player[2] cookie, open player[2] play page (its opponent).
4.  Context A: click "Play Game" on match-card-<matchId>.
      → PTP claims the game, posts window.postMessage('wayfinder:practice-create-game').
      → real extension opens FAKE Karabast, creates a lobby.
      → Wayfinder web (or the harness) POSTs the lifecycle callback to PTP.
5.  Assert via GET state: games[0].status transitions creating → lobby_ready.
6.  Context C: click "Join Game" → 'wayfinder:practice-join-game' → join lobby.
7.  Drive fake Karabast to emit game results; Wayfinder posts per-game results
    to POST /api/plugin/v1/match/result with gameNumber + practiceMatchGameId.
8.  Assert via GET state: gameResults fill in, finalConfirmed flips, then
    currentRound advances to 2 once both round-1 matches complete.
9.  POST /api/test/live-swiss/cleanup { testId, podShareId }.
```

Steps 4/6 require the extension to see PTP as "Wayfinder-installed". The real
extension injects `meta[name="wayfinder-installed"]` itself; the in-process spec
fakes that meta tag.

### Delivering the lifecycle/result callbacks

PTP only requires `Authorization: Bearer <PTP_SERVICE_KEY>` on these calls. Two
ways to satisfy that in the joint test — the choice is **Wayfinder's**:

- **Through Wayfinder web** (closest to production): run Wayfinder web locally;
  the extension calls it; it forwards to PTP with the service key held
  server-side. `PTP_SERVICE_KEY` never enters the browser.
- **Harness posts directly** (simplest, deterministic): the harness posts the
  lifecycle/result payloads to PTP itself with the service key, exactly as PTP's
  own `live-swiss-fake-companion.spec.ts` does. Use this to validate the
  extension's *intent consumption* and Karabast automation without standing up
  Wayfinder web.

Endpoints (full payloads in `WAYFINDER_PLUGIN_LIVE_SWISS.md`):

- `POST /api/plugin/v1/practice/match-game/lifecycle` — `lobby_ready` / `joined` / `in_progress` / `failed`
- `POST /api/plugin/v1/match/result` — per-game result with `gameNumber` + `practiceMatchGameId`

---

## Stable DOM selectors (alternative to the state endpoint)

If the harness prefers to assert on the rendered PTP page instead of (or in
addition to) the state endpoint, these are stable and covered by PTP's own e2e:

| Selector | Meaning |
|----------|---------|
| `[data-testid="matchmaking-panel"]` | The panel root |
| `[data-testid="matchmaking-panel"][data-current-round="N"]` | Current Swiss round |
| `[data-testid="match-card-<matchId>"]` | A match card |
| `[data-testid="match-card-<matchId>"][data-live-game-status="in_progress"]` | Live game status for that match |
| `.matchmaking-round-match-group--completed [data-testid="match-card-<matchId>"]` | Card has moved to the completed group |
| `[data-testid="matchmaking-round-section-N"]` | Round N section is rendered |
| `[data-testid="matchmaking-live-console"]` | Live Swiss console |
| `button` named `/Play Game/i` / `/Join Game/i` | Launch / join actions |

---

## Safety

- These endpoints mint real session tokens and seed real rows. They are
  **development/test only** and 403 in production unless `ALLOW_TEST_USERS` is
  explicitly set — never set it on production.
- `PTP_SERVICE_KEY` must stay server-side in the "through Wayfinder web" model.
  In the "harness posts directly" model the key lives only in the test process,
  never in the page/extension.
