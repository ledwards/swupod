# Development Log

A running log of development sessions, decisions, and ongoing work.

---

## 2025-01-31: Booster Pack Leader Bug Fix & Variant Downgrade Refactoring

**Focus:** Fixed the intermittent booster pack leader corruption bug and refactored variant downgrade utilities.

### Completed

- [x] Changed card ID from constructed `{setCode}-{cardNumber}` to unique `strapiId` from API
- [x] Added `cardId` field for display purposes (e.g., "SOR-11")
- [x] Fixed `findHyperspaceVariant()` and `findShowcaseVariant()` to match by `type` in addition to `name` and `rarity`
- [x] Created robust `variantDowngrade.js` utility for export functionality
- [x] Replaced fragile heuristics (number >= 253, ID suffix stripping) with `variantType === 'Normal'` lookup
- [x] Added 13 unit tests for variant downgrade functionality
- [x] Updated DeckBuilder.jsx and play/page.js to use new utility
- [x] All 36 booster pack tests passing
- [x] All 13 variant downgrade tests passing
- [x] All 204 card count tests passing

### Root Cause Analysis

The bug had two contributing factors:

1. **Non-unique IDs:** The constructed ID `{setCode}-{cardNumber}` was not unique across variants. For example, `SOR-11` could be both "Grand Inquisitor" (Normal Leader) and "Leia Organa" (Hyperspace Unit from Organized Play).

2. **Variant lookup by name only:** `findHyperspaceVariant()` searched for cards matching `name + variantType + rarity`, but some characters (e.g., "Leia Organa") exist as both Leaders and Units. The function would return the wrong card type.

### The Fix

```javascript
// Before: Could match Unit "Leia Organa" when looking for Leader "Leia Organa"
const hsVariant = allCards.find(c =>
  c.name === card.name &&
  c.variantType === 'Hyperspace' &&
  c.rarity === card.rarity
)

// After: Also matches by type to prevent Leader/Unit confusion
const hsVariant = allCards.find(c =>
  c.name === card.name &&
  c.variantType === 'Hyperspace' &&
  c.rarity === card.rarity &&
  c.type === card.type  // Added this check
)
```

### Variant Downgrade Refactoring

The old implementation used fragile heuristics that wouldn't work with `strapiId`:
- `getCardNumber()` extracted numbers from IDs like "SOR-11", but `strapiId` is just a number
- `isVariantNumber()` assumed card numbers >= 253 are variants
- `normalizeId()` stripped suffixes like `_Foil` that don't exist in the new format

The new implementation uses the actual data:
```javascript
// New robust approach: filter by variantType === 'Normal'
export function buildBaseCardMap(setCode) {
  const cards = getCachedCards(setCode)
  const nameTypeToBaseCard = new Map()

  cards.forEach(card => {
    if (card.variantType !== 'Normal') return
    const key = `${card.name}|${card.type}`
    if (!nameTypeToBaseCard.has(key)) {
      nameTypeToBaseCard.set(key, card)
    }
  })

  return nameTypeToBaseCard
}

export function getBaseCardId(card, baseCardMap) {
  const key = `${card.name}|${card.type}`
  const baseCard = baseCardMap?.get(key)
  // Return cardId (e.g., "SOR-11") in underscore format for swudb.com
  return baseCard?.cardId?.replace(/-/g, '_') || card.cardId?.replace(/-/g, '_')
}
```

### Files Changed

- `scripts/fetchCards.js` - Use `strapiId` as unique ID, add `cardId` for display
- `src/utils/boosterPack.js` - Add type matching to variant lookup functions
- `src/utils/variantDowngrade.js` - New utility for export functionality (created)
- `src/utils/variantDowngrade.test.js` - 13 unit tests (created)
- `src/components/DeckBuilder.jsx` - Use new variantDowngrade utility
- `app/pool/[shareId]/deck/play/page.js` - Use new variantDowngrade utility
- `src/data/cards.json` - Regenerated with new ID structure
- `package.json` - Added variantDowngrade tests to test:utils

---

## 2025-01-30: API Migration & Card Count Verification

**Focus:** Migrating to updated swuapi.com API and verifying card data accuracy.

### Completed

- [x] Refreshed card data from updated API
- [x] Fixed token filter bug (`startsWith` → `includes` for "Force Token")
- [x] Verified card counts against official sources (Card Gamer, Beckett, TCDB)
- [x] Updated test expectations to match canonical counts
- [x] All 204 card count tests passing
- [x] Created migration documentation (`docs/DATA_API_MIGRATION_2025_01.md`)

### Discovered Issues

- **Booster pack leader bug:** ~1-2% of packs are missing leaders due to card object corruption. **FIXED in 2025-01-31 session.**

### Key Decisions

1. **Token filtering:** Changed from `type.startsWith('Token')` to `type.includes('Token')` to catch all token types including "Force Token"
2. **LOF count:** Official count is 264 (per Beckett), not 265. The extra card was "The Force" Force Token.

### Files Changed

- `scripts/cardFixes.js` - Token filter fix
- `src/data/cardCounts.test.js` - Updated expected values
- `src/data/cards.json` - Refreshed data (generated)

### Reference Links

- [Card Gamer - SOR Card List](https://cardgamer.com/games/tcgs/star-wars/star-wars-unlimited-card-list/)
- [Beckett - LOF Checklist](https://www.beckett.com/news/star-wars-unlimited-legends-of-the-force-checklist-full-set-5-card-list/)
- [Beckett - SEC Checklist](https://www.beckett.com/news/star-wars-unlimited-secrets-of-power-checklist-and-set-details/)

---

## Template for Future Sessions

```markdown
## YYYY-MM-DD: Session Title

**Focus:** Brief description of main objective.

### Completed

- [x] Task 1
- [x] Task 2

### In Progress

- [ ] Task 3

### Discovered Issues

- Description of any bugs or issues found

### Key Decisions

1. Decision and rationale

### Files Changed

- `path/to/file.js` - Description of change

### Notes for Next Session

- Follow-up items
```
