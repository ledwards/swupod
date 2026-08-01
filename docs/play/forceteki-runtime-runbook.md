# PTP Forceteki Runtime Runbook

This runbook is the PTP-side operating contract for the private Forceteki
runtime. It belongs to Phase A / Unit 1 of
`docs/plans/2026-06-23-001-feat-ptp-forceteki-limited-runtime-plan.md`.

The goal of Phase A is deliberately narrow: prove that PTP can operate a thin,
private Forceteki/Karabast runtime, start a PTP-seeded limited game, capture a
result, and advance upstream without turning card/rules updates into a merge
treadmill.

## Current Upstream Baseline

Record these refs whenever the smoke gate is run:

| Repo | Ref to pin | How to inspect |
|---|---|---|
| `SWU-Karabast/forceteki` | `origin/main` currently observed at `4bafdf13d2ed657e665cfc91f99eb6defef1f1cf` | `git fetch origin main && git rev-parse origin/main` |
| `SWU-Karabast/forceteki-client` | `origin/main` currently observed at `579a3a3eaee344758849ea8064c9a5cec65b0fea` | `git fetch origin main && git rev-parse origin/main` |

Do not treat those hashes as permanent. They are the starting point for the
first private-runtime branch, not a long-lived upgrade policy.

## License And History Notes

- `SWU-Karabast/forceteki` is MIT licensed and says it is based on the
  Ringteki architecture. It was not built de novo for Star Wars: Unlimited.
- Forks must preserve MIT license notices and attribution.
- The code license does not answer SWU card/art/IP, trademark, community, or
  paid data-product questions. PTP needs its own terms/privacy copy before any
  public alpha.

## Repository Roles

| Repo | Owns | Must avoid |
|---|---|---|
| `swupod` | PTP identity, pools, decks, queue/event state, play ledger, seat-token issuance intent, result/replay ingestion, stats/data product, kill switch | Browser-supplied official decks, runtime DB access, public runtime secrets |
| `ptp-forceteki` | Private game server, PTP launch adapter, runtime seat validation, telemetry/replay observer, callback client | Routine edits under `server/game/cards`, broad core-rules patches, product queue/lobby ownership |
| `ptp-forceteki-client` | Private table entry route, runtime config, PTP branding/minimal chrome | Public Karabast lobby/queue product decisions |

## Branch Model

Use a thin-fork model:

1. Keep an upstream remote pointing at `SWU-Karabast/forceteki` or
   `SWU-Karabast/forceteki-client`.
2. Keep a local branch that can be reset to upstream `main` for comparison.
3. Keep the PTP runtime branch small and adapter-oriented.
4. Record the last known green server/client refs after every successful smoke.
5. Prefer upstream PRs for engine fixes that are not PTP-specific.

Allowed local divergence in runtime repos:

- `server/ptp/**`
- `scripts/ptp/**`
- `docs/ptp/**`
- env/config plumbing for PTP origins, CORS, lobby/spectate URL bases, and
  runtime callback endpoints
- narrowly scoped registration calls from existing server/client entry points

High-risk divergence that should trigger a redesign discussion:

- card implementations under `server/game/cards/**`
- broad edits to `server/game/core/**`
- analytics logic inside individual card files
- replacing Forceteki's game/table loop instead of wrapping launch/capture
- changes that make an upstream bump require manual conflict surgery every time

## Runtime Prerequisites

Forceteki server:

```bash
npm install
npm run get-cards
npm run build
npm test
```

The upstream README requires Node.js v22.x. The server exposes its game socket
at `/ws` and already has APIs such as `/api/create-lobby`, `/api/join-lobby`,
`/api/available-lobbies`, and `/api/enter-queue`.

Forceteki client:

```bash
npm install
npm run build
```

The client README also requires Node.js v22.x. The client needs a running
Forceteki server for real-game smoke testing.

PTP app:

```bash
npm run test
npm run lint
```

