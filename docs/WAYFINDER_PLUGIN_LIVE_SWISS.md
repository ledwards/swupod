# Wayfinder Companion -> PTP: live Swiss Practice

**Hand this to the Wayfinder team.** This is the live Swiss Practice contract
for competitive draft pods.

## Ownership

- Protect the Pod owns the official Swiss state: rounds, pairings, game slots,
  lobby lifecycle, results, standings, and round advancement.
- Wayfinder Companion owns browser automation: opening Karabast, creating or
  joining the private lobby, observing lifecycle, and forwarding authenticated
  callbacks through Wayfinder web.
- The browser postMessage payloads never contain `PTP_SERVICE_KEY` or plugin
  tokens. Those stay server-side in Wayfinder web.

## PTP page messages

The PTP play page calls its claim endpoint first:

```
POST /api/draft/{draftShareId}/match/{matchId}/game/claim
```

Only after the server returns an official claim does the page post one of these
messages to Wayfinder.

### Create private game

```ts
window.postMessage({
  type: 'wayfinder:practice-create-game',
  privacy: 'private',
  openInNewTab: true,
  deckUrl: 'https://protectthepod.com/pool/{poolShareId}/deck/play',
  format: 'pool',
  cardPool: 'Current' | 'Unlimited',
  practiceMatchGameId: 'uuid',
  matchId: 'uuid',
  draftShareId: 'pod-share-id',
  poolShareId: 'pool-share-id',
  podShareId: 'pod-share-id',
  roundId: 'uuid',
  gameNumber: 1 | 2 | 3,
  attemptNumber: 1,
  callbackContext: {
    practiceMatchGameId: 'uuid',
    matchId: 'uuid',
    draftShareId: 'pod-share-id',
    poolShareId: 'pool-share-id',
    podShareId: 'pod-share-id',
    roundId: 'uuid',
    gameNumber: 1 | 2 | 3,
    attemptNumber: 1,
    lifecycleUrl: '/api/plugin/v1/practice/match-game/lifecycle',
    resultUrl: '/api/plugin/v1/match/result'
  }
}, '*')
```

Expected Wayfinder behavior:

- Open Karabast in a new tab using the existing tab-scoped intent model.
- Create a private lobby for the deck/pool.
- When the lobby identity is known, call the lifecycle endpoint with
  `status: 'lobby_ready'`.

### Join existing game

```ts
window.postMessage({
  type: 'wayfinder:practice-join-game',
  openInNewTab: true,
  lobbyUrl: 'https://karabast.net/?lobbyId=...',
  deckUrl: 'https://protectthepod.com/pool/{poolShareId}/deck/play',
  format: 'pool',
  cardPool: 'Current' | 'Unlimited',
  practiceMatchGameId: 'uuid',
  matchId: 'uuid',
  draftShareId: 'pod-share-id',
  poolShareId: 'pool-share-id',
  podShareId: 'pod-share-id',
  roundId: 'uuid',
  gameNumber: 1 | 2 | 3,
  attemptNumber: 1,
  callbackContext: {
    practiceMatchGameId: 'uuid',
    matchId: 'uuid',
    draftShareId: 'pod-share-id',
    poolShareId: 'pool-share-id',
    podShareId: 'pod-share-id',
    roundId: 'uuid',
    gameNumber: 1 | 2 | 3,
    attemptNumber: 1,
    lifecycleUrl: '/api/plugin/v1/practice/match-game/lifecycle',
    resultUrl: '/api/plugin/v1/match/result'
  }
}, '*')
```

Expected Wayfinder behavior:

- Open Karabast in a new tab using the provided `lobbyUrl`.
- Join with the PTP deck and pool metadata.
- Report joined/in-progress lifecycle when observed.

## Lifecycle callback

Wayfinder web should forward Companion lifecycle events to PTP with
`Authorization: Bearer <PTP_SERVICE_KEY>`.

```
POST /api/plugin/v1/practice/match-game/lifecycle
```

Required fields:

```json
{
  "practiceMatchGameId": "uuid",
  "poolShareId": "pool-share-id",
  "status": "lobby_ready"
}
```

`status` may be `lobby_ready`, `joined`, `in_progress`, or `failed`.

Optional fields:

```json
{
  "lobbyId": "karabast-lobby-id",
  "lobbyUrl": "https://karabast.net/?lobbyId=...",
  "spectateUrl": "https://...",
  "wayfinderMatchId": "wayfinder-match-id",
  "wayfinderGameId": "wayfinder-game-id",
  "failureReason": "Karabast lobby creation failed",
  "lifecycleIdempotencyKey": "stable-event-id",
  "occurredAt": "2026-06-19T12:00:00.000Z"
}
```

PTP preserves the first non-empty lobby/watch metadata and broadcasts the updated
draft state when the row changes.

## Result callback

Per-game results continue to use the existing endpoint:

```
POST /api/plugin/v1/match/result
```

For live Swiss Practice, include the official game identity when available:

```json
{
  "poolShareId": "pool-share-id",
  "result": "win",
  "matchId": "wayfinder-match-id",
  "practiceMatchGameId": "uuid",
  "gameNumber": 1,
  "wayfinderGameId": "wayfinder-game-id",
  "replayUrl": "https://wayfinder.news/replay/..."
}
```

`result` is from the reporting player's perspective and may be `win`, `loss`,
or `draw`. PTP maps it to player1/player2, completes the game row idempotently,
derives the match winner when enough games are complete, and advances the next
round after all non-bye matches are done.

Optional leader/base/archetype fields from
`docs/WAYFINDER_PLUGIN_MATCH_IDENTITY.md` are still accepted on this result call.

## UI fallbacks

- If Wayfinder is not detected, PTP does not claim an official live game slot.
- Manual result reporting and host override remain available.
- PTP renders spectator/watch links only when Wayfinder provides a real
  `spectateUrl` or replay URL.

## Recommended E2E test layers

Do not make required PTP CI depend on real Karabast. Use three layers:

1. **PTP deterministic journey:** PTP seeds a Swiss pod and uses fake Companion
   callbacks against the real claim/lifecycle/result services. This proves the
   official state machine, read model, live/completed grouping, round
   advancement, and Swiss pairing without external flake.
2. **Wayfinder real Companion + fake Karabast:** Wayfinder CI loads the unpacked
   Companion extension in Playwright, points it at a controlled fake Karabast
   origin, and verifies that the real extension consumes PTP intents and sends
   lifecycle/result callbacks.
3. **Staging smoke:** an optional non-blocking job or manual run uses real
   Wayfinder Companion and real Karabast for create/join/lifecycle sanity. Full
   game completion should stay in fake Karabast/result-callback tests.

Wayfinder's E2E build mode should support:

- An unpacked extension build that Playwright can load.
- Configurable PTP, Wayfinder web, and Karabast origins.
- Localhost/staging PTP host permissions.
- A fake Karabast fixture page that can create a private lobby, expose the
  lobby URL, accept a join, emit an in-progress signal, and emit deterministic
  game results/replay URLs.
- Test-visible diagnostics for:
  - `wayfinder:practice-create-game` intent received.
  - `wayfinder:practice-join-game` intent received.
  - lobby created.
  - lifecycle callback sent.
  - result callback sent.

The extension/browser test mode must still keep `PTP_SERVICE_KEY` server-side in
Wayfinder web. The extension may hold only the same plugin/session credentials it
uses in normal operation.
