# SWUDB JSON Export Specification

This document describes the JSON format expected by [SWUDB](https://swudb.com) for deck imports.

## Card ID Format

SWUDB expects card IDs in the format: `SET_XXX`

- **SET**: 3-letter set code (e.g., `SOR`, `SHD`, `TWI`, `JTL`, `LOF`, `SEC`)
- **_**: Underscore separator (not hyphen)
- **XXX**: 3-digit zero-padded card number

### Examples

| Our Internal ID | SWUDB Export ID |
|-----------------|-----------------|
| `SEC-12`        | `SEC_012`       |
| `SOR-8`         | `SOR_008`       |
| `SOR-200`       | `SOR_200`       |
| `JTL-1`         | `JTL_001`       |

## JSON Structure

```json
{
  "metadata": {
    "name": "[PTP] Pool Name",
    "author": "Protect the Pod"
  },
  "leader": {
    "id": "SOR_005",
    "count": 1
  },
  "base": {
    "id": "SOR_029",
    "count": 1
  },
  "deck": [
    { "id": "SOR_195", "count": 1 },
    { "id": "SOR_044", "count": 2 }
  ],
  "sideboard": [
    { "id": "SOR_100", "count": 1 }
  ]
}
```

## Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metadata.name` | string | No | Deck name (we prefix with `[PTP]`). **Max 80 chars** (SWUDB limit). |
| `metadata.author` | string | No | Always "Protect the Pod" |
| `leader` | object | Yes | Leader card with `id` and `count` (always 1) |
| `base` | object | Yes | Base card with `id` and `count` (always 1) |
| `deck` | array | Yes | Array of main deck cards |
| `sideboard` | array | Yes | Array of sideboard cards |

## Card Entry Format

Each card entry in `deck` or `sideboard` arrays:

```json
{
  "id": "SET_XXX",  // SWUDB-formatted card ID
  "count": N        // Number of copies (1-3 for most cards)
}
```

## Deck Name Rules

- **Max length**: `metadata.name` must be 80 characters or fewer (SWUDB import rejects longer names)
- **Format**: `[PTP] {pool name}` — the `[PTP]` prefix uses 6 characters
- **Auto-generated**: Default name is `{SetCode} {Format} ({Leader} {BaseColor})`, e.g., `SEC Sealed (Jabba the Hutt Green)`
- **No dates**: Pool names do not include creation dates
- **User editable**: Users can rename via the EditableTitle component (enforces 80 char limit with error message)
- **Truncation**: All export paths truncate `metadata.name` to 80 chars as a safety net

## Variant Handling

When exporting, all card variants (Hyperspace, Foil, Showcase, Hyperspace Foil) are converted to their Normal variant's card ID. SWUDB only recognizes Normal variant IDs.

## Public API Endpoint

Decks can be accessed programmatically via the public endpoint:

```
GET /api/pools/:shareId/deck.json
```

### Example Request

```bash
curl https://protectthepod.com/api/pools/abc123/deck.json
```

### Example Response

```json
{
  "metadata": {
    "name": "[PTP] My Draft Deck",
    "author": "Protect the Pod"
  },
  "leader": { "id": "SOR_005", "count": 1 },
  "base": { "id": "SOR_029", "count": 1 },
  "deck": [
    { "id": "SOR_195", "count": 1 },
    { "id": "SOR_044", "count": 2 }
  ],
  "sideboard": [
    { "id": "SOR_100", "count": 1 }
  ]
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 404 | Pool not found |
| 400 | No deck has been built for this pool yet |

### Integration with External Tools

This endpoint is designed for integration with:
- **Karabast.net** - If they add our domain to their import sources
- **Other tools** - Any tool that accepts SWUDB-format JSON

To import a deck, use the full URL:
```
https://protectthepod.com/api/pools/{shareId}/deck.json
```

## Implementation

The export logic is in:
- `app/api/pools/[shareId]/deck.json/route.ts` - Public API endpoint
- `src/hooks/useDeckExport.ts` - Export hook used by DeckBuilder
- `src/utils/variantDowngrade.ts` - Card ID formatting and variant resolution

The `formatCardIdForExport()` function converts internal IDs to SWUDB format:

```javascript
// Converts "SEC-12" to "SEC_012"
function formatCardIdForExport(cardId) {
  const parts = cardId.split('-')
  const [setCode, numberStr] = parts
  const number = parseInt(numberStr, 10)
  const paddedNumber = number.toString().padStart(3, '0')
  return `${setCode}_${paddedNumber}`
}
```

## References

- [SWUDB Deck Builder](https://www.swudb.com/decks/)
- [Limitless Decklist Submission](https://docs.limitlesstcg.com/player/decklists) (uses same format)
