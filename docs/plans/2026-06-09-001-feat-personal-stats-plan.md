---
title: "feat: Personal Stats — Your Pulls, Luck, and Activity"
type: feat
status: active
date: 2026-06-09
deepened: 2026-06-09
origin: docs/brainstorms/2026-06-09-personal-stats-requirements.md
---

# feat: Personal Stats — Your Pulls, Luck, and Activity

## Overview

Add a new "Your Stats" section alongside the existing competitive-meta tables on
`/stats`. Surfaces three pillars for the logged-in user: an Activity dashboard
(packs, pools, drafts, decks, decks that hit the play page), a Luck analyzer
across rarity / aspect / specific-card streaks with rigorous per-set baselines,
and a scope toggle between "packs I opened" and "what I kept." Each luck panel
uses a three-layer presentation: plain-English headline, distribution visual,
and an expandable math drawer.

This plan does not change the existing per-set card tables, leader stats,
Tournament/Top comparisons, the Patreon gating that protects them, or the
default-tab behavior on /stats. The new section is purely additive.

**Rework log:** The original draft of this plan (2026-06-09 morning) was
reviewed by seven persona reviewers and revised the same day. Critical fixes:
draft pack-rotation formula (was wrong), `card_generations.user_id` population
for drafts (was missing entirely → added U9), column names (`seat_number` not
`seat_position`, `built_at` not `created_at`), belt-driven distribution scope
(narrowed v1 to non-belt dimensions only), default-tab change (reverted),
statistical primitives (now reused from `packQualityService`), IDOR check on
play-visit POST, rate limiting and `Vary: Cookie` on all personal endpoints.

---

## Problem Frame

`/stats` is built for competitive-meta research. The existing "You" column lives
inside that frame and answers a different question than the one many players
have when they arrive: "Am I unlucky? Do I get too many crappy Legendaries? Why
does my pool look so blue?"

The data is already collected: `card_generations` records every card generated
in every pack (set, rarity, treatment, source) and migration 018 added a
`user_id` column that's populated on pool creation and draft completion. The
missing pieces are (a) a section of the app that frames that data around the
individual user, (b) statistical baselines for honest "is this unusual" verdicts
derived from how packs are actually designed, and (c) a tracking signal for
"this deck made it to the play page."

See origin: [docs/brainstorms/2026-06-09-personal-stats-requirements.md](../brainstorms/2026-06-09-personal-stats-requirements.md).

---

## Requirements Trace

- R1. New section on `/stats`, additive — existing per-set tables untouched (origin R1).
- R2. Discord-login gated; not Patreon-gated (origin R2).
- R3. Activity totals: packs opened, pools opened, drafts joined, decks built, decks that hit play (origin R3).
- R4. Play counted on any visit to a play-page route, dedup per pool/deck (origin R4).
- R5. Activity respects the existing date-range picker; "Lifetime" preset available (origin R5).
- R6. Scope toggle: "Packs I opened" (default) vs "What I kept" (origin R6).
- R7. Per-set selector; default to most-recent set with user activity (origin R7).
- R8. Three luck dimensions: rarity, aspect, specific-card streaks (origin R8).
- R8a. Rigorous baselines from card-pool composition × slot odds, not observed averages (origin R8a).
- R9. Three-layer presentation per dimension: headline → visual → expandable math (origin R9).
- R10. Three verdict regimes: insufficient sample / normal / unusual (origin R10).
- R10a. Sample-size cutoff derived per dimension via power calculation, not hardcoded (origin R10a).
- R11. Streak callouts only when statistically interesting (origin R11).
- R12. Friendly empty state when user has no pulls for selected set (origin R12).
- R13. "Tracking started YYYY-MM-DD" line when card_generations cutoff truncates user history (origin R13).
- R14. Logged-out: explanation + sign-in CTA, no sample data (origin R14).

**Origin actors:** A1 (logged-in player), A2 (logged-out visitor).
**Origin flows:** F1 (investigate suspicion of bad luck), F2 (skim activity), F3 (switch luck scope).
**Origin acceptance examples:** AE1 (covers R9/R10 insufficient sample), AE2 (covers R9/R10 unusual), AE3 (covers R6 scope switch), AE4 (covers R11 streak), AE5 (covers R4 play page).

---

## Scope Boundaries

- Treatment distribution (foil / hyperspace / showcase) — explicitly deferred to v2 per origin Key Decisions.
- Public profiles or shareable luck reports — out.
- Head-to-head luck comparison against specific other users — out.
- Predictive recommendations ("open N more packs to converge") — out.
- Patron-gating on personal stats — explicitly free for any logged-in user.
- Modifying the existing per-set card tables, leader stats, Tournament/Top comparisons, or their Patreon gates — explicitly out. The new section sits beside them; their files are not touched.

---

## Context & Research

### Relevant Code and Patterns

- [migrations/014_card_generations.sql](../../migrations/014_card_generations.sql) — base schema for per-card generation tracking (set, rarity, aspects, treatment, pack_type, slot_type, source_type, source_id).
- [migrations/016_add_pack_index.sql](../../migrations/016_add_pack_index.sql) — `pack_index` column on `card_generations` already exists; this is the key to derive "packs I opened" in draft.
- [migrations/018_add_user_id_to_generations.sql](../../migrations/018_add_user_id_to_generations.sql) — `card_generations.user_id` already exists with indexes on `(user_id)`, `(user_id, treatment, card_type)`, and `(user_id, set_code)`. Sets up sealed/draft "what I kept" queries to be one-join cheap.
- [migrations/061_create_pool_views.sql](../../migrations/061_create_pool_views.sql) — pattern for tracking per-user page visits with UPSERT-on-revisit; the play-page tracking table mirrors this shape exactly.
- [app/api/stats/draft-picks/route.ts](../../app/api/stats/draft-picks/route.ts) — established pattern for stats endpoints with `userId`, `since`, `until`, `setCode` query params and 5-minute cache headers.
- [app/api/stats/packs/route.ts](../../app/api/stats/packs/route.ts) — established pattern for grouping `card_generations` by `(source_id, pack_index)` to enumerate packs.
- [app/stats/page.tsx](../../app/stats/page.tsx) — existing page with tabs (`LAW`, `SEC`, `LOF`, …), `StatsCell` stacked-row pattern, `StatsLegend` toggleable groups, date-range picker, `useAuth`/`isPatron` gating, hash-driven tab state.
- [app/stats/StatsCharts.tsx](../../app/stats/StatsCharts.tsx) — established chart component pattern for the page.
- [src/utils/setConfigs/LAW.ts](../../src/utils/setConfigs/LAW.ts) and siblings — per-set `cardCounts`, `rarityWeights`, `upgradeProbabilities`, `beltRatios`. The authoritative source for slot odds and pool composition.
- [src/utils/packConstants.ts](../../src/utils/packConstants.ts) — global pack constants (rarity weights, upgrade rates, slot composition).
- [src/belts/](../../src/belts/) — belt classes that codify pack-generation behavior. Reference for slot-level odds when set-config flags don't cover a case.
- [src/data/cards.json](../../src/data/cards.json) — authoritative card pool (used by `getAllCards()` and `buildCardLookupMaps()` in `src/utils/cardNormalization.ts`).
- [src/components/DeckBuilder/StickyInfoBar.tsx](../../src/components/DeckBuilder/StickyInfoBar.tsx) and [DeckBuilderHeader.tsx](../../src/components/DeckBuilder/DeckBuilderHeader.tsx) — the Play button origin; navigates to the play page routes.
- [app/pool/[shareId]/deck/play](../../app/pool) and `app/formats/pack-blitz/[shareId]/play`, `app/formats/pack-wars/[shareId]/play` — the three play page routes the metric covers.
- [src/contexts/AuthContext](../../src/contexts) — `useAuth()` for `user`, `isPatron`, `is_admin`.

### Institutional Learnings

- `.claude/rules/testing.md` — spec-first testing rule is load-bearing for this plan. Expected baselines must come from `packConstants.ts` and `setConfigs/*.ts`, NOT from observed averages in `card_generations`. Statistical tests that derive expected from the data they're testing are anti-pattern.
- `.claude/rules/architecture.md` — services pure, no React or I/O. Statistical computation goes in `src/services/`, component-level state in `src/hooks/`, UI in `src/components/`.
- `.claude/rules/database.md` — migrations run at server startup and must be idempotent.
- `.claude/rules/ui-components.md` — use the `Button` component (variants: primary/secondary/danger/toggle); icon+text needs `gap: 8px`.
- `STACKED_STATS.md` — existing You/All/Top/Tournament stacked-cell pattern. The new Your Stats section does NOT use this pattern (it is single-actor), but the legend/filter UI conventions are reusable.

### External References

None gathered — the work is well-patterned in the codebase and the statistical
methods (binomial / Poisson approximation, two-sided p-values, power calculation
for minimum detectable effect) are textbook. If the planner discovers a gap
during implementation around minimum-sample thresholds, a power-calculation
reference is worth pulling in then.

---

## Key Technical Decisions

