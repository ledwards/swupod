# Purrgil execution status

Updated: 2026-09-30. Implementation in progress; services deployed, public release not enabled.

## Workspaces and services

- PTP: `codex/native-limited-play` in `.worktrees/codex/native-limited-play`, base `93a3c3d6`; design/plan committed at `6222a977`, host implementation at `858b49b7`; existing production app unchanged.
- Purrgil: private https://github.com/ledwards/purrgil ; `codex/native-play` in its own worktree; visual restoration and archived replay deployed at `b25775e`. [Review PR](https://github.com/ledwards/purrgil/pull/1).
- Baize: `codex/purrgil-pvp` in its own worktree, based on upstream PR5 `64d2221d6e8a9ee58ac57ba297f23948d3dd30d4`; record-capable runtime deployed at `4f49c0f`; branch includes HTTP smoke CI. [Review PR](https://github.com/caldred/baize/pull/6).
- Railway: separate `purrgil` and private `baize-pvp` services in the existing swupod project, each with its own persistent volume. Both deployments succeeded; public Purrgil readiness returned HTTP 200 after reaching Baize privately.
- Preview service: https://purrgil-production.up.railway.app . It requires a host-authorized seat; this is not yet a public matchmaking release.
- Custom domain registered; DNS pending: CNAME `play` → `4mxspvku.up.railway.app`. No DNS change made without account access.

## Milestones

- [x] Separate repository, isolated worktrees, pinned engine candidate and independently deployed services.
- [ ] Unit 1: contract implemented; independently measured current Karabast action parity and reviewed launch-card coverage remain gates.
- [ ] Unit 2: immutable decks, provenance, host authorization and durable result/revocation reconciliation implemented; end-to-end verification ongoing.
- [ ] Unit 3: two-human service and durable recovery implemented and tested; operational capacity and lifecycle drills remain.
- [ ] Unit 4: private invitation, seat launch, live board and mutual rematch implemented; real two-account host-to-game HTTP integration passed; browser/device and reference-parity gates remain.
- [ ] Unit 5: native shared public lobby/queue and primary UI implemented; real public-to-replay smoke passed; production cutover remains.
- [ ] Unit 6: seven surfaces, card treatments, layouts and efficient inputs implemented; physical-device performance/visual acceptance remain.
- [ ] Unit 7: authenticated solo server generation added; whole draft/build/play journey and pod transition remain.
- [ ] Unit 8: independent deployments verified; rollout, timeout policies and transition gates remain.
- [ ] Unit 9: both-seat durable records, immutable archives, replay and admin training export implemented and verified; long-game load, retention and existing stats integration remain.

## Current work

- Root: cross-repository integration, deploy verification, review and this project ledger.
- PTP agent: integration and review fixes complete; isolated local fixture remains available.
- Client agent: native public entry/replay actions and homepage lobby cleanup implemented; prototype depth, responsive hand fan and 0/30 base-damage display complete; visible Draw captions removed. Phone controls no longer cover cards and ordinary desktop hands fit at 1280×850. Attack dragging remains disabled without legal-target preview.
- Engine agent: authoritative runtime, authenticated solo provenance and independent host review/fixes complete.

## Verification so far (not full release acceptance)

- Purrgil: 58 adapter/history/transport tests and seven gateway tests passed; TypeScript and production bundle passed.
- Gateway tests cover browser-bound host handoff, one-use credentials, ownership/origin checks, revocation/expiry, restart persistence and fencing after uncertain disk writes.
- Real Rust-plus-gateway integration passed: independent cookie seats, wrong-seat rejection, 12 actual actions, idempotent retry, restart of both services, concession and persisted terminal result.
- Browser manually exercised an actual Baize game through initiative, mulligan and resource selection; hidden opponent cards stayed hidden. Separate real HTTP integration now covers both authenticated PTP accounts through invitation, browser-bound launch, action retry, concession/result, exact-deck mutual rematch and logout revocation. A full natural game in two browser UIs remains a separate acceptance check.
- Baize service tests include natural rules completion, journal recovery, privacy, command races/retries, corruption/revision refusal and concession at the command cap. Actual HTTP smoke also passed.
- PTP disposable PostgreSQL tests passed migrations 096–099 reruns, competing joins, native-versus-legacy admission, immutable history, mutual rematch, delayed results and durable revocation retries. Production migrations have not run.
- Solo sealed: seven focused tests passed, including real SOR/JTL-CB generation, forged-input rejection, ownership, expiry and idempotent window finalization. Migration 100 and real solo prepare/finalize HTTP checks passed in the isolated PostgreSQL fixture.
- Rendered browser suite: 24 cases passed across desktop and phone emulation, eight intentional device-specific skips; crowded screenshots inspected. No physical iPhone/iPad performance claims.

## Decisions and release gates

- User authorized execution, GitHub and Railway provisioning/deployment. No upstream merges or existing production PTP changes have been made.
- The current support manifest is explicitly an internal authored inventory, not a certified card-support allowlist. Engine authoring metadata alone cannot certify gameplay correctness.
- Historical sealed and anonymous browser-generated solo pools have no trusted generation evidence and remain ineligible; no invented provenance backfill.
- Public queue/lobby unification is now selected for implementation. Native pod transition remains a separate decision. Disconnect/inactivity outcomes, invite/rematch expiry and unrecoverable failure policy remain explicit release gates. Socket loss never creates a win.
- Backend and gateway currently require one replica and persistent private storage. Stop-before-start deployment, revision-pinned recovery and draining old matches constrain upgrades.
- No-extra-click acceptance is per equivalent action, not average. Additional real reference measurements and physical-device validation remain required.

## Review pass

Independent review found deck-minimum/capacity mismatches, admission-disabled cancellation, active-game relaunch after support-policy changes, completed-invitation result display and missing solo-generation tracking. All six findings were fixed before the host implementation commit. Full PTP TypeScript checking and 29 focused tests passed afterward; the actual two-account HTTP integration passed again. Five Chromium host-flow tests and real PostgreSQL generation-tracking retry checks also passed. The full production Next build passed against isolated local fixture configuration. TypeScript and design-system ratchets passed; five new host CSS colors were replaced with existing tokens.

## Latest visual acceptance

The actual running Baize game was reloaded in the in-app browser after the visual change: both base counters show 0/30, no Draw captions remain, and the complete six-card fan is visible at 1237×863. Desktop and phone fixture screenshots also verify raised card edges, recessed arena surfaces, dense layouts and unobstructed phone hand controls. These checks are separate from physical-device acceptance.

## Active follow-on phase

User authorized replacement of external limited matchmaking and complete both-seat game capture. Assignments: PTP agent native public availability/eligibility; client agent primary Play UI; engine agent durable both-seat record export and Purrgil replay; root plan, legacy retirement, immutable host archives, training export and integration. Migration 101 belongs to queue; 102 to archives.

## Public-play and records implementation checkpoint

- Native public service/routes and migration 101 implemented: one shared public listing/queue, oldest compatible matching, explicit join, cancellation, immutable snapshots, shared private/public admission and authoritative saved-deck eligibility. The backend agent reports real PostgreSQL race checks passing; real cross-service verification also passed below.
- Primary `/play` replaced with native Find game/open tables/private invitations. Public waiting seats resume and auto-launch when matched. Fifteen Chromium host browser contract tests passed (API doubles), including retry identity, cancellation, blockers, explicit join, recovered waiting-seat launch and replay-pending retry. Desktop/390px layouts inspected.
- Existing builder completion URL redirects to native Play while retaining save-before-play. Requested unsupported formats remain visible with explicit backend blockers. Homepage/lobby board entry now routes to native Play beside the existing pod list; external lobby polling hooks are removed from those entry components. Deck stats no longer require a Companion install to offer Play deck.
- Both-seat record export, immutable host archive/training routes (migration 102), authenticated replay launch and Purrgil read-only replay are implemented in the current worktrees. Actual end-to-end records and replay verification passed below.
- Replay UI handles archive-pending errors without manufacturing a replay; users retry the ordinary Watch replay action. Native records do not yet imply aggregation into every existing historical stats tab.

### Outstanding release work

The exact cutover checklist is in the plan's **Execution checkpoint — public entry and archive cutover** section. Remaining work comprises production host migrations/configuration/cutover; safe legacy resume and organized-pod/Swiss transition; certified card coverage and paired action parity; physical-device acceptance; lifecycle/capacity/recovery/drain policy; and custom-domain DNS/TLS plus staged admission. Draft/builder skeuomorphic redesign and broader homepage restructuring remain later units, not completed by these focused entry changes.

The latest public/record code is not represented by the earlier deployed-preview commit hashes above until root records a new deployment. No production migration or public admission is implied by this checkpoint.

### Verified real public-to-record integration

Root reports `scripts/native-play/verify-local-records.ts` passed against the isolated local PostgreSQL, real Baize and Purrgil stack (match `7ed5ba9a-1dfa-416d-8518-c43a0d265a20`). It covered public Find game pairing, a real engine action, concession, terminal-only both-seat immutable/idempotent archival, administrative pre-action training privacy, internal authorization/membership, both-seat bound replay sessions and rejection of replay mutations. This closes the basic real HTTP public-to-archive/replay smoke gate; it does not establish a natural full browser game, physical-device acceptance, production cutover or certified card coverage. No production deployment was performed for this follow-on evidence.

### Final follow-on verification and deployment

- PTP full TypeScript and production Next build passed. The first build attempt inherited development NODE_ENV from the fixture; rerunning with production NODE_ENV passed. Generated build-only tsconfig entries were removed. TypeScript/design ratchets pass.
- Twenty-eight focused host tests passed including disposable PostgreSQL native admission/migration regression; separate public PostgreSQL acceptance covered concurrent Find/Join/cancel, frozen decks, rate limiting and safe retry. Fifteen host browser cases passed including committed-but-lost admission response, cancellation retry retirement and correct reserved-deck display.
- Real public → action → completion → immutable record → both-seat replay → training privacy smoke passed. Four review findings (three client recovery/display issues and missing admission churn limit) were corrected and retested.
- Baize record implementation pushed at `4f49c0fac2ab7330874d429b998d4e443364387c`; Purrgil replay pushed at `b25775e70b15999d99be9886c9af60d70349a896`.
- Railway Baize deployment `04610f4e-b014-40fc-b209-f52f630aca16` and Purrgil deployment `f81bcd9e-216a-44d2-af6a-92d5178af29e` both SUCCESS. Engine persistent storage had zero journal JSON files before revision upgrade. Public gateway `/ready` returns ready=true through the private engine.
- Upstream Baize PR5 is now merged into `swu-full-card-pool`; the PvP PR targets that branch. No PTP production migrations or admissions were enabled.
- Public waiting-seat expiry/presence, organized Swiss migration, broad stats aggregation, certified support, physical devices and long-game storage/load remain explicit release work. Waiting-seat expiry must release availability without inventing a game result. The host cutover PR remains draft until these gates are addressed.

Thirteen affected legacy-route/service tests passed with zero skips against an isolated PostgreSQL database; migration103 rerun and preservation checks passed separately.
