# CPM Full UI E2E Test — Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Related:** `docs/superpowers/specs/2026-04-09-competitive-practice-mode-design.md` (CPM feature spec)

---

## Purpose

Create a true end-to-end test that exercises the entire Competitive Practice Mode (CPM) flow with 8 real users driving every action through the browser UI. The test proves — through clicks, not API calls — that a competitive draft flows correctly from creation to the final Swiss standings.

This test covers the CPM spec's §11 E2E requirement:

> Full competitive practice flow: create → draft with timers → build deck → 3 rounds of BO3 → final results

It is complementary to, not a replacement for, `tests/e2e/competitive-bo3.spec.ts` (which is an API-contract test for the Wayfinder plugin endpoint and retains its own scope).

---

## Non-Negotiable Constraint: UI-Only

Every user action in this test — from draft creation to match reporting — **must** be driven through the Playwright browser UI. Direct HTTP calls to application API routes as substitutes for user actions are forbidden. This is captured in `~/.claude/.../feedback_e2e_ui_only.md`.

The only permissible non-UI steps are the ones that cannot be driven through the UI by definition: initial user creation with JWT cookie bootstrap (identical to `multiplayer-draft.spec.ts`) and final DB cleanup.

---

## File

Single new file: `tests/e2e/competitive-cpm-full.spec.ts`

Pattern and structure modeled on `tests/e2e/multiplayer-draft.spec.ts`. Not placed in the existing `competitive-bo3.spec.ts` because that file's scope is API-contract coverage for the Wayfinder endpoint.

---

## Test Case

A single test: **"8-player CPM: create → draft → build decks → 3 rounds of BO3 → final standings"**

`test.describe.configure({ mode: 'serial' })`, `test.setTimeout(5400000)` (90 minutes), skip guard matching existing long-runners:

```ts
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (long-running integration test)'
)
```

---

## Phase 1 — Setup

1. Create 8 beta-tester test users via `createTestUser(...)` from `tests/e2e/test-utils.ts`. (Same mechanism `multiplayer-draft.spec.ts` uses — signed JWT, DB row.) This is the only non-UI step.
2. Launch one Chromium browser with `headless: false`, `slowMo: 50`.
3. Open 8 `BrowserContext` instances, install the corresponding session cookie on each, open a `Page` per context.
4. Attach a console-error listener on each page (prefix logs with player index).

## Phase 2 — Draft Creation and Join (UI-driven)

1. **Player 1** navigates to `/draft`, clicks **Create Draft**, selects the **Competitive Practice** option in the creation UI, picks a set → arrives on the pod share URL.
2. Capture the `shareId` from the URL.
3. **Players 2–8** each navigate to `${BASE_URL}/draft/${shareId}`, observe the lobby, and auto-join happens through the existing UI flow.
4. Wait (via the lobby's `.player-count` DOM element on Player 1's page) until all 8 are present.
5. **Player 1** clicks **Start Draft**.

## Phase 3 — Competitive Draft (UI-driven)

1. Each page transitions into the leader-draft phase. Each player's page clicks the first available leader card in their pick panel before the Appendix C leader timer fires.
2. Pack-draft phase begins. For each pack and each pick slot:
   - Each of the 8 pages independently clicks the first available card in its current pack before the Appendix C pack timer fires.
   - Auto-pick via timer serves as a fallback if a click is missed (timer is part of the system under test, so relying on it for a minority of picks is acceptable).
3. Between packs: **assert** the 30-second inter-pack review UI is visible on at least Player 1's page (competitive-only behavior — this confirms the review period is actually enforced in the UI).
4. After pack 3 completes, every page is routed to the deck-builder for its pool.

## Phase 4 — Deck Building (UI-driven)

1. On each of the 8 deck-builder pages, click 30 cards into the main deck (same click-based pattern used in existing draft tests). This exercises the real deck-builder flow.
2. Each page clicks **Submit Deck** (or the equivalent). The deck-build timer is *not* relied on here — it has its own test.
3. Once all 8 decks are submitted, the UI transitions to the matchmaking phase. The play page for each pool should render the `MatchmakingPanel`.

## Phase 5 — Three Rounds of Matchmaking (UI-driven)

For each round `N ∈ {1, 2, 3}`:

### 5.1 Discover Pairings from the UI

- On each of the 8 pages, read the "Your match" callout and/or the `MatchCard` for this player in the current round tab. Record the opponent's visible name/ID.
- Build a map: `playerIndex → opponentIndex` for this round.

### 5.2 Assert Pairing Integrity from the UI

- **Round 1:** assert opposite-seat pairing — player at seat `i` (1..4) is paired with player at seat `i + 4` (5..8). Seat numbers readable from the UI (lobby seat display or match card metadata).
- **Rounds 2, 3:** for every pair `(a, b)` in this round, assert that `a` and `b` have not been opponents in any prior round (checked against previously-captured round pairings). Swiss "no rematch" rule.

### 5.3 Choose a Winner per Match (Seeded)

For each non-bye match, a seeded Mulberry32 RNG decides:

- **Match outcome:** `player1`, `player2`, or `draw` (weighting: ~45/45/10).
- **Game pattern:** expand the outcome into 2 or 3 game results matching it (e.g., `player1` match outcome → `[p1, p1]` or `[p1, p2, p1]` or `[p2, p1, p1]`; `draw` outcome → one of the 1-1-1 permutations).

