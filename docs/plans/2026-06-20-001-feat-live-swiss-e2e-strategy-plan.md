---
title: Live Swiss Practice E2E Strategy
type: feat
status: active
date: 2026-06-20
origin: docs/plans/2026-06-19-001-feat-live-swiss-practice-orchestration-plan.md
---

# Live Swiss Practice E2E Strategy

## Overview

Add layered test coverage for live Swiss Practice without making ordinary CI depend
on real Karabast. The first implemented slice is a deterministic PTP journey test:
real PTP claim/lifecycle/result services, fake Companion callbacks, real read
model, and real Swiss round advancement.

## Requirements Trace

- R1. Prove first-player Play creates one official game claim and second-player
  Play joins the same lobby once Wayfinder reports it.
- R2. Prove lifecycle callbacks update the live round read model before results.
- R3. Prove game results move a match from live/actionable to completed state.
- R4. Prove all matches finishing advances to the next Swiss round.
- R5. Keep real Karabast out of required CI; reserve it for smoke coverage.

## Scope Boundaries

- Do not automate real Karabast in the required PTP suite.
- Do not load the real Wayfinder extension in PTP CI yet.
- Do not modify Wayfinder repo from this plan; record that as a follow-up lane.

### Deferred to Separate Tasks

- Wayfinder repo: build a real Companion + fake Karabast E2E mode.
- Staging/nightly: real Companion + real Karabast smoke for create/join/lifecycle.

## Key Technical Decisions

- **Use service-level journey coverage first:** `claimPracticeMatchGame`,
  `recordPracticeMatchGameLifecycle`, `recordPracticeMatchGameResult`, and
  `fetchRoundsWithMatches` are the PTP-owned contract surface. Exercising them
  together catches orchestration, idempotency, read-model, and Swiss-pairing bugs
  without external flake.
- **Treat Wayfinder as a fake callback producer in PTP tests:** PTP owns endpoint
  behavior and state transitions; Wayfinder owns browser automation. PTP should
  test that correct callbacks drive correct state.
- **Keep real Companion tests in Wayfinder:** loading an unpacked extension and
  driving fake Karabast belongs closest to the extension code and release flow.

## Implementation Units

- [x] **Unit 1: PTP deterministic live Swiss journey**

**Goal:** Stitch the live-game pieces into one DB-backed journey test.

**Files:**
- Create: `src/services/matchmaking/liveSwissJourney.test.ts`

**Approach:**
- Seed a four-player competitive pod with round 1 pairings.
- Simulate first-player and second-player Play through `claimPracticeMatchGame`.
- Simulate Wayfinder lifecycle callbacks through `recordPracticeMatchGameLifecycle`.
- Simulate game results through `recordPracticeMatchGameResult`.
- Assert `fetchRoundsWithMatches` and `liveRoundMatchGroups` show live vs completed.
- Finish every round 1 match and assert round 2 Swiss pairings are created.

**Test scenarios:**
- Happy path: first player creates, second waits, lobby callback lands, second joins.
- Integration: lifecycle callback makes the read model show `lobby_ready` and then
  `in_progress`.
- Integration: two game results complete match 1 and move it to completed grouping.
- Integration: completing match 2 advances round 1 to complete and creates round 2.
- Edge case: round 2 pairs winners together and losers together without rematches.

**Verification:**
- The new test passes when `swupod_test` exists and migrations are current; it skips
  loudly otherwise.

- [x] **Unit 2: PTP Playwright fake Companion driver**

**Goal:** Add browser-level coverage for the same journey using two logged-in
contexts and a fake Companion event driver.

**Files:**
- Create: `tests/e2e/live-swiss-fake-companion.spec.ts`
- Reuse: `tests/e2e/test-utils.ts`

**Approach:** Use Playwright to inject Wayfinder detection, intercept practice
postMessages, and call PTP lifecycle/result endpoints from the test process.

**Verification:** Player A sees Play; Player B sees Join after lobby callback;
results move one match to Completed; all matches advance to Round 2.

- [x] **Unit 3: Wayfinder real Companion + fake Karabast prompt**

**Goal:** Hand Wayfinder the exact next implementation lane.

**Files:**
- Modify: `docs/WAYFINDER_PLUGIN_LIVE_SWISS.md`

**Approach:** Add a concise section specifying test build mode, unpacked extension,
configurable PTP/Wayfinder/Karabast origins, fake Karabast fixture behavior, and
event assertions.

**Verification:** The doc is sufficient to create a Wayfinder task without more
PTP archaeology.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Real Karabast test flake hides PTP regressions | Keep PTP CI deterministic with fake callbacks. |
| Service journey misses browser wiring | Add Playwright fake Companion as Unit 2. |
| Fake callbacks drift from Wayfinder | Keep the shared contract in `docs/WAYFINDER_PLUGIN_LIVE_SWISS.md`. |

## Sources & References

- Origin plan: `docs/plans/2026-06-19-001-feat-live-swiss-practice-orchestration-plan.md`
- Contract: `docs/WAYFINDER_PLUGIN_LIVE_SWISS.md`
- Related code: `src/services/matchmaking/liveGames.ts`
- Related code: `src/utils/matchmakingRounds.ts`
- Related code: `src/components/MatchmakingPanel.helpers.ts`
