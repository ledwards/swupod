---
title: "feat: Per-deck Stats page with record display + Game Log / Pool / Gameplay / Matchups tabs"
type: feat
status: active
date: 2026-06-18
deepened: 2026-06-18
---

# feat: Per-deck Stats page with record display + Game Log / Pool / Gameplay / Matchups tabs

## Overview

Give every deck (pool/build) its own **Stats page** at `app/pool/[shareId]/deck/stats/`, reachable from a **"Stats" button** beside the existing Play actions, and surface each deck's **win-loss-draw record** in the new format `1W-3L-0D (25%)` everywhere a deck is shown (deckbuilder build cards, play page, `/me` Pools tab).

The Stats page has four tabs:
- **Game Log** — the per-deck match history, *relocated here from the play page*.
- **Pool** — "luck of the pool," inspired by `/me` → Luck, scoped to this one pool's opened cards.
- **Gameplay** — result-level performance math inspired by swustats, computed from this deck's game logs.
- **Matchups** — record/win-rate vs each opponent leader/base/archetype, inspired by Wayfinder Pro and `/me`.

**Defining insight:** most of this exists at the **per-user** level on `/me` (`src/components/YourStats/*`, `app/api/stats/me/*`). This feature is largely a **re-scope from per-user to per-pool** — but the deepening pass found the re-scope is **leaf-level, not page-level**: the small components and pure services reuse cleanly; the page-level containers (`LuckSection`) and the user-perspective query pipeline do **not** (see Key Technical Decisions). **No database migration is required.**

**Design constraint that shapes every tab:** most decks have **0 games**, occasionally 3, rarely 10-20. The page is **empty-state-first** and degrades gracefully. Only the **Pool** tab is guaranteed content (a pool always has opened cards) — it is the page's anchor.

> **Deepening note (2026-06-18):** This plan was strengthened after a feasibility/coherence/scope/design review pass. Material changes: (1) competitive game attribution is pod-level, not build-level — see Decision D3; (2) query perspective must be resolved from the pool **owner**, since reads are unauthenticated — D2; (3) per-card luck `streaks` are firewalled from shareable views — D4; (4) `LuckSection` and the opponent breakdown cannot be reused as-is — D5; (5) the play-page game log being moved lives on `feat/companion-toolbar-signin-cta`, not `origin/main` — see Dependencies/Prerequisites.

---

## Problem Frame