Seed: constant `42`, overridable via `CPM_SEED` env var.

### 5.4 Report Results via the UI (Mutual Manual Confirmation)

For each non-bye match, **both** players in the match report the same game results through the UI:

1. Each of the two players, on their own page, clicks the radio buttons for G1 / G2 / G3 in the melee.gg-style form rendered by `MatchCard` / reporting form.
2. Each clicks **Submit**.
3. After the second submission, the UI on both pages should update to show the match as **Complete** / confirmed. Assert this.

Order: player1 first, then player2 — serial within a match, but matches in the same round can be processed sequentially (no parallelism inside the test to keep the logic readable; runtime is not a priority).

### 5.5 Auto-Advance Assertion

- After all matches in round `N` are confirmed, wait (via UI polling) for every page to show round `N+1` as the active tab (or, at `N = 3`, the **Results** tab).
- **No explicit next-round action** is taken — auto-advance is part of what's being verified.

## Phase 6 — Final Results (UI-driven)

1. Each of the 8 pages clicks the **Results** tab.
2. Assert on every page:
   - 8 ranked rows rendered, ranks 1..8.
   - Each row's W-L matches the record expected from the recorded match outcomes.
   - Rank 1 has the highest match-win count (ties broken via OMW% — the test does not independently compute OMW%, it asserts that the displayed ranking is consistent with wins-desc and that ties, where present, are stable across all 8 pages).
3. Assert the pod / play page shows a matchmaking-complete indicator — exact selector to be chosen during implementation by reading `MatchmakingPanel.tsx` (a "Matchmaking complete" banner or all-rounds-complete state). If no stable selector exists, the implementation plan will add a `data-testid` to the component.

## Phase 7 — Cleanup

Standard `test.afterAll` pattern matching existing long-runners: `cleanupTestUsers(TEST_ID)`, `closeDb()`, close all contexts, close browser.

---

## What This Test Validates (via real clicks)

| Requirement (from CPM spec) | How this test proves it |
|---|---|
| Competitive draft creation UI → backend | Phase 2 click path |
| Appendix C leader + pack timers fire in UI | Phase 3 fallback on any missed click |
| 30-second inter-pack review is enforced in UI | Phase 3 assertion |
| Deck builder submit triggers round 1 start | Phase 4 transition |
| `MatchmakingPanel` / `MatchCard` render correct pairings | Phase 5.1 read + 5.2 assertions |
| Round 1 opposite-seat pairing | Phase 5.2 round-1 case |
| Swiss rounds 2–3, no rematches | Phase 5.2 rounds-2-3 case |
| Melee.gg-style reporting form → mutual confirmation | Phase 5.4 |
| Auto-advance between rounds | Phase 5.5 |
| Final standings display, 8 ranked players | Phase 6 |
| `matchmakingStatus = complete` visible in UI | Phase 6 |
| Real-time Socket.io sync across 8 tabs | Implicit throughout — every UI assertion depends on the socket pushing state to the right pages |

## Out of Scope (separate tests own these)

- **Wayfinder auto-ingestion** (server-to-server, no UI) — `competitive-bo3.spec.ts` already covers the API contract.
- **Pod owner controls** (override result, boot player, assign bye) — each warrants its own targeted test.
- **Deck auto-lock on 20-min timer expiry** — its own test.
- **Conflict resolution** when two players submit mismatching results — its own test.
- **Bot-filled competitive drafts** — this test uses 8 human users to prove the multiplayer-sync path; bot-fill is a separate test.

---

## Determinism

- Mulberry32 PRNG, seeded at test start with `Number(process.env.CPM_SEED) || 42`.
- The seed is logged at test start so a failure can be reproduced: `console.log("CPM seed:", seed)`.
- `test.describe.configure({ mode: 'serial' })` — no parallelism.
- `slowMo: 50` on Chromium launch, matching existing long-runners for timing stability.

## Runtime

Expected 30–90 minutes per run, dominated by:
- 42 picks × ~2–5s each across 8 parallel pages ≈ 10–20 min draft
- Inter-pack review periods: 2 × 30s = 1 min
- Deck-build clicking (30 cards × 8 pages): ~2–5 min
- 3 rounds × 4 matches/round × (2 submissions + UI polling) × mutual confirmation: ~10–20 min
- Round-advance wait buffers and UI stabilization: ~5–10 min

Runtime is not being optimized. The test takes as long as it takes.

## Test Commands

```bash
npm run test:e2e -- --grep "8-player CPM"
CPM_SEED=12345 npm run test:e2e -- --grep "8-player CPM"  # override seed
```

## Acceptance Criteria for the Test File Itself

- Zero `fetch(...)` calls to application API routes.
- Zero direct `db.query(...)` writes that simulate a user action (user creation and cleanup exempt).
- Every player action performed on every page is a Playwright click, fill, or navigation.
- The test is flake-resistant: explicit `waitForSelector` / `waitForFunction` on every UI transition, no arbitrary `waitForTimeout` as a substitute for state.
- Console-error observer logs errors from each player context.
- File header comment documents the test scope, runtime, and the UI-only rule.

---

## Follow-Up Work (not part of this spec)

If the MatchmakingPanel UI doesn't yet expose the data the test needs to read (e.g., opponent names, seat numbers, confirmation status) via stable DOM selectors, the test plan will identify the gap and require `data-testid` additions to the component. Any such additions are small and scope-appropriate.
