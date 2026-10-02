# Beta rollout integration — 2026-10-02

Status: consolidated and running locally for manual acceptance. Not pushed or deployed. This document supersedes rollout assumptions in the separate entry-flow and native-play plans; those retain implementation history.

## Canonical checkouts and checkpoints

| Work | Checkout / branch | Local checkpoint |
| --- | --- | --- |
| PTP integration (make further frontend integration fixes here) | `swupod/.worktrees/codex/beta-rollout`, `codex/beta-rollout` | merge `fc04b01c`, followed by the beta-gating commit containing this ledger |
| PTP native play and draft UI source | `swupod/.worktrees/codex/native-limited-play` | `b972e244` |
| PTP homepage and entry flow source | `swupod/.worktrees/codex/beta-entry-flow` | `4df332eb` |
| Purrgil gameplay UI | `purrgil/.worktrees/codex/native-play` | `cafea57` |
| Purrgil AI/runtime (Cursor's same checkout) | `purrgil/.worktrees/codex/native-play` | `35bc5ea` |
| Baize engine | `caldred/baize/.worktrees/codex/purrgil-pvp` | `b21436e2` |

All paths are under `~/Repos/ledwards` except Baize under `~/Repos/caldred`. No source worktree was reset. Generated screenshots, local session files, secrets, and miscellaneous preview artifacts were not included in WIP commits. Purrgil and Baize were clean at the final inventory. Cursor's future changes need another checkpoint and ledger update before release.

Merge decisions: retain the latest native branch's draft UI, theme assets/schema, import tooling, saved-deck validation and engine identity normalization; take the entry branch's single-game AI preparation/status/opponent flow. This preserves the newer draft work instead of overwriting it with the entry branch's older inherited copy.

## Local manual entry point

**http://localhost:3000/** — PTP from the integration checkout.

Sign in with a beta/admin account. Normal users and signed-out visitors see the existing homepage. Start a new draft or sealed pool, build/save, then choose onsite play or AI. The genuine table handoff is **http://localhost:4397/table/.../**, backed by **http://127.0.0.1:4331** Baize. These are real engine actions and persisted games.

**Ports 4398, 4400 and artwork-sandbox pages are visual prototypes, not gameplay acceptance environments.** Do not use them to verify resources, turn progression or card rules. Other entry preview servers are also not the canonical integration host.

PTP start: `cd ~/Repos/ledwards/swupod/.worktrees/codex/beta-rollout && npm run dev`.
The ignored local environment points only at local DB/runtime URLs. `node_modules` currently links to the native worktree's installed dependencies. Install from the lockfile when moving this branch elsewhere.
Purrgil uses the PTP local service configuration, **not Purrgil's own .env.local**, which points at deployed services. Keep existing Baize journals and pinned engine support/revision together when restarting/upgrading the engine. The running Baize binary predates the WIP checkpoint SHA; checkpointing source does not rebuild a binary.

## Gate contract

| Switch / authorization | Effect |
| --- | --- |
| `PTP_BETA_EXPERIENCE_ENABLED=true` + fresh beta/admin entitlement | New homepage, entry flow, draft table presentation and native lobby UI |
| Above + `PTP_NATIVE_PLAY_ENABLED=true` | Admit new native games |
| Above + `PTP_SOLO_AI_ENABLED=true` | Admit new AI games |
| `PTP_NATIVE_LOCAL_TESTING` | Separate development-only fixture/practice capability; **false in the manual integration environment** |

All release switches default off. Non-beta users do not gain access from flags, cookies or client-only UI state. Server routes check beta entitlement/session freshness. Existing native sessions and result reconciliation can drain after admissions are switched off; do not delete their runtime credentials to disable new games.

Restored the main-branch legacy external-play APIs, services, lobby claims and match reports. `/play` selects its UI through the server-checked beta presentation gate. Legacy/native admissions share a user lock and reject overlapping reservations. Migration 103 is now a reserved no-op: a beta release must not cancel every user's external queue/listing. **If an environment already applied the old migration, changing its file will not restore cancelled availability; audit that environment before release. Never recreate outcomes or blindly reopen old games.**

## Evidence collected

- TypeScript check passed.
- Production Next build passed with an ephemeral build-only JWT secret. The local development secret is not a production credential.
- 22 entry-flow browser tests passed (these isolate UI using mocked API responses).
- 32 focused service/auth/flag tests passed; one optional DB test skipped in that command, then explicitly run below.
- 31 restored legacy lobby/plugin tests passed against the migrated local test database.
- Two disposable PostgreSQL tests passed: legacy availability/lobby creation survives rollout; native reservations and cross-mode admission remain serialized.
- Separate real browser smoke, without API mocks: beta homepage → saved deck → AI preparation → Purrgil/Baize handoff → authoritative actions advance engine step → refresh restores seat → test match conceded. Anonymous homepage and denied presentation also checked. Repeated with the local fixture switch off.
- Initial legacy tests failed because the test database lacked native tables; migrated only `localhost/swupod_test`, then reran successfully. Initial smoke cleanup raced the AI's engine step; fetching the current step before concede fixed the harness.

The real smoke uses existing local beta/deck data in isolated browser storage; its private screenshots/session state stay untracked. It does not act on the user's pre-existing matches. This smoke is evidence of integration, not proof of every card or full draft/match lifecycle.

## Manual acceptance before shipment

- [ ] Safari desktop: sign in from a logged-out draft/sealed/deck flow, preserve/claim the pool and saved deck, return to the intended page.
- [ ] Complete a new solo draft and sealed build through the consolidated UI; verify save, reopen, AI opponent choices and launch.
- [ ] Play a full AI game: opening resources, subsequent one-card resourcing, costs, attacks, targeting, leader deploy, token creation and result return. Verify on the engine-backed table, never the sandbox.
- [ ] Two real accounts: native invitation/public matching, refresh/reconnect, mutual rematch and cancellation.
- [ ] Best-of-three progression and sideboarding: verify actual backend support; do not infer it from a setup screen.
- [ ] Spectator link: intended seat visibility only, no board mutation/concede/settings; revoke/expiry.
- [ ] Browser sizes: full hand, prompts/action controls, inspection, theme and player areas, with no vertical page scrolling.
- [ ] Flag-off and non-beta deployed-like checks, including existing external lobby creation/reporting and draining native sessions.
- [ ] Review auth/claim, admission, migrations and cross-repo API contracts on final commits; run broader repo regression suites.
- [ ] Rebuild/test the exact Baize/Purrgil release revisions, verify support catalog and engine revision pins, capture deploy/rollback order and production migration status.

## Release sequence (not executed)

1. Finish manual tweaks on this PTP integration branch and the recorded Purrgil/Baize branches; checkpoint after each coherent change. Avoid editing the same Purrgil files concurrently with Cursor.
2. Record final SHAs, finish the checks above and review consolidated diffs. Build all three pinned components together.
3. Prepare additive migrations and runtime configuration with beta flags off. Verify migration 103 has no global retirement effects and audit already-migrated environments.
4. After explicit push/deploy authorization, publish the reviewed changes, deploy compatible runtime/host versions and enable beta presentation/admission in stages.
5. Roll back admissions with flags while keeping runtime/configuration available for in-flight games and records. Non-beta behavior remains the existing site.

## Manual-test fix: homepage gate and Discord configuration

The initial integration environment omitted OAuth/signing credentials from the source checkout's ignored `.env`. Copied only the existing Discord client ID/secret and JWT signing configuration into ignored `.env.local`; forced the callback app origin to localhost and retained the local DB/runtime configuration. Restarted the host. Verified the sign-in endpoint returns a Discord redirect with a localhost callback and state cookie; interactive consent/callback remains a manual check.

Replaced the homepage's beta-shaped skeleton with a neutral loading status until authorization resolves. A delayed-session browser regression and the OAuth return-path test pass. Server startup also refreshed generated card catalog files; those data changes are not part of this UI/auth checkpoint.

## Release notes launcher

Fixed bottom-right monochrome outline button, initially closed. The `ptp_release_notes_read_v1` cookie establishes the current dated bullets as read on the first visit. Later bullets after that day, or added to that same day, count individually until the notes are opened. Historical edits before the baseline do not inflate unread. Zero has no badge. Browser checks passed for first visit, same-day additions, persistence across reloads, opening/reset, next-day additions and mobile opening; desktop/mobile screenshots reviewed. Full typecheck currently reports generated Next route-export errors in the existing stats gameplay/luck routes (not release-note code); retain as a release gate.

## Setup CTA visibility

Narrowed shared setup summaries to 340px, sized pack art against viewport height, tightened short-screen spacing and bounded deck/picker lists. Narrow-screen setup/AI primary actions remain pinned to the viewport; play selection actions appear before the deck list. Verified draft/sealed screenshots at 1440×900, 1366×768 and 1024×768: zero document overflow and CTA above fold. At 390×844 the options scroll, with CTA visible at the bottom. Mobile sealed interactions and both AI loading-layout checks passed.

### Local services and launch investigation (October 2 afternoon)

All three real services were running when the reported Play vs AI launch was
investigated. Fresh Chromium resume followed launch → PTP handoff → complete →
real table; Safari subsequently reached the same existing game and progressed
into round 1. No player decisions or concessions were made by the diagnostic.
The original transient failed navigation has not been reproduced or attributed
to a proven cause. Do not describe it as a stopped-server fix.

Separate `play:baize`, `play:purrgil`, and `play:check` commands now use explicit
local configuration. Existing services/journals were left running. All readiness
checks and the support revision check passed. Production URL validation now
requires HTTPS for public browser origins even when private service HTTP is
allowed. See `docs/operations/native-play-local.md`; production deployment and
production browser verification remain outstanding.

### Fortifications and service checkpoints

- PTP `cfd63af3`: separate local service runners/readiness command and production
  public-origin HTTPS enforcement; seven runtime-client tests passed.
- Purrgil `92a997a`: base fortifications are projected from authoritative labels,
  counted in an upper-right badge (hidden at zero), and inspectable in a dialog.
  Base damage typography is about 30% smaller. Fixed structured Unit/Base upgrade
  target decoding that caused `invalid arena` at a real fortification decision.
  Forty interaction/projection tests and the production UI build passed.
- Verified the real game reconnects at its pending fortification selection.
  Badge/dialog visual inspection used that same read-only game data in a separate
  browser, with its pending dialog locally dismissed for the visual check only;
  no engine action was submitted. Existing AI work remained outside this commit.
- Purrgil dist was rebuilt and is served on 4397. Refresh the game to load it;
  engine and gateway were not restarted and no journals were modified.
