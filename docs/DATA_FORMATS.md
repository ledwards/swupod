# Data Format Conventions

This document describes the canonical data formats used throughout the codebase. **Follow these conventions strictly** to avoid inconsistencies.

## Pack Format

### Canonical Format: Object with `cards` property

```javascript
// ✅ CORRECT - Canonical pack format
{
  cards: [
    { id: '123', name: 'Luke Skywalker', ... },
    { id: '456', name: 'Darth Vader', ... },
    ...
  ]
}
```

```javascript
// ❌ WRONG - Raw array format (DO NOT USE)
[
  { id: '123', name: 'Luke Skywalker', ... },
  { id: '456', name: 'Darth Vader', ... },
]
```

### Why Object Format?

1. **Extensibility**: Can add metadata without breaking changes
   ```javascript
   {
     cards: [...],
     packNumber: 1,
     openedAt: '2024-01-15T10:00:00Z',
     setCode: 'SOR'
   }
   ```

2. **Self-documenting**: Clear what the data represents

3. **Consistency**: `generateBoosterPack()` returns this format

### Where Packs Are Used

| Location | Format | Notes |
|----------|--------|-------|
| `generateBoosterPack()` return | `{ cards: [...] }` | Source of truth |
| `generateSealedPod()` return | `[{ cards: [...] }, ...]` | Array of pack objects |
| `generateDraftPacks()` return | `packs: [[{ cards }, ...], ...]` | Nested: `[player][pack]` |
| `card_pools.packs` (DB) | `[{ cards: [...] }, ...]` | Stored as JSON |
| `draft_pods.all_packs` (DB) | `[[{ cards }, ...], ...]` | Nested: `[player][pack]` |
| `draft_pod_players.current_pack` (DB) | `[...]` | **Exception**: Just the cards array |

### The `current_pack` Exception

`current_pack` stores just the cards array (not a pack object) because:
- It represents "the cards I'm currently picking from"
- It's derived/extracted from a pack, not a full pack
- Simpler for pick logic which only needs the cards

When assigning `current_pack` from a pack object:
```javascript
// ✅ CORRECT - Extract cards when assigning to current_pack
const pack = allPacks[playerIndex][packNumber]
const packCards = pack.cards || pack  // Handle both formats for safety
await query('UPDATE ... SET current_pack = $1', [JSON.stringify(packCards)])
```

## Card Format

Cards are objects with these key fields:

```javascript
{
  id: '1234',              // Internal unique ID (string)
  cardId: 'SOR-001',       // Display ID (set-number format)
  name: 'Luke Skywalker',
  subtitle: 'Jedi Knight',
  type: 'Leader',          // Leader, Base, Unit, Event, Upgrade
  rarity: 'Rare',          // Common, Uncommon, Rare, Legendary, Special
  variantType: 'Normal',   // Normal, Hyperspace, Showcase, Foil
  set: 'SOR',
  aspects: ['Heroism', 'Vigilance'],

  // Derived flags
  isLeader: true,
  isBase: false,
  isFoil: false,
  isHyperspace: false,
  isShowcase: false,

  // Draft-specific (added during draft)
  instanceId: '1234_0',    // Unique per-card-instance in draft
  pickNumber: 5,           // Which pick this was
}
```

### Card ID Fields

- `id`: Internal unique ID used for lookups in card cache
- `cardId`: Display ID (e.g., "SOR-001") used for exports and display
- `instanceId`: Unique instance ID added during draft to prevent collisions

## Historical Note

Prior to migration 023, draft packs were incorrectly stored as raw arrays due to a bug where `draftLogic.js` did `playerPacks.push(pack.cards)` instead of `playerPacks.push(pack)`. This has been fixed and existing data migrated.

**Lesson learned**: When working with domain objects, maintain their structure throughout the pipeline. Don't extract/flatten unless there's a specific reason (like `current_pack`).