For documentation-only changes in `swupod`, a targeted status/diff review is
usually enough. Run the full PTP test suite before merging behavior changes.

## Phase A Smoke Gate

Run this gate before promoting any PTP runtime ref:

1. Fetch upstream server and client refs.
2. Record server/client commit hashes.
3. Confirm local PTP runtime diff avoids card/core hot spots.
4. Install dependencies.
5. Refresh card data with `npm run get-cards`.
6. Build server and client.
7. Run Forceteki server tests.
8. Boot the server and verify health plus Socket.IO `/ws` connectivity.
9. Create a limited lobby through existing vanilla APIs.
10. Start a deterministic test game far enough to prove both seats receive game
    state.
11. Verify PTP launch/callback contract tests once Unit 2 exists.
12. Save a smoke artifact containing refs, commands, pass/fail status, and any
    known card implementation gaps.

Promotion is blocked if any of these fail:

- missing or stale card data
- a card in the active PTP limited set is present in metadata but unsupported by
  runtime implementation
- server/client build failure
- Forceteki tests fail
- PTP adapter tests fail once adapters exist
- smoke game cannot create/start
- replay/result payload schema changes without a matching PTP ingestion update

## PTP Runtime Configuration

Use direction-specific credentials:

| Direction | Purpose | Example env |
|---|---|---|
| PTP -> runtime | Create official runtime games | `FORCETEKI_LAUNCH_KEY` |
| Runtime -> PTP | Send lifecycle, result, and replay/capture callbacks | `FORCETEKI_RESULT_KEY` |

Do not reuse `PTP_SERVICE_KEY` for the private runtime. The runtime must never
receive PTP database credentials.

Expected PTP env/config once Unit 2/3 exist:

| Config | Meaning |
|---|---|
| `FORCETEKI_RUNTIME_BASE_URL` | Browser/runtime origin, v1 expected to be `https://play.protectthepod.com` |
| `FORCETEKI_LAUNCH_URL` | Private server-to-server create-game endpoint |
| `FORCETEKI_LAUNCH_KEY` | PTP credential for runtime create-game calls |
| `FORCETEKI_RESULT_KEY` | Runtime credential for PTP result/replay callbacks |
| `PTP_PLAY_RUNTIME_ENABLED` | Kill switch for new queue entries and runtime launches |
| `FORCETEKI_SERVER_REF` | Pinned server commit shown in admin/support output |
| `FORCETEKI_CLIENT_REF` | Pinned client commit shown in admin/support output |

`PTP_PLAY_RUNTIME_ENABLED` should be fail-closed: missing, falsey, or unknown
values stop new runtime launches. Enable runtime launches only when both
runtime URLs are configured and the current pinned refs have passed the smoke
gate.

For local PTP development, `swupod` now supports a runtime stub so the PTP-owned
queue/result/replay loop can be exercised before the Forceteki fork exists:

| Config | Meaning |
|---|---|
| `PTP_PLAY_LOCAL_RUNTIME_STUB` | Defaults to enabled outside production. Set to `0`/`false` to force the real-runtime availability gate locally. |
| `FORCETEKI_RESULT_KEY` | Required by the server-to-server runtime callback route. Not needed for the browser local stub result route. |

## Current PTP Local Flow

The first runnable PTP-side slice is DB-backed and lives entirely in `swupod`.
It does not run real SWU rules yet; it proves the product and data path:

1. Visit `/play`.
2. Queue a built limited deck.
3. Queue a second user's built deck with the same `set_code` and `pool_type`.
4. PTP creates a `ptp_play_matches` row, two `ptp_play_seats` rows, and matched
   queue rows.
5. Each player opens their seat URL at `/play/runtime/:matchId?seatToken=...`.
6. The local runtime stub logs `runtime.loaded`.
7. A player records win/loss/draw.
8. PTP stores the result idempotently and exposes `/play/runtime/:matchId/replay`.

The PTP-side tables are:

