# Data API Migration - January 2025

This document records the migration to the updated swuapi.com API and verification of card counts against official sources.

## Summary

On January 30, 2025, the card data was refreshed from the swuapi.com API. This migration:

1. Added previously missing cards across all sets
2. Fixed a bug where "Force Token" cards were not being filtered out
3. Verified all card counts against official sources

## Changes Made

### 1. Token Filter Bug Fix

**File:** `scripts/cardFixes.js`

The token filter was only catching types that *started* with "Token" (e.g., "Token Unit", "Token Upgrade") but missed types that *ended* with "Token" (e.g., "Force Token").

```javascript
// Before (missed "Force Token")
if (type.startsWith('Token')) return false

// After (catches all token types)
if (type.includes('Token')) return false
```

**Impact:** LOF set was incorrectly showing 265 cards instead of 264 due to "The Force" (Force Token) being included.

### 2. New API Data

The updated API now includes:

- **Foil variants for Sets 1-3** (SOR, SHD, TWI) - 218 Foil cards each
- **Additional Hyperspace cards** for Sets 1-3 - now 252 each
- **Previously missing single-aspect cards** across all sets

### 3. Updated Test Expectations

**File:** `src/data/cardCounts.test.js`

All expected values updated to match official sources.

## Verified Card Counts

| Set | Code | Total Normal | Source |
|-----|------|-------------|--------|
| Spark of Rebellion | SOR | 252 | [Card Gamer](https://cardgamer.com/games/tcgs/star-wars/star-wars-unlimited-card-list/), [TCDB](https://www.tcdb.com/ViewSet.cfm/sid/412044) |
| Shadows of the Galaxy | SHD | 262 | [Card Gamer](https://cardgamer.com/games/star-wars-unlimited-shadows-of-the-galaxy-card-list/) |
| Twilight of the Republic | TWI | 257 | [StarWarsUnlimited.gg](https://starwarsunlimited.gg/twilight-of-the-republic/), eBay complete sets show 257/257 |
| Jump to Lightspeed | JTL | 262 | [Card Gamer](https://cardgamer.com/guides/star-wars-unlimited-jump-to-lightspeed-card-list/) |
| Legends of the Force | LOF | 264 | [Beckett](https://www.beckett.com/news/star-wars-unlimited-legends-of-the-force-checklist-full-set-5-card-list/) |
| Secrets of Power | SEC | 264 | [Beckett](https://www.beckett.com/news/star-wars-unlimited-secrets-of-power-checklist-and-set-details/) |

### Rarity Breakdown by Set (Normal variant, excluding Leaders/Bases)

| Set | Common | Uncommon | Rare | Legendary | Special |
|-----|--------|----------|------|-----------|---------|
| SOR | 90 | 60 | 48 | 16 | - |
| SHD | 90 | 60 | 52 | 16 | - |
| TWI | 90 | 60 | 48 | 16 | 15 |
| JTL | 98 | 60 | 45 | 20 | - |
| LOF | 100 | 60 | 46 | 20 | 10 |
| SEC | 100 | 60 | 50 | 20 | - |

### Leaders and Bases per Set (Normal variant)

| Set | Leaders | Common Leaders | Rare Leaders | Bases | Common Bases | Rare Bases |
|-----|---------|----------------|--------------|-------|--------------|------------|
| SOR | 18 | 8 | 8 | 12 | 8 | 4 |
| SHD | 18 | 8 | 8 | 8 | 8 | 0 |
| TWI | 18 | 8 | 8 | 12 | 8 | 4 |
| JTL | 18 | 8 | 8 | 13 | 8 | 5 |
| LOF | 18 | 8 | 8 | 12 | 8 | 4 |
| SEC | 18 | 8 | 8 | 8 | 8 | 0 |

## How to Refresh Card Data

```bash
# Fetch fresh data from API and apply fixes
node scripts/fetchCards.js

# Run card count validation tests
node src/data/cardCounts.test.js
```

## Known Issues

### Pre-existing Booster Pack Bug

There is an intermittent bug in `src/utils/boosterPack.js` where approximately 1-2% of generated packs are missing a leader. This appears to be a card object mutation issue unrelated to the API migration. The bug manifests as:

- Pack has 16 cards but no Leader type
- First card shows corrupted data (wrong name/type but correct ID)

This issue predates the API migration and requires separate investigation.

## Files Modified

- `scripts/cardFixes.js` - Fixed token filter to catch "Force Token"
- `src/data/cardCounts.test.js` - Updated expected values to match official counts
- `src/data/cards.json` - Refreshed from API (generated file)

## Verification Commands

```bash
# Run all card count tests (should show 204 passed)
node src/data/cardCounts.test.js

# Check card counts by set
node -e "
const data = require('./src/data/cards.json');
const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC'];
sets.forEach(set => {
  const normal = data.cards.filter(c => c.set === set && c.variantType === 'Normal');
  console.log(set + ':', normal.length);
});
"
```
