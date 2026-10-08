# LAW (A Lawless Time) - TBD Items

This document tracks things we don't know yet about Set 7 pack collation and need to verify once we have physical packs and more data.

## Pack Collation TBDs

### 1. Guaranteed Hyperspace Common Slot Position
**Current assumption:** Slot 5 (middle common, 1-indexed)
**To verify:** Open physical packs and track which slot has the HS common
**File:** `src/utils/setConfigs/LAW.ts` - `packRules.hyperspaceCommonSlot`

### 2. Hyperspace Foil (HSF) Slot - Using Hyperspace Variants as Placeholder
**Current assumption:** No HSF variant data exists in the API yet. The HyperfoilBelt falls back to Hyperspace variant cards (234 non-L/B cards) with `isFoil: true` + `isHyperspace: true` flags. These display with the Hyperspace card art + foil shimmer CSS overlay.
**Fallback chain:** `Hyperspace Foil` → `Hyperspace` → `Normal` (see `HyperfoilBelt.ts` lines 72-89)
**Rarity weights:** Using LAW config's `hyperspaceFoilSlotWeights` (C:65%, UC:20%, R:8%, S:4%, L:3%)
**When to update:** Run `npm run fetch-cards` when HSF card data appears on swuapi.com. The belt will automatically prefer HSF variants — no code change needed.
**File:** `src/belts/HyperfoilBelt.ts`

### 3. Can Rare Bases Appear as Hyperspace Foil?
**Current assumption:** Unknown - currently rare bases can appear in foil slot but unclear if HSF versions exist
**To verify:** Check if HSF rare bases exist in card data or physical packs

### 4. Prestige Cards in Standard Packs
**Current assumption:** ~1 per box (1/24 packs), replaces rare slot
**Implementation:** Currently placeholder/TODO in `boosterPack.ts`
**To verify:** Confirm prestige pull rate from physical boxes
**File:** `src/utils/boosterPack.ts` - search for "Prestige"

### ~~5. Common Belt Assignments~~ → RESOLVED (see below)

### ~~6. Triple-Aspect Card Belt Assignment~~ → RESOLVED (see below)

### 7. Showcase Leader Pull Rate
**Current assumption:** ~1 in 576 packs (double the previous 1/288)
**FFG announcement:** "Showcase leaders are significantly rarer" in LAW
**To verify:** Actual showcase leader rate from box openings
**File:** `src/utils/packConstants.ts` - `SET_7_PLUS_CONSTANTS.showcaseLeaderRate`

## Data TBDs

### 8. Card Data Auto-Refresh
**Current status:** `npm run fetch-cards` runs automatically at build time (prebuild). Card counts in `src/utils/setConfigs/LAW.ts` were updated to match current API data (100 C, 60 UC, 47 R, 20 L, 10 S) but may change as more cards are added.
**Note:** The LAW config comment still says "preliminary" — update when data is finalized.
**File:** `src/utils/setConfigs/LAW.ts`, `package.json` prebuild script

### 9. Special Rarity Cards
**Current count:** 10 Special cards (2 starter leaders + 1 starter base + 7 others)
**To verify:** Final count of Special rarity cards in LAW

## Assets TBDs

### 10. Expansion Art
**Current status:** Using `public/expansion-art/law.png` — appears in set picker, pool headers, draft lobbies, and all background treatments.
**To verify:** Is this the final art or will it be updated?

### 11. Pack Art
**Current status:** Using `public/pack-images/law-pack.png` — appears in pack opening animation.
**To verify:** Is this the final pack art or placeholder?

---

## How to Update

When a TBD is resolved:
1. Update the relevant code file
2. Add a note here with the resolution
3. Move the item to a "Resolved" section at the bottom
4. Update release notes if user-facing

## Resolved

### Rare Bases in Rare Slot
**Resolved:** LAW uses `rareBasesInRareSlot: true` — rare bases go in the rare slot, same as all previous sets.

### Card Data Completeness
**Resolved:** Full card data now available (264 Normal cards, 264 Hyperspace, 2 Showcase = 530 total). Auto-refreshed via `npm run fetch-cards` in prebuild.

### Foil Slot Is Always Hyperspace Foil
**Resolved:** Confirmed per FFG announcement. `foilSlotIsHyperspaceFoil: true` in LAW config. No regular foils in LAW packs. Currently using Hyperspace variants as placeholder (see TBD #2 above).

### Common Belt Assignments (TBD #5)
**Resolved:** Verified from physical pack openings. LAW uses different belt rules than Block A:
- Belt A (50): Vigilance first, Aggression first, Villainy-only, Heroism-only, + Hidden Hand Supplier (override)
- Belt B (50): Cunning first, Command first, Neutral (no aspects) − Hidden Hand Supplier
- Double/triple-aspect cards assigned by first-listed aspect (same as before)
- `autoAssign: true` still used, but `assignCardToBelt()` now has Block B-specific logic

### Triple-Aspect Card Belt Assignment (TBD #6)
**Resolved:** First-listed-aspect rule confirmed from physical packs. Triple-aspect cards use first aspect for belt assignment, same as double-aspect cards.
