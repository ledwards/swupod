# ASH (Ashes of the Empire) - TBD Items

This document tracks what we don't yet know about Set 8 and need to verify as cards are spoiled and once physical packs are available.

## Card Data TBDs

### 1. Real Card Data
**Current status:** 0 ASH cards in [cards.json](../../src/data/cards.json). Set is fully scaffolded but will not appear in any set selector until `hasCardsForSet('ASH')` returns true.
**How to update:** `npm run fetch-cards` (auto-runs at prebuild). As FFG/swuapi publish spoiler cards, they will land in `cards.json` and ASH will become visible behind the beta flag.
**File:** [src/data/cards.json](../../src/data/cards.json)

### 2. Card Counts
**Current assumption:** Copied verbatim from LAW (100 C, 60 UC, 47 R, 20 L, 10 S; 18 leaders, 12 bases).
**To verify:** Final counts from the FFG product page or final spoiler tally.
**File:** [src/utils/setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) - `cardCounts`

## Pack Collation TBDs

### 3. Foil Slot Rules
**Current assumption:** Inherited from LAW — foil slot is always Hyperspace Foil, no regular foils.
**To verify:** Confirm via FFG announcement or physical packs that ASH follows LAW's no-regular-foils rule.
**File:** [src/utils/setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) - `packRules.foilSlotIsHyperspaceFoil`

### 4. Guaranteed Hyperspace Common Slot
**Current assumption:** Slot 5 (same as LAW).
**To verify:** Open physical packs and confirm the HS common slot position.
**File:** [src/utils/setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) - `packRules.hyperspaceCommonSlot`

### 5. Prestige Pull Rate
**Current assumption:** ~1/18 packs, UC3 slot, same as LAW.
**To verify:** Confirm from box openings and any FFG product announcement.
**File:** [src/utils/setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) - `upgradeProbabilities.uc3ToPrestige`

### 6. Showcase Leader Rate
**Current assumption:** ~1/576 (LAW's `SET_7_PLUS_CONSTANTS.showcaseLeaderRate`).
**To verify:** Actual showcase leader rate from box openings.
**File:** [src/utils/packConstants.ts](../../src/utils/packConstants.ts) - `SET_7_PLUS_CONSTANTS.showcaseLeaderRate`

### 7. Triple-Aspect Cards
**Current assumption:** `tripleAspect.enabled: true` with `primaryAspectPriority`. The ASH config comment says "fewer than LAW" but the actual count is unknown.
**To verify:** Inspect spoiled triple-aspect cards as they appear and confirm the first-listed-aspect belt rule still applies.
**File:** [src/utils/setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) - `tripleAspect`

### 8. Belt Assignment (Block B)
**Current assumption:** Identical to LAW — Vigilance/Aggression first → Belt A, Cunning/Command first → Belt B, with mono-faction (Villainy-only, Heroism-only) on Belt A. Inherited via the existing Block B branch in [commonBeltAssignments.ts](../../src/belts/data/commonBeltAssignments.ts).
**To verify:** Once enough commons are spoiled, sanity check the aspect split. If physical packs reveal different rules, add an ASH-specific branch.

### 9. Hidden Hand / Faction Overrides
**Current assumption:** None. LAW required a single neutral-to-Belt-A override (`Hidden Hand Supplier`). Whether ASH needs similar manual overrides is unknown.
**To verify:** From physical packs.

## Variant Data TBDs

### 10. Hyperspace Foil Variants
**Current assumption:** Same `HyperfoilBelt` fallback chain as LAW (HSF → Hyperspace → Normal).
**To verify:** Whether HSF variant data lands in the API ahead of release. If yes, the belt automatically prefers HSF variants — no code change needed.
**File:** [src/belts/HyperfoilBelt.ts](../../src/belts/HyperfoilBelt.ts)

### 11. Prestige Variants
**Current assumption:** Placeholder, same as LAW.
**To verify:** Prestige tier 1 card data as it appears in the API.

## Asset TBDs

### 12. Expansion Art
**Current status:** [public/expansion-art/ash.png](../../public/expansion-art/ash.png) from starwarsunlimited.com.
**To verify:** Whether this is final or will be replaced as FFG updates the product page.

### 13. Pack Art
**Current status:** Mapped in [packArt.ts](../../src/utils/packArt.ts).
**To verify:** Final pack art may differ from current placeholder.

## Limited / Draft Play TBDs

### 14. Leader Rankings
**Current status:** Not added. Will be sourced post-release from Dexerto / GarbageRollers / swumetastats / community consensus.
**File:** [src/bots/behaviors/PopularLeaderBehavior.ts](../../src/bots/behaviors/PopularLeaderBehavior.ts)

### 15. Powerful Cards
**Current status:** Not added. Bot AI cannot meaningfully draft ASH until this list exists.
**File:** [src/bots/data/powerfulCards.ts](../../src/bots/data/powerfulCards.ts)

---

## How to Update

When a TBD is resolved:
1. Update the relevant code file
2. Add a note here with the resolution
3. Move the item to a "Resolved" section at the bottom
4. Update release notes if user-facing

## Resolved

_(none yet)_
