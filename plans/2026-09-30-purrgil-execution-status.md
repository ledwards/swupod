# Purrgil execution status

Updated: 2026-09-30. Implementation in progress; services deployed, public release not enabled.

## Workspaces and services

- PTP: `codex/native-limited-play` in `.worktrees/codex/native-limited-play`, base `93a3c3d6`; existing production app unchanged.
- Purrgil: private https://github.com/ledwards/purrgil ; `codex/native-play` in its own worktree; implementation and browser interaction checks pushed at `28c779c`.
- Baize: `codex/purrgil-pvp` in its own worktree, based on upstream PR5 `64d2221d6e8a9ee58ac57ba297f23948d3dd30d4`; runtime deployed at `56478f106e9990ef7792def6823c1ddcf8c9dc8f`; branch includes HTTP smoke CI at `9bf03765`.
- Railway: separate `purrgil` and private `baize-pvp` services in the existing swupod project, each with its own persistent volume. Both deployments succeeded; public Purrgil readiness returned HTTP 200 after reaching Baize privately.
- Preview service: https://purrgil-production.up.railway.app . It requires a host-authorized seat; this is not yet a public matchmaking release.
- Custom domain registered; DNS pending: CNAME `play` → `4mxspvku.up.railway.app`. No DNS change made without account access.

## Milestones

- [x] Separate repository, isolated worktrees, pinned engine candidate and independently deployed services.
- [ ] Unit 1: contract implemented; independently measured current Karabast action parity and reviewed launch-card coverage remain gates.
- [ ] Unit 2: immutable decks, provenance, host authorization and durable result/revocation reconciliation implemented; end-to-end verification ongoing.
- [ ] Unit 3: two-human service and durable recovery implemented and tested; operational capacity and lifecycle drills remain.
- [ ] Unit 4: private invitation, seat launch, live board and mutual rematch implemented; real two-account host-to-game HTTP integration passed; browser/device and reference-parity gates remain.
- [ ] Unit 5: public lobby and queue await the explicit shared-availability product decision.
- [ ] Unit 6: seven surfaces, card treatments, layouts and efficient inputs implemented; physical-device performance/visual acceptance remain.
- [ ] Unit 7: authenticated solo server generation added; whole draft/build/play journey and pod transition remain.
- [ ] Unit 8: initial independent deployments verified; rollout, timeout policies and transition gates remain.

## Current work

- Root: cross-repository integration, deploy verification, review and this project ledger.
- PTP agent: real local two-account host/invitation/launch/result/rematch integration using an isolated PostgreSQL fixture.
- Client agent: rendered browser action-count tests, touch/keyboard behavior, crowded layouts and safe optional hand-card dragging. Attack dragging remains disabled without legal-target preview.
- Engine agent: authenticated solo sealed generation complete, with owner-bound immutable box artifacts and atomic finalization/provenance.

## Verification so far (not full release acceptance)

- Purrgil: 58 adapter/history/transport tests and seven gateway tests passed; TypeScript and production bundle passed.
- Gateway tests cover browser-bound host handoff, one-use credentials, ownership/origin checks, revocation/expiry, restart persistence and fencing after uncertain disk writes.
- Real Rust-plus-gateway integration passed: independent cookie seats, wrong-seat rejection, 12 actual actions, idempotent retry, restart of both services, concession and persisted terminal result.
- Browser manually exercised an actual Baize game through initiative, mulligan and resource selection; hidden opponent cards stayed hidden. Separate real HTTP integration now covers both authenticated PTP accounts through invitation, browser-bound launch, action retry, concession/result, exact-deck mutual rematch and logout revocation. A full natural game in two browser UIs remains a separate acceptance check.
- Baize service tests include natural rules completion, journal recovery, privacy, command races/retries, corruption/revision refusal and concession at the command cap. Actual HTTP smoke also passed.
- PTP disposable PostgreSQL tests passed migrations 096–099 reruns, competing joins, native-versus-legacy admission, immutable history, mutual rematch, delayed results and durable revocation retries. Production migrations have not run.
- Solo sealed: seven focused tests passed, including real SOR/JTL-CB generation, forged-input rejection, ownership, expiry and idempotent window finalization. Migration 100 and real solo prepare/finalize HTTP checks passed in the isolated PostgreSQL fixture.
- Rendered browser suite: 18 cases passed across desktop and phone emulation, six intentional device-specific skips; crowded screenshots inspected. No physical iPhone/iPad performance claims.

## Decisions and release gates

- User authorized execution, GitHub and Railway provisioning/deployment. No upstream merges or existing production PTP changes have been made.
- The current support manifest is explicitly an internal authored inventory, not a certified card-support allowlist. Engine authoring metadata alone cannot certify gameplay correctness.
- Historical sealed and anonymous browser-generated solo pools have no trusted generation evidence and remain ineligible; no invented provenance backfill.
- Public queue/lobby unification and native pod transition are pending user choices. Disconnect/inactivity outcomes, invite/rematch expiry and unrecoverable failure policy remain explicit release gates. Socket loss never creates a win.
- Backend and gateway currently require one replica and persistent private storage. Stop-before-start deployment, revision-pinned recovery and draining old matches constrain upgrades.
- No-extra-click acceptance is per equivalent action, not average. Additional real reference measurements and physical-device validation remain required.

## Review pass

Independent review found deck-minimum/capacity mismatches, admission-disabled cancellation, active-game relaunch after support-policy changes, completed-invitation result display and missing solo-generation tracking. Fixes and regression checks are in progress before the PTP implementation commit. Full PTP TypeScript checking passed before this review-fix pass.