A deck's performance data is fragmented and per-viewer today:
- The W-L-D record lives on `card_pools.wins/losses/draws` (and is already returned by the public deck GET) but renders only as a terse `1W 2L 0D` badge in a couple of places — inconsistent, no win-rate %.
- The play page renders an inline match-history panel (`ReplayExplorer`, added on `feat/companion-toolbar-signin-cta`) that is **me-scoped** (the viewer's own games), cluttering the pre-game screen.
- There is **no single place** to see a deck's record, opening luck, gameplay performance, or matchup spread.

Grinders practicing a sealed/draft deck want a focused, link-shareable, per-deck analytics view — the insight `/me` gives per-user, answered for *this specific deck*.

---

## Requirements Trace

- **R1.** A deck's record renders as `1W-3L-0D (25%)` (dash-joined W/L/D + integer win-rate %) via one shared formatter on: deckbuilder build cards (`PoolBuilds`), the play page, and the `/me` Pools tab cards. At 0 games it renders a **visible, non-collapsing** label (`No games`) — never `null` — so layouts don't shift when a deck earns its first game.
- **R2.** A **"Stats" button** appears beside the Play actions on: the play page, the deckbuilder (`DeckBuilderHeader`), and the `/me` Pools tab cards. Variant = `secondary` where the `Button` component is used (play, deckbuilder); the existing `btn--secondary btn--sm your-stats-pool-action` chip class on `/me`. It navigates to that deck's Stats page.
- **R3.** A Stats page exists at `app/pool/[shareId]/deck/stats/` with four tabs: **Game Log**, **Pool**, **Gameplay**, **Matchups** (canonical URL values `gamelog | pool | gameplay | matchups`).
- **R4.** The **Game Log** tab hosts the per-deck match history; the inline history panel is **removed from the play page** (moved, not duplicated).
- **R5.** The **Pool** tab shows this pool's opening-luck analysis, inspired by `/me` → Luck, honest about the small single-pool sample, and **without** per-card pull `streaks` in a shareable response (D4).
- **R6.** The **Gameplay** tab shows swustats-style **result-level** metrics computed from this deck's game logs, with explicit thresholds and insufficient-data states.
- **R7.** The **Matchups** tab shows record/win-rate per opponent leader/base/archetype, with an explicit "insufficient data" state below N<5 per matchup.
- **R8.** Visibility mirrors the deck's own permissions: **shareId is the access mechanism** (read-open by shareId, like `GET /api/pools/[shareId]`), with the per-card luck-streak carve-out in R5/D4.
- **R9.** Every tab degrades gracefully for decks with 0-3 games; the Pool tab always renders meaningful content; every tab distinguishes **loading**, **error**, and **empty** states.

---

## Scope Boundaries

- **No database migration / no schema change.** All data already exists (`card_pools.wins/losses/draws/wayfinder_match_ids`, `casual_matches`, `practice_matches`, pool `packs`/`cards`).
- **No new match-capture / write paths.** Read-only analytics over existing data. The known non-transactional/non-idempotent issue in `app/api/plugin/v1/match/result/route.ts` is out of scope.
- **Do not rename, restyle, or re-architect `/me`.** Only update the Pools-tab record format + add a Stats button. The four `/me` tabs and their behavior are unchanged.
- **No "tournament" language anywhere** (legal). **Archetype/deck names from swuapi** via `archetypeShortName` — never a hand-made "Leader / Base" slash.

### Deferred to Follow-Up Work

- **Build-exact competitive attribution.** v1 attributes competitive games at the **pod** level (D3); distinguishing sibling builds that share a `pod_id` needs richer linkage and is deferred. The aggregate record (`card_pools.wins/losses/draws`) is always build-exact regardless.
- **Replay-level swustats metrics** — on-the-play/on-the-draw win rate, average game length (turns), winner's remaining health, cards-resourced, per-card "win rate when played." Our `casual_matches`/`practice_matches` rows do **not** capture these (they live inside the Wayfinder replay). Needs richer capture or replay parsing.
- **`StickyInfoBar` Stats icon button** — the sticky-bar parity icon requires expanding `StickyInfoBarProps` and prop-threading; the user asked for "a Stats button," satisfied by `DeckBuilderHeader`. Polish item, deferred.
- **"Recent form" streak widget** — adds nothing below ~10 games that the record doesn't already convey; dropped from v1.
- **Full per-card luck for non-owners / deck-vs-field comparison / variant-aware expected rates** — see D4 and `plans/LUCK_EXPECTED_RATES_PLAN.md`; not in v1.

---

## Dependencies / Prerequisites

- **This work lives on its own isolated worktree** — directory `.claude/worktrees/deck-stats-page`, branch `feat/deck-stats-page`, based on `origin/main`. It must NOT be based on, rebased onto, cherry-picked from, or otherwise entangled with the active `feat/companion-toolbar-signin-cta` branch in the main checkout.
- **The play-page game log being relocated (R4/U7) is NOT yet on `origin/main`.** It was added by commit **189ffda** on `feat/companion-toolbar-signin-cta`; `origin/main` has only the `WldBadge` + a Wayfinder link. **Sequencing (no entanglement):** U7's *relocation* depends on that inline log being on `main`. Until it merges, U7 only adds the record badge + Stats button; the move waits. When the companion-toolbar work reaches `main`, refresh this worktree from updated `main` (never from the feature branch).
- All other prerequisites (record columns, match tables, access pattern) are already on `origin/main`.

---

## Context & Research

### Reusable building blocks — corrected reuse boundary

✅ = reuses cleanly · ⚠️ = leaf-only / needs rework (see Decisions)

| Concern | Reuse | File |
|---|---|---|
| ✅ W-L-D record source (per-build, exact) | `card_pools.wins/losses/draws/wayfinder_match_ids[]` (already public via deck GET) | `migrations/046_add_match_results_to_pools.sql`, `app/api/pools/[shareId]/route.ts:214` |
| ✅ Gameplay aggregation helpers (already `export`ed) | `buildBreakdown`, `buildLeaderBreakdown`, `buildArchetypeBreakdown`, `withHyperspaceArt` — **import directly**, no extraction | `app/api/stats/me/gameplay/route.ts` |
| ⚠️ Perspective is `currentUserId`-coupled | `resultFromPerspective`/`gameResultFromPerspective` derive W/L from the *viewer* — must pass the **pool owner's** id (D2) | `app/api/stats/me/gameplay/route.ts:475` |
| ✅ Game-log UI | `ReplayExplorer` props `{ replays, myName, eyebrow?, heading? }` | `src/components/YourStats/GameplayDashboard.tsx:419` |
| ⚠️ Win-rate-by-leader UI | `WinRateByLeader` is keyed on **your** leader + `byBase`; does **not** model "vs opponent" — needs adapter/new component (D5) | `src/components/YourStats/WinRateByLeader.tsx` |
| ✅ Luck leaf components | `LuckHistogram` `{ cardHits, packsCracked }`, `AspectBreakdown`, `ShowcaseRateWidget` | `src/components/YourStats/LuckHistogram.tsx` |
| ⚠️ Luck container | `LuckSection` is hardwired to `/api/stats/me/luck` and set-scoped (not pool-scoped) — **do not reuse**; compose leaves directly (D5) | `src/components/YourStats/LuckSection.tsx:112` |
| ✅ Luck math (pure services) | `expectedDistribution.ts`, `luckVerdict.ts`, `stats.ts`, `buildCardHits`/`buildRarityPanel`/`aggregateObserved` | `src/services/`, `app/api/stats/me/luck/route.ts` |
| ⚠️ Luck pull SQL | `OPENED_SEALED_SQL` filters `WHERE cp.user_id = $1` — rewrite to `WHERE cg.source_id = :poolId` (D5) | `app/api/stats/me/luck/route.ts` |
| 🔒 Luck privacy | per-card `streaks` "**must NEVER be exposed in any shareable view**" — omit from deck response (D4) | `app/api/stats/me/luck/route.ts:50` |
| ✅ Tab framework | `useStickyTab` (URL `?tab=` + localStorage), ARIA tabs | `src/components/YourStats/index.tsx` |
| ✅ Archetype naming / colors / leader art | `archetypeShortName`, `getAspectColor`, `hyperspaceLeaderArt` (resolve by name+set, not cardId) | `src/utils/archetypeName.ts`, `aspectColors.ts`, `hyperspaceLeaderArt.ts` |
| ✅ Charts | `recharts` + `ChartPanel` wrapper | `app/stats/StatsCharts.tsx` |
| ✅ Access pattern (shareId = access) | deck GET is read-open by shareId | `app/api/pools/[shareId]/route.ts:133` |
| ✅ Surfaces to edit | `PoolBuilds`→`BuildCard`; `PoolBuildCard`/`recordLine`; `WldBadge`; `DeckBuilderHeader` | `src/components/PoolBuilds.tsx`, `src/components/YourStats/PoolHistoryDashboard.tsx`, `app/pool/[shareId]/deck/play/page.tsx:47`, `src/components/DeckBuilder/DeckBuilderHeader.tsx` |

### Institutional learnings (must-honor)

- **`docs/plans/2026-06-11-002-feat-onsite-gameplay-capture-plan.md` (U14)** — per-deck win-rate honesty guardrail: **exclude void/null games**, show explicit **"insufficient data" below N<5**. *Correction (deepening):* its cited `practice_game_results` table **does not exist** — per-game results are the `game1_result/game2_result/game3_result` **columns** on `practice_matches` (migration 055) and `casual_matches` (migration 071). The guardrail stands; the table name was forward-looking.
- **`plans/DUPLICATE_INVESTIGATION_PLAN.md`** — within ONE pool, expected duplicates ≈ **0**. **No cross-pool duplicate-rate widget** on the single-pool Pool tab.
- **`.claude/rules/architecture.md`** — services in `src/services/` are pure; components don't calculate; small files. **New** math (opponent breakdown, result distribution) → a small `src/services/deckGameplayStats.ts`; **existing** exported helpers → import directly (no speculative extraction).
- **`.claude/rules/mobile.md`** — hover is desktop-only: wrap `:hover` in `@media (hover: hover)`, provide **tap-to-pin** tooltips (reused widgets already do — preserve it).
- **`.claude/rules/ui-components.md` + `docs/STYLE_GUIDE.md`** — `Button` component only; `gap: 8px` icon+text; Barlow.
- **Hyperspace art gotcha** — resolve leader art by name+set via `hyperspaceLeaderArt`, never cardId.
- **Dev-DB gotcha** — `git checkout -- src/data/cards.json src/data/cards.raw.json` before committing (dev server rewrites them; both already modified).

### External reference (user-named: swustats)

swustats.net computes from game logs: overall win rate; first-player split (plays/wins going first vs second); average turns in wins vs losses; winner's remaining health; cards resourced; per-card play/resource/draw rates and "win rate when played"; matchup win/loss vs opponent leader/base. **Our data supports only the result-level subset** (win rate, game-level Bo3 win rate, result distribution, per-opponent record). Turn/first-player/card-level metrics require replay data we do not store — see Deferred.

---

## Key Technical Decisions

- **D1 — Route mirrors the play page.** `app/pool/[shareId]/deck/stats/page.tsx`, sibling of `deck/play/`, keyed by the same pool `shareId`. The Stats button passes whatever shareId its in-context Play action uses.
- **D2 — Query perspective = pool owner.** Reads are unauthenticated (shareId = access), but win/loss derivation needs a viewpoint. Resolve `card_pools.user_id` server-side and pass it as the perspective into the gameplay helpers. The stats are "the owner's record with this deck," shown to anyone who can open the deck (consistent with the record already being public via the deck GET).
- **D3 — Game attribution: casual exact, competitive pod-level.** Casual games attach exactly via `casual_matches.card_pool_id`. `practice_matches` has **no `card_pool_id`** — only `pod_id`, shared across sibling builds. v1 attributes competitive games at the **pod** level (matches where the owner participated), labeled accordingly; build-exact competitive attribution is deferred. The aggregate badge (`card_pools.wins/losses/draws`) stays build-exact.
- **D4 — Pool-luck privacy carve-out.** The deck luck endpoint is shareable, so it **omits the per-card `streaks`** array (and per-card granularity the `me/luck` author firewalled). It returns aggregate rarity/aspect/showcase-vs-expected + the histogram only. (If the user later wants full per-card luck, gate the Pool tab to the owner instead.)
- **D5 — Reuse leaves, not containers.** Import the already-exported gameplay helpers directly; compose `LuckHistogram` + pure panel builders directly (not `LuckSection`); rewrite the luck pull SQL to filter by pool `source_id`; build a **new** `buildOpponentBreakdown(replays)` for Matchups (no opponent aggregator exists) and a compact matchup UI (not `WinRateByLeader` directly).
- **D6 — Two new read endpoints:** `GET /api/stats/deck/[shareId]/gameplay` (record, replays, breakdowns — powers Game Log, Gameplay, Matchups) and `GET /api/stats/deck/[shareId]/luck` (powers Pool). Both resolve the pool by shareId, read-open.
- **D7 — One shared formatter (`formatRecord`).** `1W-3L-0D (25%)`, denominator `wins+losses+draws` (matches `buildBreakdown`), integer %, **visible non-null "No games"** at 0. Unified label across all badge surfaces.
- **D8 — CSS: the `/me` button-tab pattern.** `deck-stats.css` is layout-only (the leader/base art header strip); reuse `YourStats.css` classes/tokens for tiles and the tab container. No third tab style, no re-declared tokens.
- **D9 — Default tab = Pool** for direct navigation (guaranteed content); the **play-page** Stats button deep-links to `?tab=gamelog` (post-game context), accepting that a 0-game deck shows the Game Log empty state there.

---

## Open Questions

### Resolved During Planning

- **Surfaces?** → Whole site including `/me` (user). One formatter; Stats buttons on deckbuilder, play, `/me`.
- **Visibility?** → Same as the deck's permissions = shareId-open (user; confirmed `app/api/pools/[shareId]/route.ts:133`), with the luck-streak carve-out (D4).
- **Record format / denominator?** → `wins/(wins+losses+draws)`, integer %, `1W-3L-0D (25%)`; visible `No games` at 0.
- **Empty label?** → Unified `No games` for the badge on every surface (replaces `/me`'s current `No matches`). The Game Log *tab* may show richer empty copy ("Play some games to start your record").
- **Stats button variant?** → `secondary` (play/deckbuilder), existing chip class (`/me`).
- **Route?** → `app/pool/[shareId]/deck/stats/`.
- **Pool tab scope?** → this one pool's opening luck; leaves + pure services; streaks omitted (D4).

### Deferred to Implementation

- **Competitive pod-level labeling copy** — how to phrase that competitive Game Log/Matchups reflect the draft pod, not just this build (D3).
- **Draft vs sealed Pool-luck scope** — sealed → opened packs; draft → kept/drafted cards; select by `pool_type`; confirm the leaf builders accept the chosen scope.
- **void/null per-game results** — exclude null/pending `game*_result` from win-rate denominators (no literal "void" value exists in schema).
- **Owner-id resolution edge cases** — anonymous/owner-less pools (`card_pools.user_id` null): show aggregate record, render game-log empty (no perspective to resolve).

### Needs a User Decision (surface at handoff)

- **Pool-luck depth vs privacy (D4):** default is *omit per-card streaks, keep aggregates, stay shareable*. Alternative: *show full per-card luck but gate the Pool tab to the owner*. Confirm preference.

---

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

### Data flow (corrected: owner-perspective, leaf reuse)

```
        card_pools (by shareId, read-open)  ──► resolve owner user_id (D2)
              │  wins/losses/draws (exact)        packs/cards          pod_id / card_pool_id
              ▼                                       ▼                       ▼
   GET /api/stats/deck/[shareId]/gameplay        GET /api/stats/deck/[shareId]/luck
     • import me/gameplay helpers (direct)         • pure builders + pool-scoped pull SQL
     • perspective = OWNER, not viewer (D2)         • OMIT per-card streaks (D4)
     • casual: card_pool_id (exact)                • drop duplicate widget
     • competitive: pod_id, owner-participated (D3) 
     • + new buildOpponentBreakdown() (D5)
              │                                       │
              ▼                                       ▼
        app/pool/[shareId]/deck/stats/page.tsx  (useStickyTab; /me button-tab CSS, D8)
        ┌──────────┬──────────┬───────────┬───────────┐
        │ Game Log │   Pool   │ Gameplay  │ Matchups  │   each tab: loading | error | empty | data
        │ Replay-  │ Histogram│ result-   │ new matchup│
        │ Explorer │ +panels  │ tiles/charts│ component │
        └──────────┴──────────┴───────────┴───────────┘
   Record badge (formatRecord, visible at 0) on: play · PoolBuilds · /me  →  Stats button (secondary)
```

### Tab × state matrix (drives the four states per tab)

| Tab | Source | Loading | Error | Empty (0 games) | Data threshold |
|---|---|---|---|---|---|
| Game Log | casual `card_pool_id` + competitive `pod_id` | skeleton list | error card | "Play some games…" | any ≥1 replay |
| Pool | this pool's packs vs expected | skeleton tiles | error card | **n/a — always has data** | always renders |
| Gameplay | derived from game logs | skeleton tiles | error card | insufficient-data card | win-rate text ≥1; **suppress charts < 5** |
| Matchups | `buildOpponentBreakdown` | skeleton | error card | insufficient-data | per-matchup **N<5** = insufficient |

### Unit dependency graph

```
U1 formatRecord ─────────────────────────┐
                                          ├─► U7 play page (badge + button + relocate)*  *also needs branch base
U2 stats page shell ──┬───────────────────┼─► U8 deckbuilder (builds API → record + button)
                      │                   └─► U9 /me Pools (record + button)
                      ├─► U3 Game Log tab + deck gameplay API (D2,D3)
                      │        ├─► U5 Gameplay tab (thresholds)
                      │        └─► U6 Matchups tab (new opponent breakdown, D5)
                      └─► U4 Pool tab + deck luck API (D4,D5)
```

**Phase 1:** U1, U2 · **Phase 2:** U3, U4, U5, U6 · **Phase 3:** U7, U8, U9.

---

## Implementation Units

- [ ] U1. **Shared `formatRecord` util**

**Goal:** One canonical formatter producing `1W-3L-0D (25%)` and a **visible, non-null** 0-games label, used by every record surface.

**Requirements:** R1, D7

**Dependencies:** None

**Files:** Create `src/utils/deckRecord.ts`; Test `src/utils/deckRecord.test.ts`

**Approach:**
- Pure `formatRecord(wins, losses, draws, opts?) → string`. Win-rate % = `round(w/(w+l+d)*100)` (integer), matching `buildBreakdown`. Returns `"{w}W-{l}L-{d}D ({p}%)"` when total > 0, else a **non-empty** string `opts.emptyLabel ?? "No games"`. Never returns `null`/`""` — callers render it directly so the badge never collapses (prevents layout shift).
- Coerce nullish counts to 0.

**Patterns to follow:** existing `recordLine()`; winRate math in `app/api/stats/me/gameplay/route.ts`.

**Test scenarios:**
- Happy: `(1,3,0)`→`"1W-3L-0D (25%)"`; `(2,1,0)`→`"2W-1L-0D (67%)"` (rounding).
- Edge: `(0,0,0)`→`"No games"` (default), respects custom `emptyLabel`, returns a non-empty string (never null).
- Edge: draws in denominator — `(1,1,1)`→`"1W-1L-1D (33%)"`.
- Edge: nullish inputs coerce to 0, no NaN.
- Edge: `(3,0,0)`→`(100%)`; `(0,3,0)`→`(0%)`.

**Verification:** all surfaces import one formatter; 0-games renders visible text everywhere.

---

- [ ] U2. **Stats page shell: route, access, tabs, deck-identity header**

**Goal:** A working, empty-state-first page with the four-tab framework, the deck-identity header, and explicit loading/error/empty states — tab bodies are placeholders here (filled U3-U6).

**Requirements:** R3, R8, R9, D1, D8, D9

**Dependencies:** U1

**Files:** Create `app/pool/[shareId]/deck/stats/page.tsx`, `app/pool/[shareId]/deck/stats/deck-stats.css`; Reference `app/api/pools/[shareId]/route.ts`, `src/components/YourStats/index.tsx`, `src/components/YourStats/YourStats.css`

**Approach:**
- Resolve the pool by `shareId` like the deck GET (read-open; 404 when absent).
- Tabs via `useStickyTab` (URL `?tab=gamelog|pool|gameplay|matchups`, localStorage `ptp:deck-stats-tab`), ARIA roles mirroring `/me`. **Default tab = Pool** unless `?tab=` present (D9).
- **CSS = `/me` button-tab pattern (D8).** `deck-stats.css` holds layout-only rules for the leader/base art header strip; reuse `YourStats.css` classes for tiles/tab container. Do not re-declare design tokens.
- Header: deck name (`archetypeShortName`, no slash), leader/base art via `hyperspaceLeaderArt` + record badge (`formatRecord`). **Art fallback:** when art doesn't resolve, render an aspect-color fill via `getAspectColor` sized to the art slot — no broken-image icon.
- Each tab body is a placeholder + the shared empty/loading/error scaffolding in this unit. Back affordance (`Button variant="back"`).

**Execution note:** Empty-state-first — the page must look intentional at 0 games before tab logic lands.

**Patterns to follow:** `app/me/page.tsx` shell; `src/components/YourStats/index.tsx` tabs; `WinRateByLeader` missing-art handling.

**Test scenarios:**
- Happy: valid shareId renders all four tab buttons; default (Pool) content visible.
- Integration: `?tab=matchups` deep-link selects Matchups on load; switching tabs updates URL + localStorage.
- Edge: unknown shareId → 404 UI, not a crash.
- Edge: deck with no leader/base → header art falls back to aspect-color fill; badge shows "No games".
- Edge: each tab scaffold can show loading (skeleton) and error states distinct from empty.
- Mobile: tabs usable by tap; no hover-only affordance.

**Verification:** `/pool/{shareId}/deck/stats` shows a coherent page with placeholder tabs and all four states wired; access works by shareId without sign-in.

---

- [ ] U3. **Game Log tab + deck-scoped gameplay API**

**Goal:** `GET /api/stats/deck/[shareId]/gameplay` (owner-perspective, casual-exact + competitive-pod) and the Game Log tab rendering `ReplayExplorer`.

**Requirements:** R3, R4, R8, R9, D2, D3, D6

**Dependencies:** U2

**Files:** Create `app/api/stats/deck/[shareId]/gameplay/route.ts` (+ `route.test.ts`); Modify `app/pool/[shareId]/deck/stats/page.tsx` (Game Log body); Reference `app/api/stats/me/gameplay/route.ts`, `src/components/YourStats/GameplayDashboard.tsx`

**Approach:**
- Resolve the pool by shareId, then resolve the **owner's `user_id`** (D2) and pass it as the perspective into the **already-exported** helpers (`buildBreakdown`, `withHyperspaceArt`, etc.) — import directly from the me route (no speculative extraction; only extract to `src/services/` if a circular import forces it).
- **Casual:** filter `casual_matches.card_pool_id = pool.id` (exact). **Competitive:** filter `practice_matches.pod_id = pool.pod_id` where the owner participated (`player1_id`/`player2_id = owner`), derived from the owner's perspective; label as pod-level (D3). Union without double-counting; exclude null/pending per-game results.
- Game Log tab renders `ReplayExplorer` against this payload; loading skeleton, error card, and "Play some games…" empty state per U2 scaffolding.

**Patterns to follow:** `app/api/stats/me/gameplay/route.ts` aggregation + perspective functions; `ReplayExplorer` usage.

**Test scenarios:**
- Happy (route): pool with 3 casual matches → correct record, 3 replays, opponent identity, W/L from owner perspective.
- Integration (route): competitive pool (`pod_id`) → games resolved via pod + owner participation; casual + competitive don't double-count.
- Edge (route): owner-less/anonymous pool → aggregate record only, empty replays, 200.
- Edge (route): unknown shareId → 404; valid shareId is read-open (no auth).
- Edge: null/pending `game*_result` excluded from denominators.
- Component: Game Log shows loading→data and empty at 0.

**Verification:** the Game Log tab shows the deck's history (owner-perspective), reachable by anyone with the link; competitive games are pod-attributed and labeled.

---

- [ ] U4. **Pool (luck) tab + deck-scoped luck API (streaks omitted)**

**Goal:** `GET /api/stats/deck/[shareId]/luck` scoped to this one pool, composing luck leaves, with per-card `streaks` omitted (D4).

**Requirements:** R3, R5, R9, D4, D5

**Dependencies:** U2

**Files:** Create `app/api/stats/deck/[shareId]/luck/route.ts` (+ `route.test.ts`); Modify `app/pool/[shareId]/deck/stats/page.tsx` (Pool body); Reference `app/api/stats/me/luck/route.ts`, `src/components/YourStats/LuckHistogram.tsx`, `src/services/expectedDistribution.ts`, `luckVerdict.ts`

**Approach:**
- **Do not reuse `LuckSection`** (hardwired endpoint, set-scoped). Rewrite the pull SQL from `OPENED_SEALED_SQL` to filter `WHERE cg.source_id = :poolId` (sealed → opened packs; draft → kept cards by `pool_type`). Compute observed vs `expectedDistribution`; verdicts via `luckVerdict`.
- **Omit the per-card `streaks` array** from the response (D4) — keep aggregate rarity/aspect/showcase-vs-expected + the histogram. Set cache headers appropriately for a shareable read.
- Compose `LuckHistogram` + `AspectBreakdown` + `ShowcaseRateWidget` directly. **Drop `DuplicateRateWidget`** (single-pool expected dups ≈ 0). Framing copy sets small-sample expectations; verdicts respect `luckVerdict` sample-size cutoffs (regime "insufficient" below cutoff, not "unusual").

**Patterns to follow:** `app/api/stats/me/luck/route.ts` aggregation; `LuckSection` widget *composition* (but not its fetch).

**Test scenarios:**
- Happy (route): sealed pool → observed vs expected per rarity/aspect; **no `streaks` field present**.
- Edge (route): draft pool uses kept-card scope; sealed uses opened-pack scope.
- Edge: sample below cutoff → regime "insufficient", not "unusual".
- Edge: showcase/foil vs expected present; duplicate-widget data absent by design.
- Component: Pool tab renders content for a 0-game pool (decoupled from match data); loading/error states wired.

**Verification:** Pool tab always shows meaningful content; no streaks leak in a shareable response; no duplicate widget; verdicts don't over-claim on tiny samples.

---

- [ ] U5. **Gameplay tab (result-level metrics, explicit thresholds)**

**Goal:** Show the swustats-style metrics our data supports, with named thresholds so sparse data doesn't render hollow charts.

**Requirements:** R6, R9

**Dependencies:** U3 (consumes the deck gameplay payload)

**Files:** Create `src/services/deckGameplayStats.ts` (+ test) for the new pure math; Modify `app/pool/[shareId]/deck/stats/page.tsx` (Gameplay body); Reference `app/api/stats/me/gameplay/route.ts`, `app/stats/StatsCharts.tsx`

**Approach:**
- New pure service computes, from the deck's replays: overall win rate, game-level (Bo3) win rate vs match-level win rate, and result distribution (2-0 / 2-1 / 1-2 / 0-2 / draw). (Math in a service per architecture rule; one consumer is fine — it's genuinely new logic, not extraction.)
- **Thresholds (explicit):** win-rate text at **N≥1**; **suppress the result-distribution chart below N<5** (show raw record text instead) — consistent with the Matchups N<5 boundary. Insufficient-data card below N<1.
- Render with stat tiles + `ChartPanel` (recharts) above threshold; tap-to-pin tooltips; `:hover` wrapped in `@media (hover: hover)`.
- **Explicitly note unavailable swustats metrics** (on-the-play/draw, game length, card-level) with a one-line "not captured yet" — do not fake them. **No "recent form" widget** (dropped, Deferred).

**Patterns to follow:** `buildBreakdown` math; `ChartPanel`; `WinRateByLeader` tap-to-pin.

**Test scenarios:**
- Happy (service): 4 matches with known records → correct overall %, game-level %, result distribution.
- Edge: N<5 → no distribution chart, record text only; N=0 → insufficient-data card, no NaN.
- Edge: all draws / single game → sensible output, no divide-by-zero.
- Mobile: tooltips tap-to-pin; hover CSS gated.

**Verification:** Gameplay is informative at 5-20 games, honest below 5, never shows metrics the data can't support or hollow charts.

---

- [ ] U6. **Matchups tab (new opponent breakdown)**

**Goal:** Record/win-rate per opponent leader/base/archetype, built from a **new** aggregator, with the N<5 guardrail.

**Requirements:** R7, R9, D5

**Dependencies:** U3 (replays + owner perspective)

**Files:** Modify `src/services/deckGameplayStats.ts` (add `buildOpponentBreakdown`); Modify `app/pool/[shareId]/deck/stats/page.tsx` (Matchups body) + a compact matchup component; Reference `src/utils/archetypeName.ts`, `hyperspaceLeaderArt.ts`, `src/components/YourStats/WinRateByLeader.tsx` (pattern only)

**Approach:**
- `buildOpponentBreakdown(replays)` groups by `replay.opponent.leaderName` (and base/archetype) → `{ wins, losses, draws, winRate }`. Opponent identity from the replay rows / match identity columns; names via `archetypeShortName`, art via `hyperspaceLeaderArt`. **No existing opponent aggregator** — this is net-new (D5).
- UI is a compact matchup list/grid (WinRateByLeader is *pattern* inspiration; its `byBase` "your leader" shape doesn't map — build a small component or adapter). Color win-rate red→green; tap-to-pin.
- **Exclude void/null games**; **per-matchup N<5 → "insufficient data"** state, not a raw %. Empty state until any games exist; null opponent → "Unknown opponent" bucket.

**Patterns to follow:** `buildArchetypeBreakdown` grouping idea; `WinRateByLeader` grid styling; capture-plan U14 honesty guardrail.

**Test scenarios:**
- Happy: 6 games across 2 opponent leaders → two rows, correct records/%.
- Edge: matchup with <5 games → "insufficient data", not a raw %.
- Edge: 0 games → empty state; null opponent → "Unknown opponent" bucket, no crash.
- Edge: leader art resolves correct side via `hyperspaceLeaderArt`.

**Verification:** Matchups is meaningful for grinders, honest below N<5, empty-safe at 0, and built on a real opponent aggregator.

---

- [ ] U7. **Play page: record badge + Stats button; relocate the inline Game Log**

**Goal:** New record badge + Stats button on the play page, removing the inline history (now on the Stats page). **Requires the feature-branch base** (Dependencies/Prerequisites).

**Requirements:** R1, R2, R4, D9

**Dependencies:** U1, U2, U3; **the inline play-page `ReplayExplorer` must be present on `main`** (it arrives via the companion-toolbar work — see Dependencies/Prerequisites). Until then U7 only adds the badge + Stats button; the relocation waits for that merge. Do not pull the unmerged branch into this worktree.

**Files:** Modify `app/pool/[shareId]/deck/play/page.tsx`, `app/pool/[shareId]/deck/play/play.css` (if needed)

**Approach:**
- Refactor `WldBadge` to render via `formatRecord` (visible at 0).
- Add a **"Stats" button** (`Button variant="secondary"`, beside the record near `play-header`) → `/pool/{shareId}/deck/stats?tab=gamelog` (D9 — post-game context).
- **Remove** the inline `play-history-panel` `ReplayExplorer` block (present on the feature branch; the history now lives on the Stats page). Keep a short "play some games…" line beside the record/button so 0-games reads well.
- Pass the shareId the play page already uses (works for originals + child builds).

**Patterns to follow:** existing `WldBadge` + `play-header`; `Button` usage; existing nav in the file.

**Test scenarios:**
- Happy: record renders new format; Stats button navigates to `?tab=gamelog`.
- Integration: inline `ReplayExplorer` gone from the play page, present on Stats (no duplication).
- Edge: 0-games pool → "No games" + Stats button present and navigable.
- Mobile: record + button don't overflow the header.

**Verification:** play page is cleaner, shows the new record, routes to the Game Log tab.

---

- [ ] U8. **Deckbuilder: builds API W-L-D + record on PoolBuilds card + Stats button**

**Goal:** Show the record on the deckbuilder "little card" and add a Stats button to `DeckBuilderHeader`.

**Requirements:** R1, R2

**Dependencies:** U1, U2

**Files:** Modify `app/api/pools/[shareId]/builds/route.ts` (**step 1**), `src/components/PoolBuilds.tsx`, `src/components/PoolBuilds.css`, `src/components/DeckBuilder/DeckBuilderHeader.tsx`

**Approach:**
- **Step 1 (blocking, tested first):** the builds route currently selects only `share_id`, `deck_builder_state`, `created_at`, `user_id`, `username` — **add `wins/losses/draws`** to its SELECT from `card_pools` (no migration). 
- Add them to the `Build` interface; render `formatRecord` in `BuildCard` (near the existing "by {builder}" meta).
- Add a **"Stats" button** to `DeckBuilderHeader`'s `header-buttons` row (`Button variant="secondary"`, styled like Play/Draft Log) → `/pool/{shareId}/deck/stats`. `gap: 8px` icon+text. **`StickyInfoBar` icon is deferred** (Scope Boundaries) — do not expand `StickyInfoBarProps`.

**Patterns to follow:** existing `BuildCard` meta; `Button` usage in `DeckBuilderHeader` (Play button = template).

**Test scenarios:**
- Happy (route): builds response includes W-L-D per build (test the SQL change first).
- Happy (UI): `BuildCard` shows `1W-3L-0D (25%)`; 0-games build shows "No games".
- Happy (UI): Stats button appears beside Play in `DeckBuilderHeader`; navigates correctly.
- Edge: someone else's build still shows its record (read-open) and routes to that build's Stats.

**Verification:** deckbuilder shows per-build records and a Stats entry point; no `StickyInfoBar` interface change.

---

- [ ] U9. **`/me` Pools tab: unified record format + Stats button**

**Goal:** Bring `/me` Pools build cards in line — new record format (unified "No games") + a Stats button.

**Requirements:** R1, R2

**Dependencies:** U1, U2

**Files:** Modify `src/components/YourStats/PoolHistoryDashboard.tsx` (`recordLine()` → `formatRecord`; Stats chip in `PoolBuildCard`), `src/components/YourStats/YourStats.css` (if spacing)

**Approach:**
- Replace `recordLine()`'s `1W 2L 0D` (and its `No matches`) with `formatRecord` → `1W-3L-0D (25%)` / unified `No games` (D7).
- Add a **"Stats" chip** to the `PoolBuildCard` actions row using the existing `btn--secondary btn--sm your-stats-pool-action` class → `/pool/{shareId}/deck/stats`.

**Patterns to follow:** existing `PoolBuildCard` actions row + `recordLine`.

**Test scenarios:**
- Happy: `/me` cards show the new record format identical to deckbuilder/play.
- Happy: Stats chip present, navigates to the deck's Stats page.
- Edge: 0-games build shows unified "No games" (not the old "No matches").

**Verification:** all three card surfaces render byte-identical record strings; `/me` gains a Stats entry point without altering its tabs.

---

## System-Wide Impact

- **Interaction graph:** new read endpoints `app/api/stats/deck/[shareId]/{gameplay,luck}`; new page `app/pool/[shareId]/deck/stats/`; entry points on play page, `PoolBuilds`, `DeckBuilderHeader`, `/me` `PoolBuildCard`; the play page's inline history is removed (the only behavioral subtraction). The builds API gains three columns in its response shape.
- **Perspective/identity:** all per-game stats are computed from the **pool owner's** perspective (D2); the badge/aggregate uses `card_pools` counters (build-exact). Competitive games are **pod-attributed** (D3) and labeled as such.
- **Error propagation:** read endpoints 404 on unknown shareId, 200-with-empties otherwise; each tab renders distinct loading/error/empty states (R9) — network errors are not conflated with empty data.
- **Privacy:** per-card luck `streaks` are omitted from the shareable luck endpoint (D4). The aggregate record is already public via the deck GET, so exposing it is not a regression.
- **API surface parity:** the deck endpoints mirror their `me/*` payload shapes where practical so leaf components reuse with minimal prop juggling.
- **Unchanged invariants:** `card_pools.wins/losses/draws` remain the single record source; the `/me` four-tab structure and the match-result write path are untouched.

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Competitive games not build-exact (shared `pod_id`) | High | Med | D3: pod-level attribution, labeled; aggregate badge stays exact; build-exact deferred |
| Reads are unauthenticated → no perspective for W/L | High | High | D2: resolve owner `user_id` server-side as the perspective |
| Per-card luck `streaks` leak in a shareable view | Med | High | D4: omit streaks from the deck luck response; surface owner-gating alternative at handoff |
| Reuse overestimated (`LuckSection`/`WinRateByLeader` hardwired) | High | Med | D5: compose leaves + pure builders; new opponent aggregator + matchup UI |
| Build base lacks the play-page game log (still on companion-toolbar branch) | High | Med | Stay isolated on `feat/deck-stats-page`; sequence U7's relocation after that work merges to `main` — never base this worktree on the unmerged branch |
| Single-pool luck misleads (tiny sample) | Med | Med | `luckVerdict` cutoffs (regime "insufficient"); drop duplicate widget; framing copy |
| Sparse-data hollow charts (3 games) | Med | Low | U5 thresholds: text ≥1, charts ≥5; drop "recent form" |
| Wrong/front leader art (HS collector-number) | Med | Low | `hyperspaceLeaderArt` by name+set (U3/U6 tests) |
| Casual/competitive double-counting | Med | Med | Union with care; route tests assert no double-count (U3) |
| Token/copy inconsistency across surfaces | Low | Low | One `formatRecord`, unified "No games"; D8 CSS commit |
| Accidental `cards.json` commit (dev rewrite) | Med | Low | `git checkout --` both before committing |

---

## Documentation / Operational Notes

- **No migration**; nothing to run on deploy. Read-only endpoints.
- Follow `docs/STYLE_GUIDE.md` + `.claude/rules/ui-components.md`; `Button` only; `gap: 8px`; Barlow; `/me` button-tab CSS pattern (D8).
- Mobile: tap-to-pin tooltips; wrap all `:hover` in `@media (hover: hover)`.
- Before any commit: `git checkout -- src/data/cards.json src/data/cards.raw.json`.
- No "tournament" wording; archetype names from swuapi (`archetypeShortName`), never a slash.
- **Isolation:** all work stays on the worktree branch `feat/deck-stats-page` (based on `main`). U7's relocation waits until the companion-toolbar play-page log reaches `main`; do not entangle with that branch — see Dependencies/Prerequisites.

---

## Sources & References

- Code: `app/pool/[shareId]/route.ts:133,214` (shareId-as-access; record already public), `app/api/stats/me/gameplay/route.ts:475` (perspective coupling), `app/api/stats/me/luck/route.ts:50` (streaks-private contract; user-scoped pull SQL), `src/components/YourStats/LuckSection.tsx:112` (hardwired endpoint), `WinRateByLeader.tsx` (own-leader shape), `src/components/PoolBuilds.tsx`, `app/pool/[shareId]/deck/play/page.tsx`, `app/api/pools/[shareId]/builds/route.ts`, `src/components/DeckBuilder/DeckBuilderHeader.tsx`
- Schema: `migrations/046` (record columns), `055`/`070` (practice_matches + deck identity; **no `card_pool_id`**), `071` (casual_matches `card_pool_id`), `031` (built_decks)
- Branch drift: commit `189ffda` on `feat/companion-toolbar-signin-cta` added the play-page `ReplayExplorer` (not on `origin/main`)
- Prior plans: `docs/plans/2026-06-11-002-feat-onsite-gameplay-capture-plan.md` (U14 — guardrail valid; `practice_game_results` table name is **not** real), `docs/plans/2026-06-09-001-feat-personal-stats-plan.md`, `plans/DUPLICATE_INVESTIGATION_PLAN.md`, `plans/LUCK_EXPECTED_RATES_PLAN.md`, `plans/ME_HANDOFF.md`
- Rules: `.claude/rules/{architecture,ui-components,mobile,database}.md`
- External (user-named): swustats.net — [APIs](https://swustats.net/TCGEngine/Stats/APIs.php); [SWU Meta Stats matchup matrix](https://swumetastats.com/meta/matchup-matrix); [Deck Star](https://deck-star.com/)
