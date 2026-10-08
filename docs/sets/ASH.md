# Ashes of the Empire (ASH)

> **LLM INSTRUCTION**: Keep this document up to date whenever ASH-related pack generation logic, belt assignments, rarity weights, placeholder assumptions, or visibility gates change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | ASH |
| Set Number | 8 |
| Set Name | Ashes of the Empire |
| Prerelease Date | 2026-07-10 |
| Release Date | 2026-07-17 |
| Block | B |
| Color | `#8B0000` |
| Status | Spoiler Beta |

ASH is the second Block B set after LAW. It follows LAW-style pack construction while using a spoiler-season placeholder catalog for cards that are not yet revealed.

## Availability

ASH does not appear in set selectors until both gates pass:

1. **Access/date gate**: prerelease date has arrived, or the caller passes `includeBeta: true` for beta/admin users.
2. **Real-card gate**: the generated catalog contains at least one real, non-placeholder ASH card from SWUAPI.

ASH Carbonite uses the same real-card gate. Unresolved ASH placeholders alone are not enough to show either ASH entry.

## Spoiler Placeholder Catalog

During spoiler season, `npm run fetch-cards` writes real SWUAPI cards to `src/data/cards.raw.json`, then `scripts/postProcessCards.ts` merges placeholders into `src/data/cards.json`.

The placeholder catalog:

- Uses bucket-slot IDs such as `ash-slot:normal:main:rare:vigilance:001`.
- Does not assign collector numbers to unresolved placeholders.
- Infers pack-critical bucket metadata only: rarity, aspect bucket, treatment, and leader/base type when the slot proves it.
- Leaves unknown gameplay fields blank: cost, power, HP, text, traits, arenas, artist, images, and main-deck card type.
- Generates Normal, Hyperspace, and Hyperspace Foil placeholders for the pack-facing buckets.
- Starts from a SEC-like aspect distribution with 24 LAW-symmetric main-deck multicolor slots and 2 primary-primary leader slots.

Saved pools and drafts store card JSON in the DB, but API reads resolve stored card objects against the current catalog. When enough real cards arrive in a bucket, old higher-index placeholder slots deterministically hydrate to matching real cards without a DB migration.

## Current Bucket Assumptions

| Category | Count |
|----------|-------|
| Leaders (Common) | 8 |
| Leaders (Rare) | 8 |
| Leaders (Special) | 2 |
| Leaders (Total) | 18 |
| Bases (Common) | 8 |
| Bases (Total) | 8 |
| Main-deck Commons | 100 |
| Main-deck Uncommons | 60 |
| Main-deck Rares | 50 |
| Main-deck Legendaries | 20 |
| Main-deck Specials | 8 |
| Normal Slots | 264 |

These counts are assumptions for pack integrity during spoiler season. Update the placeholder service when spoiled cards contradict a bucket.

## Pack Rules

ASH follows LAW-style Block B construction:

- 1 leader
- 1 base
- 9 commons
- Slot 5 is a guaranteed Hyperspace common
- 1 Hyperspace-foil slot
- 3 uncommons
- 1 rare or legendary
- Prestige can appear through the existing Set 7+ UC3 upgrade path

Exports and play integrations reject decks or pools that still contain ASH placeholders. Placeholders are playable inside SwuPod, but external tools need real cards.

## Daily Spoiler Sync

1. Run `npm run fetch-cards`.
2. Check the ASH summary in the post-process output: real count, placeholder count, and spoiled normal count.
3. Run `npm run test:data`, `npm run test:utils`, and the ASH placeholder service tests.
4. Confirm beta set selection shows ASH only after at least one real ASH card is present.
5. Deploy the generated `src/data/cards.json`.

## Related Files

- [src/services/cards/ashPlaceholderCatalog.ts](../../src/services/cards/ashPlaceholderCatalog.ts) - ASH bucket assumptions and placeholder generation
- [src/services/cards/cardCatalogResolver.ts](../../src/services/cards/cardCatalogResolver.ts) - Read-time stale placeholder resolution
- [src/services/cards/setSpoilerOverview.ts](../../src/services/cards/setSpoilerOverview.ts) - Spoiler catalog page data summary
- [src/utils/setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) - Set configuration
- [src/utils/api.ts](../../src/utils/api.ts) - Set visibility gates
- [src/utils/cardData.ts](../../src/utils/cardData.ts) - Card metadata helpers
- [src/utils/boosterPack.ts](../../src/utils/boosterPack.ts) - LAW-style pack assembly
- [LAW.md](LAW.md) - Block B reference doc