> **Revised 2026-06-09** after document review. The original plan contained several critical errors flagged by reviewers — pack-rotation math, missing user_id population for drafts, wrong column names, multinomial baseline assumption, default-tab regression, missing rate limiting and IDOR check. These have been replaced below.

- **Track play-page visits in a new `deck_play_visits` table** rather than extending `pool_views`. Pool views and play-page hits are semantically different events with different downstream consumers (the existing pool-views feeds History's Shared tab); coupling them risks surprising the History feature later. Mirror the `pool_views` shape: `(id, user_id, pool_id, first_visited_at, last_visited_at)` with a `(user_id, pool_id)` unique constraint and UPSERT on revisit.

- **Derive draft pack opener from `pack_index` + `pod_players.seat_number` via a small helper.** Reading `app/api/draft/[shareId]/start/route.ts:116` and `src/utils/draftLogic.ts:104` shows packs are written with `packIndex = playerIndex * packsPerPlayer + packNum` (standard mode) and `packIndex = packNum * playerCount + playerIndex` (chaos mode). The correct inversion is therefore mode-dependent:
  - Standard: `seat_number = floor(pack_index / packsPerPlayer)`
  - Chaos: `seat_number = pack_index % playerCount`
  - Implementation lives in `src/utils/packOpenerSeat.ts` with unit tests against the generator. The column is `seat_number`, NOT `seat_position` (the latter does not exist in the schema).

- **`card_generations.user_id` is NOT populated for modern draft data.** Verified via `app/api/draft/[shareId]/start/route.ts:118` (`userId: null at generation`) and a codebase-wide grep for `UPDATE card_generations` (only the cancel path and migration 020 host backfill). The "kept" scope for drafts must be computed from `card_pools.cards` JSONB joined to `card_generations` by `(card_id, pack_index, source_id)`, NOT from `card_generations.user_id` directly. Alternatively, a write-path fix (new unit U9) can populate `card_generations.user_id` on pool creation. Plan picks the write-path fix because it's simpler at query time. See U9.

- **Reuse statistical primitives from `src/services/packQualityService.ts`** (z-score, Wilson confidence intervals, four-regime classifier). Extract the math core to `src/utils/stats.ts` so both packQuality and the new luck analysis share one implementation of the underlying calculations. Eliminates the risk of two diverging approximations and roughly halves the test surface for U4.

- **Belt-driven distributions are not per-slot independent.** `.claude/rules/belt-system.md` explicitly states HS upgrades are budgeted in cycles of 60 packs (max 2 per pack), and UC3→Prestige takes priority over UC3→HS R/L. The per-slot × pool-composition multinomial gives wrong CIs (too tight) for any belt-driven dimension. Plan resolution: **v1 luck verdicts cover only rarity and aspect distributions in the base belt path**. Treatment, HS, and prestige dimensions are deferred (already in scope boundaries). Per-card streaks are restricted to the base (non-belt) cards; explicitly excluded from streak detection: HS variants, prestige cards, showcase variants. Implementation reads `src/belts/` to enumerate which cards come from which belts and excludes the belt-managed ones.

- **Pure-function `expectedDistribution` and `luckVerdict` services live in `src/services/`** and import from `src/utils/stats.ts`. `expectedDistribution` computes per-pack expected rates from set configs + card pool for the rarity and aspect dimensions only (treatment/HS not handled). `luckVerdict` adds the copy templates and streak-filter predicate around the shared stats core.

- **Sample-size cutoff is a documented tunable, not a derivation.** The original "derived from a power calculation" framing implied data-driven precision but the underlying target-effect constant was itself a hardcoded knob. Honest framing: three named constants in `src/utils/stats.ts` — `MIN_PACKS_RARITY`, `MIN_PACKS_ASPECT`, `MIN_PACKS_PER_CARD` — each documented with its derivation rationale (the smallest n where a 95% CI excludes a 50% relative deviation at the median per-pack rate of that dimension). The math is performed once during development and the resulting integers are checked in. Tunable post-launch if telemetry shows the "insufficient" regime fires too often.

- **Two new API endpoints**: `/api/stats/me/summary` (activity totals) and `/api/stats/me/luck` (luck dimensions per set). They mirror the `app/api/me/*` authenticated namespace (not the public `/api/stats/draft-picks` pattern). Cache header: `Cache-Control: private, max-age=60` PLUS `Vary: Cookie` for defense-in-depth against header-regression mis-caching on the edge.

- **Rate limiting on all three new endpoints via the existing `applyRateLimit` helper used across `app/api/me/*`**. Personal endpoints are auth-gated and per-user; rate limiting is consistent with the namespace and prevents flooding of `deck_play_visits` or hammering of the luck endpoint with varied query params (which bypass the per-URL cache).

- **POST `/api/me/play-visit` verifies pool ownership/accessibility, not just shareId resolution.** A logged-in user passing another user's `shareId` must get 403 and no row written. Use the existing pool-access helper that already gates `app/api/pools/[shareId]/*` reads.

- **Mount as a new tab on `/stats` without changing the default.** The hash anchor `#you` selects it. Logged-in users with no hash continue to land on the existing default set tab (LAW); the You tab is one click away in the tab strip. This preserves both the bookmark UX and the Patreon-CTA conversion surface that fires on set tabs. Reverts the originally-planned default-flip.

- **Bots excluded from "your pulls"** at the query level — every personal endpoint filters to `user_id = $authUserId` AND every join through `pod_players` carries an explicit `AND pp.user_id = $authUserId AND pp.is_bot = false` so the seat-based opener derivation cannot accidentally include bot rows in adversarial pod configurations.

- **`packsOpened` semantics**: the v1 definition is **"packs you personally cracked"** — for sealed, every pack in pools you own; for draft, exactly `packsPerPlayer` per draft you joined (3 in a standard pod). NOT "packs you saw" (24 per draft) and NOT "packs you kept at least one card from." Matches the brainstorm's literal phrasing and the user's mental model. UI label: "Packs cracked." Same definition for the activity counter and the luck-scope baseline.

- **`poolsOpened` filters by pool type**: `pool_type IN ('sealed', 'draft')` — imported pools (where the user uploaded a physical pull) and bot-generated pools are excluded so the counter stays consistent with `packsCracked`.

---

## Open Questions

### Resolved During Planning

- Schema for play-page tracking: new `deck_play_visits` table, not an extension of `pool_views`.
- Mount: new tab on `/stats`, hash anchor `#you`, default unchanged.
- Pack opener attribution: mode-dependent helper `packOpenerSeat()` in `src/utils/packOpenerSeat.ts`. Standard mode `floor(pack_index / packsPerPlayer)`, chaos `pack_index % playerCount`. Column is `seat_number`.
- "Kept" scope attribution for drafts: new unit U9 backfills `card_generations.user_id` on pool creation. "Kept" queries can then be one-join cheap for both formats.
- Endpoint namespace: `/api/me/*` for authenticated personal endpoints (not the public `/api/stats/*` pattern). Rate limiting via existing `applyRateLimit`.
- Cache strategy: `Cache-Control: private, max-age=60` + `Vary: Cookie`.
- Belt-mechanics scope: v1 luck verdicts cover only rarity and aspect in the base belt path. Treatment/HS/prestige/showcase out (already in scope boundaries). Streak detection excludes belt-managed card variants.
- Statistical primitives: extract z-score/Wilson CI/four-regime classifier from `packQualityService.ts` into shared `src/utils/stats.ts`. luckVerdict reuses, doesn't reimplement.
- Sample-size cutoff: three documented integer constants in `src/utils/stats.ts`, derived once during development. Not a runtime power calculation.
- Default tab change reverted — existing default behavior preserved.
- `packsOpened` definition: packs the user personally cracked. UI label "Packs cracked." Excludes packs seen but not cracked (in draft, the 21 packs passed to you from other seats don't count).
- `poolsOpened` filter: `pool_type IN ('sealed', 'draft')` — excludes imported and bot-generated pools.
- `decksBuilt` semantics given `built_decks UNIQUE(card_pool_id)`: relabel as "Decks built" but the underlying count is "pools with a built deck." Acceptable trade-off; rename to "Pools with decks" if user testing shows confusion.
- IDOR on play-visit: pool ownership verified server-side via existing pool-access helper.
- ASH set inclusion: add ASH to the per-set selector once ASH activity exists; mirror existing /stats tab behavior on whether ASH appears in the outer tab strip.

### Deferred to Implementation

- **Pack-Blitz and Pack-Wars play tracking**: confirm a single instrumentation point covers all three play routes or wire one per route.
- **Default-set logic for the per-set selector**: most-recent set with any pull vs with a saved deck vs with the latest pool created. Pick at implementation time based on which gives the friendliest empty-rate.
- **Aspect-pool composition cache**: per-set, per-rarity aspect distributions can be computed once at module-load time. Confirm `getAllCards()` is safe to call at module scope, or wrap behind a memoized accessor.
- **Dropped-draft filtering for luck analysis**: should the "opened" scope include packs from drafts the user dropped mid-pod? Lean toward including them (the packs were still cracked) and adding a UI tooltip if user testing surfaces confusion.
- **Loading and error state copy** for every fetch surface — what the activity dashboard renders while `/api/stats/me/summary` is in flight, what the luck panels render during a scope toggle re-fetch, what the error states say. Right-sized at implementation time using existing skeleton/empty-state patterns in `app/stats/page.tsx`.
- **Show-math drawer content shape** — rarity is four rows, aspect is six rows, streaks have per-card p-values already inline. Implementation picks the table shape per dimension; lean toward a single drawer per panel with a small table.
- **DistributionChart type per dimension**: rarity is a single curve (one number → curve plot fits); aspect has six values (probably a stacked bar with expected-vs-observed rather than a curve). Implementation chooses chart type per dimension based on which renders intelligibly.
- **Streaks list cap and sort order**: default to top 10 by p-value ascending, with "show all" expansion. Confirm at implementation.
- **Set selector control type**: Button variant="toggle" row vs native select vs custom dropdown. Lean toward Button toggle row for consistency with the scope toggle, but native select may be better on mobile.
- **Mobile breakpoints and accessibility specifics** — activity row wrap behavior, "you are here" pin shape (not just color) for color-blind users, chart aria-label, keyboard focus on the show-math expander. Implementer follows project conventions in `app/stats/stats.css` and the style guide.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌──────────────────────────────────────────────────────────────────┐
│  app/stats/page.tsx                                              │
│  ┌─[LAW][SEC][LOF][JTL][TWI][SHD][SOR][You ◀── NEW tab]──────┐   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  When `You` tab active → render <YourStats /> (new component)    │
│  Otherwise unchanged: SealedTab / DraftTab                       │
└──────────────────────────────────────────────────────────────────┘

<YourStats>
  ├─ ActivityDashboard
  │    └─ GET /api/stats/me/summary?since&until
  └─ LuckSection (set selector, scope toggle: "opened"|"kept")
       └─ GET /api/stats/me/luck?setCode&scope&since&until
            ├─ RarityPanel  (headline + bell-curve + show-math)
            ├─ AspectPanel  (headline + bell-curve + show-math)
            └─ StreaksPanel (list of statistically-interesting cards)

Server side
───────────
/api/stats/me/summary
  ↳ queries card_generations / card_pools / pods / pod_players / built_decks /
    deck_play_visits all filtered by user_id

/api/stats/me/luck
  ↳ queries card_generations + pod_players for draft scope=opened
       (scope="opened" in draft: join through pod_players, seat-match via
        packOpenerSeat(pack_index, packsPerPlayer, playerCount, isChaos))
       (scope="opened" in sealed: card_pools.user_id = $authUserId)
       (scope="kept" in both: card_generations.user_id = $authUserId, requires U9 backfill)
  ↳ feeds raw counts into:
       src/services/expectedDistribution.ts  (pure, rarity + aspect only)
       src/services/luckVerdict.ts           (pure, reuses src/utils/stats.ts)
  ↳ returns: { observed, expected, verdict, pValue, ci, copy } per dimension
              plus streaks[] capped at 10

src/services/expectedDistribution.ts
  ↳ input: { setCode, packsCracked }
  ↳ derives per-pack rates from setConfigs/<set>.ts + cards.json
  ↳ EXCLUDES belt-managed variants (HS, prestige, foil-slot, showcase)
  ↳ output:
       perPackExpected = {
         rarity:  { Common, Uncommon, Rare, Legendary }  // R/L split by beltRatios.rareToLegendary
         aspect:  { Vigilance, Command, …, Neutral, Multicolor }
         cards:   Map<cardId, rate>  // base-belt cards only
       }
       expectedTotal = perPackExpected × packsCracked

src/services/luckVerdict.ts  (consumes src/utils/stats.ts)
  ↳ input: (observed, expected, n, dimension)
  ↳ output: { regime: 'insufficient'|'normal'|'unusual',
              pValue, ci, copy: 'plain-English headline' }
  ↳ sample-size cutoff: integer constants MIN_PACKS_RARITY|ASPECT|PER_CARD
                        (documented once, checked in, not runtime-derived)
```

---

## Implementation Units

- [ ] U1. **Schema — `deck_play_visits` table**

**Goal:** Persist a per-user record of which decks/pools the user has reached the play page for, with UPSERT-on-revisit semantics.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Create: `migrations/066_create_deck_play_visits.sql`
- Test: `migrations/066_create_deck_play_visits.test.js` (optional, run via existing migration test harness if present)

**Approach:**
- Mirror `pool_views` shape exactly: `(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE, first_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`.
- Unique constraint on `(user_id, pool_id)` so UPSERT bumps `last_visited_at`.
- Index `(user_id)` for the activity-count query.
- Idempotent — guard with `CREATE TABLE IF NOT EXISTS`.
- Use a column-name choice that distinguishes from `pool_views.viewed_at` so the two tables are unambiguously different in queries: `first_visited_at` + `last_visited_at` (not `viewed_at`).

**Patterns to follow:**
- [migrations/061_create_pool_views.sql](../../migrations/061_create_pool_views.sql) — schema, constraint, index pattern.

**Test scenarios:**
- Test expectation: none — pure schema. Verification is migration apply/rollback in a fresh DB.

**Verification:**
- Migration runs cleanly on a fresh DB and on an existing one without error.
- Re-running the migration is a no-op (idempotent).
- A test INSERT + INSERT-ON-CONFLICT-UPDATE on `(user_id, pool_id)` bumps `last_visited_at` and leaves `first_visited_at` untouched.

---

- [ ] U2. **Instrument play page routes to record visits**

**Goal:** When a logged-in user navigates to any of the three play page routes, record an UPSERT into `deck_play_visits`.

**Requirements:** R4

**Dependencies:** U1

**Files:**
- Create: `app/api/me/play-visit/route.ts` — POST endpoint receiving `{ poolId }`, requiring auth, upserting into `deck_play_visits`.
- Modify: `app/pool/[shareId]/deck/play/page.tsx` — fire-and-forget POST to `/api/me/play-visit` on mount (logged-in users only).
- Modify: `app/formats/pack-blitz/[shareId]/play/page.tsx` — same instrumentation.
- Modify: `app/formats/pack-wars/[shareId]/play/page.tsx` — same instrumentation.
- Test: `app/api/me/play-visit/route.test.ts`

**Approach:**
- Implementation discovers whether the three play pages share a common layout/component that can carry the instrumentation in one place. If yes, instrument once. If not, three small `useEffect` hooks.
- Fire-and-forget: don't block render on the POST. Errors are swallowed; this is an analytics-class signal, not a correctness signal.
- The POST endpoint:
  - Calls `applyRateLimit(request)` at entry (consistent with the rest of `app/api/me/*`).
  - Resolves `shareId` → `pool_id` server-side via the existing pool-access helper. Never trusts client-supplied `poolId`.
  - **Verifies pool ownership/accessibility for the requesting user** using the same gating logic as `app/api/pools/[shareId]/*` reads. Returns 403 (not 404) if the resolved pool exists but the user is not entitled to its play page. Prevents a logged-in user from inflating their `decksPlayed` counter via another user's shareId.
- Anonymous visits are not recorded (401).
- Repeat visits to the same page UPSERT and bump `last_visited_at` without creating new rows — the unique constraint handles this.
- CSRF posture: relies on the `SameSite=Lax` session cookie from `lib/auth.ts`. The `Authorization: Bearer` auth fallback in `lib/auth.ts` is not used for browser-initiated POSTs to this endpoint; document inline in the route handler.

**Patterns to follow:**
- [app/api/me/](../../app/api/me) — existing `me/*` endpoint conventions for the user-scoped namespace.
- Existing pool-by-shareId lookup helper in `lib/`.

**Test scenarios:**
- Happy path: authenticated POST with a valid `shareId` for a pool the user owns inserts a row into `deck_play_visits`.
- Happy path: repeated POST UPSERTs and bumps `last_visited_at` without duplicating rows. Covers AE5.
- Edge case: POST with no auth cookie returns 401, no row inserted.
- Edge case: POST with an unknown `shareId` returns 404, no row inserted.
- Edge case: POST with a `shareId` belonging to a different user (no access) returns 403, no row inserted. Guards the IDOR path.
- Edge case: POST with a malformed body returns 400, no row inserted.
- Error path: rapid repeated POSTs from the same IP get 429 after the rate-limit threshold.
- Integration: visiting the play page in an integration test (Jest + test DB, not the Playwright E2E suite — UI-only E2E rule still applies) results in a `deck_play_visits` row. The Playwright coverage lives in U7.

**Verification:**
- Loading `/pool/<shareId>/deck/play` as a logged-in user creates a row in `deck_play_visits` with `first_visited_at = last_visited_at`.
- Loading it again bumps `last_visited_at` and leaves `first_visited_at` unchanged.

---

- [ ] U3. **Expected-distribution service**

**Goal:** Pure function that derives per-pack expected counts (rarity, aspect, per-card) from `setConfigs/*` and the card pool, scaled by `packsCracked`. Covers base-belt dimensions only — treatment/HS/prestige/showcase are explicitly out.

**Requirements:** R8, R8a

**Dependencies:** None

**Files:**
- Create: `src/services/expectedDistribution.ts`
- Create: `src/services/expectedDistribution.test.ts`

**Execution note:** Test-first. Spec-derived expected values per `.claude/rules/testing.md` — hardcoded from `packConstants.ts` and `setConfigs/*.ts`, never derived from observed data.

**Approach:**
- One pure function `getExpectedPerPack(setCode: SetCode): { rarity, aspect, cards: Map<cardId, rate> }`.
- One scaling function `scaleExpected(perPack, packsCracked) → expectedTotal`.
- **Scope of dimensions covered**: rarity and aspect distributions in the base belt path only. Treatment (foil/HS/showcase) and prestige distributions are NOT covered — those go through `HyperspaceUpgradeBelt`, `FoilBelt`, `CarbonitePrestigeBelt` etc., which are 60-pack-budgeted (not per-slot-independent) and would produce wrong CIs under a multinomial model. They are already out of v1 scope per Scope Boundaries.
- **Rarity expected**: for each non-belt rarity slot, count slots per pack × (slot odds for each rarity from `packConstants`). For the R/L slot specifically, use `setConfigs[set].beltRatios.rareToLegendary` (LAW: 7:1) to split between rare and legendary; do NOT treat the slot as a uniform rare bucket. Document the formula derivation inline against `packConstants.ts` constants.
- **Aspect expected**: for each rarity bucket, compute the aspect mix of the card pool in that rarity for that set (filtered from `cards.json`), weight by per-slot rarity odds and slot count, sum across slots. Neutral and Multicolor fall out as derived categories from the per-card aspect arrays.
- **Per-card expected**: for each non-belt card in the set, P(card in pack) = (slot odds for its rarity × slot count) × (1 / pool size for its rarity bucket). For the R/L slot, the slot-odds factor splits by `beltRatios.rareToLegendary` first. Test values are hardcoded from `packConstants.ts` and `setConfigs/*.ts` — never derived from observed data per `.claude/rules/testing.md`.
- **Cards excluded from per-card expected**: belt-managed variants — HS, HSF, foil-slot cards, prestige, showcase. Implementation enumerates the belt sources from `src/belts/` and excludes their cards from the per-card Map.
- Cache results per `setCode` at module scope since `cards.json` and `setConfigs` are frozen at build time.

**Patterns to follow:**
- [src/services/](../../src/services) — pure-function service pattern (no React, no I/O).
- [src/utils/cardData.ts](../../src/utils/cardData.ts) and `getAllCards()` for the card-pool source.
- [src/utils/setConfigs/index.ts](../../src/utils/setConfigs) for set-config lookup by code.

**Test scenarios:**
- Happy path: LAW per-pack rarity expectations match the spec — Common, Uncommon, Rare, Legendary expected counts sum to base-pack non-belt card count and each matches a hand-computed value from `packConstants.SET_7_PLUS_CONSTANTS` and `setConfigs/LAW.ts`.
- Happy path: LAW per-pack aspect expectations sum across all aspects to base-pack non-belt card count within floating-point tolerance.
- Happy path: SOR (older set) per-pack expectations match its spec — distinct constants from the Set 7+ path.
- Edge case: per-card expected for a Legendary in LAW equals `(R/L slot count × 1/(1 + beltRatios.rareToLegendary)) × (1 / cardCounts.legendaries)`. Hardcoded against `setConfigs/LAW.ts`. Verifies the rare:legendary split is applied (catches the original plan's bug).
- Edge case: per-card expected for a Rare in LAW equals `(R/L slot count × beltRatios.rareToLegendary/(1 + beltRatios.rareToLegendary)) × (1 / cardCounts.rares)`. Mirror of the legendary test.
- Edge case: aspect mix correctly handles Neutral cards (0 color aspects) and Multicolor cards (2+ color aspects) — verified against a hand-counted card-pool slice for one set.
- Edge case: `scaleExpected` with `packsCracked=0` returns all zeros; with `packsCracked=100` returns 100× per-pack values.
- Edge case: belt-managed cards (HS, prestige, showcase, foil-slot) are NOT in the per-card expected Map for any set. Iterating the Map for LAW yields only base-belt cards.
- Error path: unknown `setCode` returns `null`; document the choice inline.

**Verification:**
- All set configs produce expected totals consistent with their spec constants.
- The test file hardcodes expected values from `packConstants.ts` and `setConfigs/*.ts` — no test value is derived from observed data.

---

- [ ] U4. **Luck verdict service (reuses extracted stats core)**

**Goal:** Pure function that classifies `(observed, expected)` into `insufficient | normal | unusual`, computes a two-sided p-value and 95% CI, and renders the plain-English headline copy.

**Requirements:** R9, R10, R10a, R11

**Dependencies:** None hard. U4 has no structural dependency on U3 — both are pure functions and can ship in parallel. U6 (the consumer) depends on both.

**Files:**
- Create: `src/utils/stats.ts` — extracted statistical primitives.
- Create: `src/utils/stats.test.ts`
- Modify: `src/services/packQualityService.ts` — re-import the extracted primitives instead of inlining them. Existing packQualityService tests must continue to pass unchanged.
- Create: `src/services/luckVerdict.ts`
- Create: `src/services/luckVerdict.test.ts`

**Execution note:** Test-first. Spec-derived test values — hand-computed binomial / normal-approximation results from textbook tables or scratch-paper R/Python checks, never derived from the function under test. Existing packQualityService tests serve as a characterization safety net during the extraction.

**Approach:**
- **Extract the statistical core from `packQualityService.ts`** into `src/utils/stats.ts`: `calculateZScore`, `calculateConfidenceInterval` (Wilson), and the regime classifier. Both `packQualityService` and `luckVerdict` import from here. Eliminates the risk of two diverging implementations.
- `luckVerdict.verdict({ observed, expected, n, dimension }) → { regime, pValue, ci, copy }`. Internally calls `src/utils/stats.ts` for the math and adds copy + regime selection.
- Use Poisson approximation when `expected < 10` (rare events) and normal approximation when larger; document the cutoff inline.
- **Sample-size cutoff is three documented integer constants** in `src/utils/stats.ts`: `MIN_PACKS_RARITY`, `MIN_PACKS_ASPECT`, `MIN_PACKS_PER_CARD`. Each carries an inline derivation note ("smallest n where 95% CI excludes ±50% relative deviation at the median per-pack rate of this dimension"). The math is performed once during development; resulting integers are checked in. NOT framed as runtime power calculation — that was the original plan's misleading framing and reviewers caught it.
- Copy generation: lookup table keyed by `(dimension, regime)` with one-sentence templates that interpolate the observed/expected numbers. All three regimes × all three dimensions (rarity, aspect, streaks) covered — nine templates total. Includes the "normal" copy for rarity and aspect that the original plan left implicit.
- For the Aspect panel, the verdict regime is **the worst regime across all six aspects** (so "unusual" appears when any single aspect is unusual). The copy interpolates which aspect drove the verdict ("Your Vigilance share is meaningfully above expected. About a 4% chance if luck were average."). Implementation returns per-aspect details to U6 so the UI can decide whether to show one headline or six.
- Streak detection (R11): a separate helper `isInterestingStreak({ observed, expected, n }) → boolean` returning true only when the deviation crosses the "unusual" p-value threshold (e.g., `< 0.05`). Used by the streaks panel to filter routine cards.

**Patterns to follow:**
- Pure-function service style; no React, no I/O, no module-level mutable state.

**Test scenarios:**

For `src/utils/stats.ts`:
- Characterization: existing `packQualityService.test.ts` continues to pass without modification after the extraction. Z-score, CI, and regime values are bit-identical to the pre-extraction implementation.
- Happy path: `calculateZScore` and `calculateConfidenceInterval` return values matching textbook references (hardcoded inline in test comments).
- Constants: `MIN_PACKS_RARITY`, `MIN_PACKS_ASPECT`, `MIN_PACKS_PER_CARD` are positive integers; their values are commented with the derivation walk-through.

For `src/services/luckVerdict.ts`:
- Happy path: observed exactly equal to expected at large n returns `normal` regime, pValue ≈ 1, copy "This is normal variance." Covers the missing-normal case the original plan omitted.
- Happy path: observed at 2× expected with large n returns `unusual` regime and a small pValue. Covers AE2.
- Happy path: observed at 0.5× expected with large n returns `unusual` with the "fewer than expected" copy variant.
- Happy path: observed at 0.5× expected with small n returns `insufficient` regime ("we need more packs to tell"). Covers AE1.
- Happy path: aspect verdict with five normal aspects and one 4-sigma Vigilance returns `unusual` with copy naming Vigilance specifically.
- Edge case: observed exactly equal to expected with n below `MIN_PACKS_*` returns `insufficient`, not `normal` — the cutoff dominates.
- Edge case: `isInterestingStreak` returns false for routine deviations (within ~1 standard deviation) and true for tail events. Covers AE4.
- Error path: zero expected with non-zero observed returns `unusual` with a sensible copy (don't divide by zero).
- Error path: negative or non-integer observed throws.
- Copy coverage: every (dimension ∈ {rarity, aspect, streaks}, regime ∈ {insufficient, normal, unusual}) combination has a non-empty template.

**Verification:**
- Test values are hardcoded from textbook binomial/normal calculations or hand-computed via R/Python in test comments — not derived from the function output.
- Copy strings cover all three regimes for each of three dimensions (rarity, aspect, streaks) and read in plain English without jargon.

---

- [ ] U5. **API: `/api/stats/me/summary`**

**Goal:** Return the activity totals for the authenticated user: `packsCracked`, `poolsOpened`, `draftsJoined`, `decksBuilt`, `decksPlayed`.

**Requirements:** R3, R5

**Dependencies:** U1 (deck_play_visits exists), U2 (deck_play_visits is populated)

**Files:**
- Create: `app/api/stats/me/summary/route.ts`
- Create: `app/api/stats/me/summary/route.test.ts`

**Approach:**
- `applyRateLimit(request)` at entry. Require auth; return 401 if not logged in.
- Accept `since` and `until` query params. Default `since=2020-01-01`, `until=2099-12-31` (lifetime). Use the existing half-open date pattern from `app/api/stats/draft-picks/route.ts:86`: `>= $since AND < ($until::date + interval '1 day')` — NOT `BETWEEN`. Catches events on the end-of-day boundary correctly.
- `packsCracked` (renamed from packsOpened to match the new label and the chosen semantic):
  - Sealed: every pack in pools the user owns. `SELECT COUNT(DISTINCT (cg.source_id, cg.pack_index)) FROM card_generations cg JOIN card_pools cp ON cp.id = cg.source_id WHERE cg.source_type = 'sealed' AND cp.user_id = $1 AND cg.generated_at >= $2 AND cg.generated_at < ($3::date + interval '1 day')`.
  - Draft: `packsPerPlayer` per draft the user participated in. `SELECT SUM(packs_per_player) FROM pod_players pp JOIN pods p ON p.id = pp.pod_id WHERE pp.user_id = $1 AND pp.is_bot = false AND p.status = 'complete' AND p.created_at >= $2 AND p.created_at < ($3::date + interval '1 day')`. Falls back to a constant of 3 if `pods.packs_per_player` isn't a column — implementation reads the pods schema to confirm.
  - Returned value is sealed + draft sum.
- `poolsOpened`: `SELECT COUNT(*) FROM card_pools WHERE user_id = $1 AND pool_type IN ('sealed', 'draft') AND created_at >= $2 AND created_at < ($3::date + interval '1 day')`. The `pool_type IN ('sealed', 'draft')` filter excludes imported and bot-generated pools so the counter stays consistent with `packsCracked`.
- `draftsJoined`: `SELECT COUNT(DISTINCT pp.pod_id) FROM pod_players pp JOIN pods p ON p.id = pp.pod_id WHERE pp.user_id = $1 AND pp.is_bot = false AND p.status = 'complete' AND p.created_at >= $2 AND p.created_at < ($3::date + interval '1 day')`. Counts completed drafts only — in-progress drafts don't count as "joined" for the activity total. UI label clarifies if needed.
- `decksBuilt`: `SELECT COUNT(*) FROM built_decks bd JOIN card_pools cp ON bd.card_pool_id = cp.id WHERE cp.user_id = $1 AND bd.built_at >= $2 AND bd.built_at < ($3::date + interval '1 day')`. Column is `built_at` per `migrations/031_create_built_decks.sql:11`. Since `built_decks UNIQUE(card_pool_id)`, this is really "pools with a built deck"; relabel UI to "Decks built" but understand the semantic.
- `decksPlayed`: `SELECT COUNT(*) FROM deck_play_visits WHERE user_id = $1 AND first_visited_at >= $2 AND first_visited_at < ($3::date + interval '1 day')`.
- Cache headers: `Cache-Control: private, max-age=60` PLUS `Vary: Cookie` for defense against header-regression mis-caching at the edge.

**Patterns to follow:**
- [app/api/me/](../../app/api/me) — auth-gated `me/*` endpoint conventions including `applyRateLimit`.
- [app/api/stats/draft-picks/route.ts](../../app/api/stats/draft-picks/route.ts) — query-param parsing, half-open date filter, `queryRows`/`queryRow`, `jsonResponse`/`handleApiError`. NOT the cache-header pattern; this endpoint is private+Vary instead.

**Test scenarios:**
- Happy path: returns all five counters for a user with mixed sealed + draft + decks + plays activity. Each count matches hand-set DB fixtures.
- Happy path: `since`/`until` correctly window each counter using the half-open `< $until::date + 1 day` pattern — events at 23:59:59 on `until` are included; events at 00:00:00 on `until + 1` are excluded.
- Happy path: `packsCracked` for a user with 5 sealed pools (6 packs each) and 3 completed drafts (3 packs each) returns 39, not 102 (packs-seen) and not 45 (kept-from). Locks in the chosen semantic.
- Edge case: brand-new user (no activity) returns all zeros, not an error.
- Edge case: imported pool counts toward `poolsOpened` zero times — filtered by `pool_type IN ('sealed', 'draft')`.
- Edge case: bots' contributions are excluded from `draftsJoined` even when the user is in a pod with bots.
- Edge case: in-progress (`status != 'complete'`) drafts don't count toward `draftsJoined`.
- Edge case: a pool opened but never built into a deck contributes to `poolsOpened` and `packsCracked` but not `decksBuilt` or `decksPlayed`.
- Edge case: a deck built but never played contributes to `decksBuilt` but not `decksPlayed`. Covers AE5 partial.
- Edge case: same pool played multiple times counts as `decksPlayed: 1` thanks to the unique constraint.
- Error path: unauthenticated request returns 401.
- Error path: rate-limit exceeded returns 429.
- Error path: invalid date strings return 400.
- Response shape: `{ packsCracked, poolsOpened, draftsJoined, decksBuilt, decksPlayed }` with integer values.

**Verification:**
- For a known user with seeded data, every counter matches a hand-counted expectation.
- The response is cached as `private` and not poisoned across users.

---

- [ ] U6. **API: `/api/stats/me/luck`**

**Goal:** Return per-dimension luck data (rarity, aspect, streaks) for the authenticated user, for one set, with a scope toggle between "opened" and "kept."

**Requirements:** R6, R7, R8, R8a, R9, R10, R11

**Dependencies:** U3, U4, U9 (the draft user_id backfill — the "kept" query is non-functional for drafts without it). Also depends on the `packOpenerSeat` helper (created in U6's own Files list).

**Files:**
- Create: `app/api/stats/me/luck/route.ts`
- Create: `app/api/stats/me/luck/route.test.ts`
- Create: `src/utils/packOpenerSeat.ts` — mode-aware helper returning the seat number that cracked a given `pack_index`. Standard mode `floor(pack_index / packsPerPlayer)`, chaos `pack_index % playerCount`.
- Create: `src/utils/packOpenerSeat.test.ts` — characterization tests against the actual pack-generation code in `app/api/draft/[shareId]/start/route.ts` and `src/utils/draftLogic.ts`.

**Approach:**
- `applyRateLimit(request)` at entry. Require auth; return 401 if not logged in.
- Query params: `setCode` (required), `scope` (`opened` | `kept`, default `opened`), `since`, `until`. Date filter uses half-open `>= $since AND < ($until::date + interval '1 day')`.

- **"Kept" query** — depends on U9 (the draft user_id backfill) being live. Once U9 ships, the query is uniform across formats:
  ```
  SELECT card_id, rarity, aspects, pack_index, source_id
  FROM card_generations
  WHERE user_id = $authUserId AND set_code = $setCode
    AND generated_at >= $since AND generated_at < ($until::date + interval '1 day')
  ```
  Distinct `(source_id, pack_index)` pairs in the result set give `packsCracked` for the scope; this is the `n` passed to U4.

- **"Opened" query** — exactly the packs the user personally cracked, regardless of who picked the cards.
  - Sealed (`source_type='sealed'`): `source_id = card_pools.id` and `card_pools.user_id` is the cracker.
  - Draft (`source_type='draft'`): the user is the cracker iff their `pod_players.seat_number` equals the pack's opener-seat as computed by the `packOpenerSeat()` helper from `src/utils/packOpenerSeat.ts` (see Key Technical Decisions). The helper is mode-aware:
    - Standard: `seat_number = floor(pack_index / packsPerPlayer)`
    - Chaos: `seat_number = pack_index % playerCount`
  - SQL form for draft side:
    ```
    SELECT cg.card_id, cg.rarity, cg.aspects, cg.pack_index, cg.source_id
    FROM card_generations cg
    JOIN pods p ON p.id = cg.source_id
    JOIN pod_players pp ON pp.pod_id = p.id AND pp.user_id = $authUserId AND pp.is_bot = false
    WHERE cg.source_type = 'draft'
      AND cg.set_code = $setCode
      AND cg.generated_at >= $since AND cg.generated_at < ($until::date + interval '1 day')
      AND (
        (p.is_chaos = false AND pp.seat_number = floor(cg.pack_index / p.packs_per_player))
        OR (p.is_chaos = true AND pp.seat_number = (cg.pack_index % p.max_players))
      )
    ```
    The explicit `pp.user_id = $authUserId AND pp.is_bot = false` on the join (not just on the outer WHERE) is load-bearing — without it, the seat-equality predicate alone could match bot rows in adversarial pod configurations.
  - UNION-ALL the two sides for the combined opened scope.
  - Implementation reads `pods` schema to confirm column names for `is_chaos` and `packs_per_player`; if either is named differently (`chaos_mode`, `pack_count`, etc.) the query adapts.

- Count actual cards by rarity and aspect from the returned rows; build a Map of card → observed count.
- Call `expectedDistribution.getExpectedPerPack(setCode)` from U3 and scale by `packsCracked` (the count of distinct `(source_id, pack_index)` pairs in this set-scoped result — NOT the global value from U5, which is lifetime).
- Call `luckVerdict.verdict()` from U4 for the rarity dimension and the aspect dimension. Per Key Technical Decisions: treatment/HS/prestige/showcase are out of scope.
- For streaks: iterate every base-belt card with non-trivial expected, call `isInterestingStreak()`, include only those that pass. Belt-managed variants are excluded from per-card expected (per U3) so they cannot appear in streaks.
- Response shape:
  ```
  {
    setCode, scope, packsCracked,
    rarity: { observed, expected, verdict, pValue, ci, copy },
    aspect: { observed: { Vigilance, ... }, expected, perAspect: { Vigilance: {verdict, pValue, ci, copy}, ... }, headlineVerdict, headlineCopy },
    streaks: [{ cardId, cardName, observed, expected, pValue, copy }]   // sorted by pValue asc, capped at 10 with hasMore flag
  }
  ```
  The `streaks` array contains per-card pull history; flag inline in the route handler that this field is private-only and must not be exposed in any future shareable view without an explicit privacy decision.
- Cache headers: `Cache-Control: private, max-age=60` PLUS `Vary: Cookie`.

**Patterns to follow:**
- [app/api/stats/draft-picks/route.ts](../../app/api/stats/draft-picks/route.ts) for query-param + cache pattern.
- [app/api/stats/packs/route.ts](../../app/api/stats/packs/route.ts) for `(source_id, pack_index)` enumeration.
- [src/utils/cardNormalization.ts](../../src/utils/cardNormalization.ts) for card-id-to-card-data lookup.

**Test scenarios:**
- Happy path: known sealed-only user — `scope=opened` and `scope=kept` return identical results (no draft data; cracker == keeper).
- Happy path: known draft user with hand-counted picks — `scope=kept` rarity counts match the user's drafted_cards (after U9 backfill is in place).
- Happy path: known standard-mode draft user — `scope=opened` rarity counts match cards from `pack_index in [seat * packsPerPlayer, ..., seat * packsPerPlayer + packsPerPlayer - 1]`. Covers the corrected pack-rotation math.
- Happy path: known chaos-mode draft user — `scope=opened` rarity counts match cards from `pack_index where (pack_index % playerCount) == seat`. Covers chaos path.
- Happy path: AE3 mechanism — for the same user, `scope=opened` aspect distribution matches the cracker view; `scope=kept` shifts noticeably toward Vigilance (the user's drafted color). Both views populated; counts differ.
- Happy path: a user at exactly the expected rate for Legendaries (above `MIN_PACKS_RARITY`) gets `normal` verdict copy.
- Happy path: a user with 2× expected Vigilance with sufficient n gets `unusual` verdict copy, with copy naming Vigilance specifically. Covers AE2.
- Edge case: a user below `MIN_PACKS_RARITY` packs for the selected set gets `insufficient` verdict in rarity regardless of observed/expected gap. Covers AE1.
- Edge case: streaks list is empty for a user whose every base-belt card pull is within expected range. Covers AE4 inverse.
- Edge case: streaks list contains a high-multiplier card hit and a zero-count card with high expected. Streaks list is capped at 10 with `hasMore: true` when more qualify. Covers AE4.
- Edge case: setCode the user has no activity in returns `{ packsCracked: 0, ... }` with all dimensions in the `insufficient` regime.
- Edge case: bot rows are never in the result — a draft pod with bots at the same `seat_number` as the user in a different pod returns only the user's pods' cards (the explicit `pp.user_id = $authUserId` on the join guards this).
- Edge case: HS, prestige, foil-slot, and showcase cards are not in the streaks output even when the user has unusual counts of them (belt-managed; out of v1 scope).
- Error path: missing `setCode` returns 400.
- Error path: invalid `scope` returns 400.
- Error path: unauthenticated returns 401.
- Error path: rate-limit exceeded returns 429.

**Verification:**
- Response shape and verdict values are deterministic given the same DB state and the same calls into U3/U4.
- The pack-opener derivation is documented at the call site with the rotation math (or a code reference if helpers are used).

---

- [ ] U7. **UI: `<YourStats />` component**

**Goal:** Render the new section: Activity dashboard, set selector, scope toggle, three luck panels (rarity, aspect, streaks), each with headline → bell-curve → show-math.

**Requirements:** R3, R5, R6, R7, R8, R9, R10, R12, R13, R14

**Dependencies:** U5, U6

**Files:**
- Create: `src/components/YourStats/index.tsx` — top-level section.
- Create: `src/components/YourStats/ActivityDashboard.tsx`
- Create: `src/components/YourStats/LuckSection.tsx`
- Create: `src/components/YourStats/LuckPanel.tsx` — one panel, reused for rarity and aspect.
- Create: `src/components/YourStats/StreaksPanel.tsx`
- Create: `src/components/YourStats/DistributionChart.tsx` — small bell-curve / dot-plot with "you are here" marker.
- Create: `src/components/YourStats/YourStats.css`
- Create: `src/components/YourStats/index.test.tsx` (component-level smoke tests)
- Create: `tests/e2e/your-stats.spec.ts` (E2E, UI-driven only per `.claude/rules/testing.md` and the project's E2E rule)

**Approach:**
- `<YourStats />` reads `useAuth()` first. If not logged in, render `<LoggedOutCTA />` with the explanation copy from R14 and a Sign-in-with-Discord link.
- If logged in: render `<ActivityDashboard />` at top, then `<LuckSection />` below.
- `<ActivityDashboard />` fetches `/api/stats/me/summary?since&until` using the same date-range state as the existing page (shared via prop or context). Renders five counters with labels "Packs cracked", "Pools opened", "Drafts joined", "Decks built", "Made it to play". Loading state: skeleton placeholders shaped like the counters, using the existing `.skeleton-line` style from `app/stats/stats.css`. Error state: counters render as "—" with a small "couldn't load activity" note. First-use (all zeros): render a single line "You haven't done anything yet — try a sealed pool or draft." with links instead of five zeros.
- `<LuckSection />` owns the set selector (defaults to most recent set with activity, per Deferred Question) and the scope toggle (Button variant="toggle" with `glowColor="blue"` per the project rules). Fetches `/api/stats/me/luck?setCode&scope&since&until` on change.
- `<LuckPanel dimension="rarity"|"aspect" data={...}/>` renders headline → `<DistributionChart>` → collapsible `<ShowMath>`. Show-math is opened/closed locally; closed by default. Inside show-math: a small table — for rarity, four rows (Common, Uncommon, Rare, Legendary) with columns observed/expected/CI; for aspect, six rows (Vigilance, Command, Aggression, Cunning, Neutral, Multicolor) with the same columns plus a per-aspect verdict regime indicator.
- The aspect panel uses the response's `headlineCopy` (which names the driving aspect) for the single headline, NOT one headline per aspect. Per-aspect details live in show-math.
- `<StreaksPanel data={...}/>` renders the streaks list (sorted by pValue ascending, capped at 10 by the API with `hasMore` flag). Each item shows card name, observed × expected, and the per-card copy. Zero-pull cards are labelled "Never pulled" instead of "Pulled 0×". When `hasMore`, show "and N more — show all" expander that re-fetches without the cap. Empty list → small "no notable streaks in this range" line.
- `<DistributionChart dimension="rarity">` is a single bell curve (Poisson or normal per regime, with a brief annotation when n is small) with a labelled "you are here" pin. `<DistributionChart dimension="aspect">` is a different shape — a horizontal stacked bar with expected vs observed per aspect — since six values don't render coherently as a single curve. Both use the existing chart library imported by `app/stats/StatsCharts.tsx`. The "you" pin uses both a distinct color AND a distinct shape (e.g., a triangle pin, not just a dot) for color-blind accessibility. Aria-label on the chart names the dimension and the observed/expected/verdict.
- Empty state (R12): if `packsCracked === 0` for the selected set, the luck section shows a friendly "open a sealed pool or join a draft" empty state with links instead of the panels.
- Tracking-cutoff line (R13): if `since` is before the global tracking start (`NEXT_PUBLIC_STATS_START_DATE` or `2026-02-12`), show the single-line "Tracking started YYYY-MM-DD" note near the activity block.
- Loading state on scope/set change: existing panel content stays visible with a subtle 50% opacity wash and the section header shows "Updating…" — avoids the blink of empty panels.
- Mobile: the five-counter activity row wraps to a 2x3 grid below ~520px. The distribution chart shrinks but keeps the pin visible. The set selector becomes a native `<select>` below ~520px (more screen-real-estate-efficient than a button row).
- All buttons use the `Button` component; toggle uses `variant="toggle"` with `glowColor="blue"`. Icon+text uses `gap: 8px`. Set selector control type confirmed: Button variant="toggle" row on desktop, native `<select>` on mobile.

**Patterns to follow:**
- [src/components/Button.jsx](../../src/components/Button.jsx) for all buttons / toggles.
- [app/stats/StatsCharts.tsx](../../app/stats/StatsCharts.tsx) for chart-library import and styling.
- [app/stats/stats.css](../../app/stats/stats.css) for the page-level CSS tokens (colors, spacing) — the new section should look at home next to the existing tabs.
- [docs/STYLE_GUIDE.md](../../docs/STYLE_GUIDE.md) — read first per CLAUDE.md.
- [.claude/rules/ui-components.md](../../.claude/rules/ui-components.md) — read first per CLAUDE.md.

**Test scenarios:**
- Component (RTL or smoke): renders `<LoggedOutCTA />` when `useAuth().user` is null.
- Component: renders `<ActivityDashboard />` with five labelled counters when summary fetch succeeds.
- Component: empty selected set → renders the friendly empty state, no luck panels.
- Component: tracking-cutoff line appears when `since` is before the cutoff and the user has account-creation activity before it.
- Component: scope toggle defaults to "Packs I opened" and switching it re-fetches `/api/stats/me/luck` with the new scope param. Covers AE3.
- Component: show-math drawer is closed by default and opens on click, revealing expected / observed / p-value.
- Component: streaks panel renders a list of cards when present, "no notable streaks" when empty.
- E2E (UI-driven per project rule): logged-in user navigates to `/stats#you`, sees the activity totals, switches set, switches scope, and the page updates without errors. No direct API calls from the test — every action goes through the UI.
- E2E: a logged-out visitor sees the sign-in CTA and no personal data placeholders.

**Verification:**
- Lighthouse / manual scan shows no console errors on render or interaction.
- The page is keyboard-navigable (set selector, scope toggle, show-math expanders).
- Existing tabs (LAW…SOR) render unchanged when the user is not on the `#you` tab.

---

- [ ] U8. **Mount `<YourStats />` as a new top-level tab on `/stats`**

**Goal:** Add a `You` tab next to the set tabs without regressing any existing competitive-meta UI.

**Requirements:** R1, R2

**Dependencies:** U7

**Files:**
- Modify: `app/stats/page.tsx` — add `'you'` to the tabs array, render `<YourStats />` when `activeTab === 'you'`, gate any Patreon/blur logic so it does NOT apply to the You tab.
- Modify: `app/stats/stats.css` if any new tab styling is needed beyond the existing `.stats-tab` class.

**Approach:**
- Add `'you'` to the tabs array. Place it at the end of the array (right of SOR), NOT at the front. The current default tab behavior is preserved unchanged — both logged-in and logged-out users continue to land on LAW by default. You is one click away in the tab strip.
- Update the hash-driven tab state: if `#you` is the hash, select `you`; otherwise existing behavior.
- The `isBlurred` (Patreon gate) and the Tournament/Top CTA are inside the existing `SetStatsTab`. The new `you` branch bypasses them entirely — render `<YourStats />` directly with no patron check (R2).
- The new tab inherits the existing date-range picker state.
- Care: the `setColors` map is keyed by set code; the You tab does not need a color and falls back to the default tab style.
- Rationale for not changing the default: (a) preserves the Patreon CTA conversion surface that fires on set tabs (reviewer flagged this as a revenue regression risk), (b) preserves bookmark UX for the competitive-meta audience, (c) avoids the SSR hydration flash that an auth-state-dependent default would introduce, (d) the origin requirements only required You be reachable, not defaulted to.

**Patterns to follow:**
- [app/stats/page.tsx](../../app/stats/page.tsx) — existing tab pattern. Match the `stats-tab` class shape exactly.

**Test scenarios:**
- Component: existing `#LAW`, `#SEC`, etc. hashes still select their tabs and render the existing SetStatsTab unchanged.
- Component: `#you` selects the new tab and renders `<YourStats />`.
- Component: no hash + logged-in user defaults to LAW (current behavior preserved — NOT You).
- Component: no hash + logged-out user defaults to LAW (current behavior preserved).
- Component: Patreon gate (Tournament/Top blur) is visible on set tabs for non-patrons and absent on the You tab regardless of patron status.
- E2E (UI-driven): logged-in user lands on `/stats`, sees LAW active by default, clicks the You tab in the strip, sees personal stats; clicks back to LAW, sees the existing card table. Hash updates as expected. Covers F1 + F2.
- Snapshot or characterization: rendering each set tab's content (LAW, SOR) produces the same DOM as before the change. Guards against accidental regression of the competitive-meta surface.

**Verification:**
- Direct URL `/stats` (no hash) lands on LAW exactly as before.
- Direct URL `/stats#LAW` works exactly as before.
- Direct URL `/stats#you` works.
- No console errors when toggling tabs.
- Building the project succeeds and existing E2E suite passes.
- Patreon CTA conversion surface continues to fire for non-patrons on set tabs.

---

- [ ] U9. **Populate `card_generations.user_id` for drafts (write-path + backfill)**

**Goal:** Make the `kept` scope query for drafts non-empty by populating `card_generations.user_id` on pick rather than relying on the existing host-only backfill (which is wrong for non-host drafters).

**Requirements:** R6 (needed for "What I kept" in draft format)

**Dependencies:** None hard; can ship before or alongside U6.

**Files:**
- Modify: the draft pick / pool-creation route that finalizes a drafter's picks (locate during implementation — likely `app/api/draft/[shareId]/pool/route.ts` or `app/api/draft/[shareId]/pick/route.ts`). After the user's pick is committed, UPDATE `card_generations.user_id = $userId` for the row matching `(card_id, source_id, pack_index)` where the user picked it.
- Create: `migrations/067_backfill_draft_card_generation_user_id.js` — one-time backfill for historical completed drafts. Walks each completed pod, reads `pod_players.drafted_cards` JSONB, updates `card_generations.user_id` for cards matching `(card_id, source_id)`. Must be idempotent (only updates rows where `user_id IS NULL`).
- Test: `migrations/067_backfill_draft_card_generation_user_id.test.js` if the migration test harness exists.

**Approach:**
- The current write path (`app/api/draft/[shareId]/start/route.ts:118`) sets `user_id = null` at generation. Migration 020 backfilled host_id only — that's wrong; it attributes other players' picks to the host. This unit replaces that with per-picker attribution.
- Implementation reads the draft completion / pick code path to find the right hook. The UPDATE happens server-side at pick commit, scoped to `(card_id, source_id, pack_index, user_id IS NULL)` so it cannot overwrite an already-attributed row (defense against concurrent commits).
- The historical backfill iterates completed pods, parses each player's `drafted_cards`, and runs a per-player UPDATE keyed by `(card_id, source_id)` filtered to that player's keep list. Must handle the case where migration 020 already attributed cards to the wrong user (host); the backfill explicitly nulls those rows first when the picker differs from the host, then writes the correct user_id.

**Patterns to follow:**
- [migrations/020_backfill_generation_user_ids.sql](../../migrations/020_backfill_generation_user_ids.sql) — existing (incorrect) backfill pattern; the new migration corrects it.
- [app/api/draft/[shareId]/route.ts:288-298](../../app/api/draft/[shareId]/route.ts) — existing UPDATE card_generations pattern from the cancel flow (right shape, wrong context).

**Test scenarios:**
- Happy path: a user picks a card during a draft; after commit, `card_generations.user_id` for that `(card_id, source_id, pack_index)` row equals the user's id.
- Happy path: backfill on a completed historical draft attributes each picked card to its actual picker, not the host.
- Edge case: a card the user passed (didn't pick) leaves `card_generations.user_id` NULL.
- Edge case: backfill on a pod that's already partially attributed (e.g., to the host from migration 020) corrects the attribution.
- Edge case: backfill is idempotent — running it twice produces the same final state.
- Edge case: concurrent picks on overlapping rows don't cross-contaminate (the `user_id IS NULL` guard).
- Verification of effect: after U9 ships, `SELECT COUNT(*) FROM card_generations WHERE source_type='draft' AND user_id IS NOT NULL` increases substantially. The "kept" scope for drafts becomes functional.

**Verification:**
- A user who drafted in a pod can run the U6 endpoint with `scope=kept` and see their drafted cards.
- Other players in the same pod see their own drafted cards, not the user's.
- Cards the user passed are not attributed to them.

---

---

## System-Wide Impact

- **Interaction graph:** `/stats` page gains a new tab branch at the end of the tab strip; the SetStatsTab branch and its default-tab behavior are unchanged. The play page (`app/pool/[shareId]/deck/play` and the two format variants) gains a fire-and-forget instrumentation call that does not block render or correctness. The deck builder Play button (`StickyInfoBar.tsx`, `DeckBuilderHeader.tsx`) is unchanged — instrumentation lives on the destination, not the trigger. U9 modifies the draft pick / pool-creation route to populate `card_generations.user_id` on commit; this changes a column value but no schema and no read consumers other than the new endpoints.
- **Error propagation:** Failed instrumentation POSTs are swallowed silently. Failed personal API responses surface as graceful empty states in the UI, not error toasts (this is a stats page, not a transaction). U9's UPDATE failures are logged but do not block the underlying pick commit.
- **State lifecycle risks:** `deck_play_visits` UPSERTs are idempotent; concurrent page loads from the same user produce the same final state. U9's UPDATE is keyed by `(card_id, source_id, pack_index, user_id IS NULL)` so it cannot overwrite an existing attribution. The luck endpoint queries can be slow for users with very large `card_generations` rows (heavy users could have thousands). Indexes from migration 018 (`(user_id)`, `(user_id, set_code)`) keep the per-set lookups cheap.
- **API surface parity:** `/api/stats/me/summary`, `/api/stats/me/luck`, and `/api/me/play-visit` are net-new. No existing endpoints change. The plugin `/api/plugin/v1/play` endpoint is unrelated.
- **Integration coverage:** U2 + U8 together produce the full F2 + F1 user journey. U6 + U7 cross multiple layers (DB + service + UI) and warrant the E2E test that walks the scope toggle in U7's test scenarios.
- **Unchanged invariants:** The existing SetStatsTab, its Patreon-gated Tournament/Top blur, and the default-tab behavior (logged-in and logged-out users land on LAW by default) are explicitly not changed. Existing `/api/stats/*` endpoints are not changed. The `pool_views` table is not touched. The Patreon CTA conversion surface continues to fire as before.
- **Cross-platform user_id semantics:** After U9 ships, `card_generations.user_id` reliably represents the picker for both sealed (creator) and draft (picker) cards. Any future feature that reads this column gets the intuitive semantic; before U9, draft rows are unattributed.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Pack-rotation helper (`packOpenerSeat`) drifts from the generation code | Characterization tests in `src/utils/packOpenerSeat.test.ts` use the same constants as the pack generator and would fail if either side moves. Add a CI-loud test name like `OPENER MATH MUST MATCH src/utils/draftLogic.ts` so a breaking change is obvious. |
| U9 backfill is slow or partial on production | Backfill is idempotent (`user_id IS NULL` guard) so it can be re-run safely. Run as `railway run -e production npm run migrate:prod` per the database rules. The "kept" scope is degraded but not broken for users whose data hasn't been backfilled yet — the UI shows the friendly empty state. |
| Luck endpoint slow for heavy users | Existing `(user_id, set_code)` index covers the hot path. Cache `private, max-age=60` + Vary: Cookie keeps repeat loads cheap. If profiling shows slowness, add a materialized summary table — but defer until measured. |
| `isInterestingStreak` threshold produces too many or too few streaks | Threshold is a constant in `luckVerdict.ts` with documented tradeoff. Tunable based on early user feedback without schema or API changes. List is capped at 10 with `hasMore` flag so worst case is bounded. |
| Statistical methods (Poisson approximation cutoff, two-sided p-value) misapplied for edge cases | U4 tests hardcode expected values from textbook calculations. Extraction from `packQualityService` provides a characterization safety net. |
| `MIN_PACKS_*` constants make most users see "insufficient" too often | Telemetry from U6 surfaces the rate of "insufficient" verdicts; tune from there. The constants are documented integers, not derived at runtime, so tuning is a single PR. |
| Belt-driven dimensions (HS, treatment, prestige) silently get statistical verdicts despite being deferred to v2 | v1 scope explicitly excludes these in U3 — they don't appear in the per-card Map, so streak detection cannot surface them. Rarity and aspect dimensions stay in the base belt path. Documented in Scope Boundaries and Key Technical Decisions. |
| `card_generations` user_id population breaks for an in-progress draft mid-deploy (U9 write path lands while picks are still happening) | U9's UPDATE is keyed by `(card_id, source_id, pack_index, user_id IS NULL)`, so it never overwrites an existing attribution. Worst case: a few rows from the in-progress draft stay NULL and the user sees an undercount until the draft completes (then the backfill catches them). Acceptable. |
| IDOR on POST /api/me/play-visit | U2 verifies pool ownership/accessibility server-side and returns 403 (not just 404) for unauthorized shareIds. Test scenario locks in the behavior. |
| Rate-limit bypass on personal endpoints | All three new endpoints call `applyRateLimit` per the me/* convention. 429 test scenarios verify. |
| Edge cache mis-serves one user's private data to another after a header regression | `Vary: Cookie` on private endpoints. Defense-in-depth — `private` alone would suffice but the header is cheap and survives regressions. |

---

## Documentation / Operational Notes

- **No new env vars required.** The existing `NEXT_PUBLIC_STATS_START_DATE` continues to drive the tracking-cutoff line (R13).
- **Migrations** run at server startup per `.claude/rules/database.md`. Migration 066 (`deck_play_visits`) is additive and idempotent. Migration 067 (U9 backfill) is a one-time data backfill, idempotent, and may take noticeable time on production depending on `card_generations` row count — run during a low-traffic window and monitor.
- **Release notes:** add a single line under the next deploy section in `RELEASE_NOTES.md` — "Your Stats: see your pulls, your luck, and your activity. New tab on /stats." Use the existing release-notes-process per the project memory.
- **No Patreon-tier changes.** Personal stats are explicitly free; no Stripe / Patreon / membership code is touched. The Patreon CTA conversion surface on set tabs is explicitly preserved.
- **Cache behavior:** new endpoints return `Cache-Control: private, max-age=60` plus `Vary: Cookie`. The `Vary: Cookie` is defense-in-depth — it prevents cross-user mis-caching if a future header regression accidentally drops `private`. Existing CDN/edge configuration treats `private` responses correctly — no edge-config change needed.
- **JWT secret dependency.** These endpoints expose per-user data and depend on `JWT_SECRET` / `NEXTAUTH_SECRET` being set to a strong value in every non-local environment. The hardcoded `'change-me-in-production'` fallback in `lib/auth.ts` is an existing pre-condition, not introduced by this plan, but the plan elevates the impact of it. If a startup-time assertion against the default fallback doesn't already exist, consider adding it as a separate small follow-up (out of scope here).
- **Monitoring:** the existing analytics setup covers page views; no new instrumentation beyond the play-visit POST is needed for v1. Surface the "insufficient" verdict rate in logs (one metric per dimension) so the team can tune the `MIN_PACKS_*` constants post-launch without code-time guesswork.

---

## Alternative Approaches Considered

- **Ship Activity dashboard alone as v0.5; defer Luck section.** Reviewer (PL-5) flagged that Activity is the high-confidence value and Luck carries the adoption + premise risk. Considered and rejected for this plan because the user has been explicit about wanting both ("vanity metrics" + "is my luck unusual"). If post-launch telemetry shows the Luck panels are ignored, retroactively retire them. The plan's unit structure (U1-U5 vs U3-U7) is already split enough that an interim ship of just Activity is feasible if priorities shift.
- **Merge `/api/stats/me/summary` and `/api/stats/me/luck` into one endpoint** (ADV-13). Considered and rejected because Activity and Luck have different refresh cadences: Activity changes after a play-visit POST and should reflect immediately; Luck only changes after a draft or pool completes. Splitting lets the UI refresh them independently.
- **Add an `opened_by_user_id` column to `card_generations` instead of deriving via `packOpenerSeat()`** (deferred in original plan). Considered and rejected because (a) the helper math is small and testable, (b) deriving avoids a backfill of every historical draft pack, (c) a new column would still need population logic in the same place U9 already touches. The helper approach is cheaper.
- **Make You the default tab for logged-in users** (original plan). Considered and reverted after PL-1 + SG-03 flagged the Patreon conversion surface and the additive promise. The change wasn't required by the origin requirements and risked revenue regression on the just-raised Patreon tier.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-09-personal-stats-requirements.md](../brainstorms/2026-06-09-personal-stats-requirements.md)
- Related code:
  - `app/stats/page.tsx`, `app/stats/StatsCharts.tsx`, `app/stats/stats.css`
  - `app/api/stats/draft-picks/route.ts` (endpoint pattern)
  - `app/api/stats/packs/route.ts` (pack enumeration pattern)
  - `migrations/014_card_generations.sql`, `018_add_user_id_to_generations.sql`, `061_create_pool_views.sql`
  - `src/utils/setConfigs/`, `src/utils/packConstants.ts`
  - `src/utils/cardData.ts`, `src/utils/cardNormalization.ts`
  - `src/components/DeckBuilder/StickyInfoBar.tsx`, `DeckBuilderHeader.tsx`
- Project rules:
  - `.claude/rules/architecture.md`, `database.md`, `testing.md`, `ui-components.md`
  - `docs/STYLE_GUIDE.md`, `docs/STACKED_STATS.md`
- Related PRs/issues: none currently open.
