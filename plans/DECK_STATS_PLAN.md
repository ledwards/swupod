# Deck Stats Plan

Stats for the deck you're building, measured against your whole pool. Mocks: https://claude.ai/artifact/BbuExukTfHrrWdWTExioPm

## Decisions (settled 2026-10-12)

- **Alpha only, on `codex/alpha`.** Work lives on `claude/deckbuilder-stats-alpha` (cherry-picked onto `origin/codex/alpha`). Every surface is gated to alpha testers and admins: the drawer via `useAuth()` (`is_alpha_tester || is_admin`) in DeckBuilder, the Build tab server-side via `viewerHasAlphaAccess()` (non-alpha viewers get neither the tab nor its data). Everyone else keeps the current Stats button that opens the stats page.

- **In the builder**, the existing header Stats button opens a live side drawer (bottom sheet on phones) instead of opening `/pools/:id/deck/stats` in a new tab. The drawer links to the page with a plain "Full stats" button (no arrow glyph).
- **List rows** (Your Stats pools, History) keep their Stats button pointing at the page.
- **The stats page** gets a new **Build** tab with the same modules in two columns. It is the default tab when the deck has no recorded games.
- **Swiss:** the drawer and Build tab stay available during a competitive event. Gameplay tabs stay hidden until it ends.
- **Bases:** all bases in the set count as available, not only the bases in your pool.
- **Wording:** cards not in the deck are the **Sideboard** (matches `section: 'sideboard'` in code).
- **Meta tab** is Friends of the Pod only. Non-patrons see the tab button disabled with a tooltip explaining why. Never label the button "FOP".

## Visual rules (from review)

- Aspects always use the aspect art icons (`AspectIcon`), never coloured dots.
- Prefer an overlay for the comparison series: deck drawn solid over a dashed pool outline in the same chart (cost curve, aspects, type, rarity, trait/keyword chips).
- Traits use the card-text treatment from wayfinder-ios: bold italic caps. Keywords: bold caps in keyword red.
- Rarity always shows all five rows (Common, Uncommon, Rare, Legendary, Special), even at zero.
- Card rows in tables show the aspect icon and the cost with the cost icon, not a rarity glyph.

## Definitions

- **Deck:** `section === 'deck' && visible && enabled !== false`, excluding leader and base (same filter as `getDeckCards`).
- **Pool:** every non-leader, non-base card in the pool (deck + sideboard).
- **Aspect penalty:** `calculateAspectPenalty(card, leader, base)` from `src/services/cards/aspectPenalties.ts` (handles leader exceptions).
- **T1 plays:** cards whose cost + aspect penalty is ≤ 2 (2 resources on turn 1).
- **Bombs:** cards graded A− or better in the set's published Limited ratings (`src/data/activeLimitedRatings.json`, via `activeEntryFor`). Hidden while the set's ratings are not `published`.
- **Aspect pairings:** clicking an aspect splits its cards by their full aspect combination: the aspect alone, paired with each other aspect, or doubled (e.g. Vigilance ×2).
- **Base synergy (per set):** a set config lists base traits that cards reference (HMW: Kashyyyk, Naboo, Endor, Tatooine). A card has synergy with a trait when its text mentions "<trait> base". Shown as one tile per trait: the cards that turn on, deck solid and sideboard faded, plus that trait's bases with aspect icons.

## Phases

### Phase 1: Drawer in the deckbuilder (done)
1. `src/services/deckStats/` (pure, tested)
   - `composition.ts`: summary (count, avg cost deck vs pool, ground/space units, T1 plays, penalty cards), aspects + pairings, cost curve buckets 0..7+ by ground/space/event/upgrade with pool totals, type rows, rarity rows, trait and keyword counts.
   - `baseSynergy.ts`: per-trait synergy tiles from `SetConfig.baseTraitSynergy`.
   - `bombs.ts`: bomb list from published ratings.
2. `SetConfig.baseTraitSynergy?: string[]`, set only on HMW. Past sets unchanged.
3. `src/components/DeckBuilder/DeckStats/`: `DeckStatsDrawer`, `OverlayRow`, `CostCurve`, `StatChips`, `BaseSynergyTiles`, CSS. Deck / Sideboard toggle.
4. Header Stats button toggles the drawer (active state while open). Shown during Swiss.
5. Phone: the drawer renders as a bottom sheet.

### Phase 2: Build tab on `/pools/:id/deck/stats` (done)
Server page computes the same stats from the saved deck and pool with the same service. Two-column layout. Default tab when the deck has no games.

### Phase 3: List rows
Mini curve and aspect icons with counts on Your Stats pool rows; Stats button on History rows. Narrow rows drop the mini charts.

### Phase 4: Meta tab (Friends of the Pod)
Backed by `/api/stats/card-data` (already patron-gated, already computes 17L metrics and grades). Deck quality strip (GIH WR, deck solid over sideboard outlines, HMW and deck averages), sideboard upgrades (no extra penalty), full table: grade, GIH/OH/GD/GNS WR, IIH, GP WR, PWAR, PR, RWS%, ALSA, ATA, games. Deck / Sideboard / Pool toggle. Drawer shows a blurred preview for non-patrons.