| Table | Purpose |
|---|---|
| `ptp_play_queue_entries` | Limited queue entries and cancellation/expiry state. |
| `ptp_play_matches` | Official PTP match identity, runtime mode, result, replay URL, and seat ownership. |
| `ptp_play_seats` | Per-player launch tokens. Browsers never choose their deck or opponent. |
| `ptp_play_events` | Replay-grade events and analytics capture seed. |

The PTP API surface is:

| Route | Purpose |
|---|---|
| `GET /api/play/lobby` | Authenticated lobby read model. |
| `POST /api/play/queue` | Queue a built deck by `poolShareId`. |
| `DELETE /api/play/queue/:entryId` | Cancel a queued deck. |
| `POST /api/play/matches/:matchId/join` | Claim/open the user's official seat. |
| `GET /api/play/runtime/matches/:matchId?seatToken=...` | Verify a runtime seat and load stub session data. |
| `POST /api/play/runtime/matches/:matchId/events` | Store runtime/replay events from the verified seat. |
| `POST /api/play/runtime/matches/:matchId/result` | Local-stub result write from a verified authenticated seat. |
| `GET /api/play/runtime/matches/:matchId/replay` | Participant replay/event read model. |
| `POST /api/play/runtime/callback/result` | Server-to-server result callback authenticated by `FORCETEKI_RESULT_KEY`. |

When the real runtime fork is ready, keep the `/play` lobby and ledger as the
source of truth. Replace the local-stub launch URL with a PTP-to-runtime
create-game call that returns Forceteki/client seat URLs, then report lifecycle,
result, and replay events back through the callback/event routes.

## Runtime Origin And CORS

V1 uses `play.protectthepod.com` with short-lived seat tokens. Do not broaden PTP
session cookies across subdomains just to make the runtime work.

Runtime CORS should allow only:

- production PTP origin
- staging PTP origin
- explicit local development origins

Wildcard CORS is not acceptable for production runtime sockets or launch flows.

## Rollback And Kill Switch

Keep two controls separate:

1. **Runtime rollback:** return server/client deploys to the last known green
   refs.
2. **PTP kill switch:** stop new queue entries and runtime launches while
   keeping existing pools, stats, replays, and non-runtime play pages available.

Use the kill switch before deploys that might interrupt active games. V1 can use
maintenance windows and clear user messaging; larger launches need active-game
drain and node rotation.

## Phase A Exit Criteria

Phase A is complete only when all are true:

- private runtime server and client can boot from pinned refs
- vanilla limited lobby smoke passes
- PTP-seeded game launch is proven once Unit 2 exists
- runtime callback/result capture reaches PTP idempotently once Unit 3 exists
- replay/event batch is stored or explicitly marked missing once Unit 5 exists
- one upstream bump can be tested without manual conflict surgery
- last-known-green refs and rollback steps are documented

## Phase A Pivot Criteria

Stop and redesign before building the queue/data product if:

- PTP adapter work requires persistent local edits in card implementations
- PTP adapter work requires broad `server/game/core` edits
- upstream bumps repeatedly conflict in `Lobby.ts` or `GameServer.ts`
- replay/capture cannot be observed outside individual card logic
- the runtime cannot validate PTP-owned seats/decks without trusting browser
  payloads

## What To Hand Off To Runtime Repos

When starting the runtime fork work, create these first:

- `ptp-forceteki/docs/ptp/UPSTREAM_SYNC.md`
- `ptp-forceteki/docs/ptp/DEPLOYMENT.md`
- `ptp-forceteki/server/ptp/README.md`
- `ptp-forceteki/.github/workflows/ptp-runtime-smoke.yml`
- `ptp-forceteki-client/docs/ptp/UPSTREAM_SYNC.md`
- `ptp-forceteki-client/docs/ptp/BRANDING_AND_ROUTES.md`

Those documents should point back to this runbook as the PTP-side operating
contract.
