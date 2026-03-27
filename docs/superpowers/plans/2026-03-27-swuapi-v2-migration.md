# swuapi v2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate swupod to swuapi v2, which requires auth on all endpoints, uses cursor-paginated `/export/cards` instead of `/export/all`, returns snake_case field names, and uses UUID as the canonical card ID.

**Architecture:** Two files need to change: `scripts/fetchCards.ts` (the build-time card sync script) and `lib/deckImageApi.ts` (the runtime deck image generator). Both need auth headers. The fetch script also needs cursor pagination and updated field name mapping.

**Tech Stack:** TypeScript, Node.js `fetch`, tsx runner, Next.js env vars

---

## File Map

| File | Change |
|------|--------|
| `scripts/fetchCards.ts` | All three migrations: env vars, cursor pagination, field names + UUID key |
| `lib/deckImageApi.ts` | Add `SWUAPI_API_KEY` env var + auth header |
| `.env.example` | Document both env vars |

---

## Task 1: Auth and env vars

**Files:**
- Modify: `scripts/fetchCards.ts:13` (hardcoded URL) and `fetchAllCardsFromAPI()` (no auth)
- Modify: `lib/deckImageApi.ts:6` (add API key) and `:88-92` (no auth on deck-image request)
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

Create `/Users/lee/Repos/ledwards/swupod/.env.example` with:

```bash
# swuapi base URL (default: production)
SWUAPI_URL=https://api.swuapi.com

# swuapi API key — required for all endpoints except /health
# Get a key: node scripts/create-api-key.js swupod-local  (on local swuapi instance)
SWUAPI_API_KEY=
```

- [ ] **Step 2: Add env vars to `scripts/fetchCards.ts`**

Replace lines 13:

```typescript
const API_URL = 'https://api.swuapi.com/export/all'
```

with:

```typescript
const SWUAPI_BASE_URL = process.env.SWUAPI_URL || 'https://api.swuapi.com'
const SWUAPI_API_KEY = process.env.SWUAPI_API_KEY || ''
```

- [ ] **Step 3: Add auth header to `fetchAllCardsFromAPI()` in `scripts/fetchCards.ts`**

Replace the fetch call (line 100):

```typescript
const response = await fetch(API_URL)
```

with:

```typescript
const response = await fetch(`${SWUAPI_BASE_URL}/export/all`, {
  headers: { 'Authorization': `Bearer ${SWUAPI_API_KEY}` },
})
```

Also update the log message at line 97 to use the new URL variable:

```typescript
console.log(`Fetching all cards from ${SWUAPI_BASE_URL}/export/all...`)
```

- [ ] **Step 4: Add auth header to `lib/deckImageApi.ts`**

Add the API key constant after line 6:

```typescript
const SWUAPI_URL = process.env['SWUAPI_URL'] || 'https://api.swuapi.com'
const SWUAPI_API_KEY = process.env['SWUAPI_API_KEY'] || ''
```

Replace lines 88-92 in `generateDeckImage`:

```typescript
const res = await fetch(`${SWUAPI_URL}/deck-image`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
```

with:

```typescript
const res = await fetch(`${SWUAPI_URL}/deck-image`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SWUAPI_API_KEY}`,
  },
  body: JSON.stringify(body),
})
```

- [ ] **Step 5: Verify the app still builds**

```bash
npm run build
```

Expected: Build succeeds (or fails only on pre-existing errors, not on our changes).

- [ ] **Step 6: Commit**

```bash
git add scripts/fetchCards.ts lib/deckImageApi.ts .env.example
git commit -m "feat: add SWUAPI_URL/SWUAPI_API_KEY env vars and auth headers for swuapi v2"
```

---

## Task 2: Cursor pagination — replace `/export/all` with `/export/cards`

The old API returned `{ cards: [...] }` in one shot. The new API uses `GET /export/cards` with cursor pagination and returns `{ data: [...], total: N, has_more: bool, next_cursor: "..." }`.

**Files:**
- Modify: `scripts/fetchCards.ts` — replace `fetchAllCardsFromAPI()` and update `main()`

- [ ] **Step 1: Replace `fetchAllCardsFromAPI()` with a generic cursor-paginated `fetchAll()`**

Replace the entire `fetchAllCardsFromAPI()` function (lines 96–113) with:

```typescript
/**
 * Fetch all records from a paginated /export/:entity endpoint.
 * Follows cursor pagination until has_more is false.
 */
async function fetchAll(entity: string): Promise<ApiCard[]> {
  const results: ApiCard[] = []
  let cursor: string | null = null
  let page = 0

  console.log(`Fetching all ${entity} from ${SWUAPI_BASE_URL}/export/${entity}...`)

  do {
    const url = cursor
      ? `${SWUAPI_BASE_URL}/export/${entity}?cursor=${cursor}`
      : `${SWUAPI_BASE_URL}/export/${entity}`

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${SWUAPI_API_KEY}` },
    })

    if (!response.ok) {
      console.error(`Error fetching ${entity} (page ${page}): HTTP ${response.status}`)
      if (response.status === 401) {
        console.error('→ Check that SWUAPI_API_KEY is set correctly.')
      }
      return []
    }

    const data = await response.json() as { data: ApiCard[]; total: number; has_more: boolean; next_cursor: string | null }
    results.push(...data.data)
    cursor = data.has_more ? data.next_cursor : null
    page++
    console.log(`  Page ${page}: +${data.data.length} cards (total so far: ${results.length} / ${data.total})`)
  } while (cursor)

  return results
}
```

- [ ] **Step 2: Update `main()` to call `fetchAll('cards')` instead of the old function**

Replace line 202:

```typescript
const apiCards = await fetchAllCardsFromAPI()
```

with:

```typescript
const apiCards = await fetchAll('cards')
```

Also update the error check message at line 209 to match (already uses `apiCards.length`, no change needed there).

- [ ] **Step 3: Verify the updated fetch log message at line 97 is removed**

The old `console.log(\`Fetching all cards from ${API_URL}...\`)` was inside the old `fetchAllCardsFromAPI()`. Since we deleted that function, confirm it's gone. The new `fetchAll()` already prints its own log.

- [ ] **Step 4: Test against local swuapi**

With local swuapi running on port 3001:

```bash
SWUAPI_URL=http://localhost:3001 SWUAPI_API_KEY=<your-key> npx tsx scripts/fetchCards.ts
```

Expected output includes:
```
Fetching all cards from http://localhost:3001/export/cards...
  Page 1: +500 cards (total so far: 500 / 7898)
  Page 2: +500 cards (total so far: 1000 / 7898)
  ...
✓ Fetched 7898 total cards from API
```

If you see `HTTP 401`, the API key is wrong. If you see `HTTP 410`, the old `/export/all` is still being hit somewhere — check the URL being used.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetchCards.ts
git commit -m "feat: migrate card fetch from /export/all to cursor-paginated /export/cards"
```

---

## Task 3: Field name migration + UUID primary key

The v2 API returns snake_case field names. The current `ApiCard` interface uses camelCase, which matched the old API. Update it to snake_case and switch the primary `id` from `externalId` to `uuid`.

**Files:**
- Modify: `scripts/fetchCards.ts` — `ApiCard` interface + `transformCard()`

> **Note on database impact:** Changing `id` from numeric string (e.g. `"42080"`) to UUID (e.g. `"019d23fa-764d-7c74-bee2-..."`) will break existing `card_generations.card_id` lookups for historical data. This is acceptable per the spec — UUID is the new canonical ID — but a future database migration will be needed to backfill old records if lookup continuity matters.

- [ ] **Step 1: Update the `ApiCard` interface to snake_case**

Replace the entire `ApiCard` interface (lines 27–55):

```typescript
interface ApiCard {
  uuid: string
  collector_number: string
  set_code: string
  card_number: string
  name: string
  subtitle?: string
  rarity: string
  type: string
  aspects?: string[]
  traits?: string[]
  arena?: string | string[]
  cost?: number
  power?: number
  hp?: number
  text?: string
  back_text?: string
  epic_action?: string
  keywords?: string[]
  artist?: string
  is_unique?: boolean
  variant_type?: string
  is_leader?: boolean
  is_base?: boolean
  front_image_url?: string
  back_image_url?: string
}
```

> `external_id` (the Strapi integer) is only present in `/cards/:id`, not in `/export/cards`, so omit it from this interface.

- [ ] **Step 2: Update `transformCard()` to use new field names**

Replace the entire `transformCard()` function body (lines 118–193) with:

```typescript
function transformCard(apiCard: ApiCard): TransformedCard {
  const setCode = apiCard.set_code || ''
  const cardNumber = apiCard.card_number || ''
  // uuid is the stable canonical ID (UUID v7); collector_number is NOT unique across variants
  const id = apiCard.uuid
  const cardId = apiCard.collector_number.replace('_', '-')

  // Normalize arena to array (API uses singular 'arena')
  let arenas: string[] = []
  if (apiCard.arena) {
    arenas = Array.isArray(apiCard.arena) ? apiCard.arena : [apiCard.arena]
  }

  // Normalize variantType - map API values to our expected values
  let variantType = apiCard.variant_type || 'Normal'
  const variantTypeMap: Record<string, string> = {
    'Standard': 'Normal',
    'Standard Foil': 'Foil',
    // 'Hyperspace' stays as is
    // 'Hyperspace Foil' stays as is
    // 'Showcase' stays as is
  }
  if (variantTypeMap[variantType]) {
    variantType = variantTypeMap[variantType]
  }

  // Determine isFoil based on variantType
  const isFoil = variantType === 'Foil' || variantType === 'Hyperspace Foil' ||
    variantType === 'Foil Prestige' || variantType === 'Serialized Prestige'

  // Determine prestige fields
  const isPrestige = variantType === 'Standard Prestige' || variantType === 'Foil Prestige' || variantType === 'Serialized Prestige'
  const prestigeTierMap: Record<string, string> = {
    'Standard Prestige': 'tier1',
    'Foil Prestige': 'tier2',
    'Serialized Prestige': 'serialized',
  }
  const prestigeTier = prestigeTierMap[variantType] || null

  return {
    id,
    cardId,
    name: apiCard.name || '',
    subtitle: apiCard.subtitle || null,
    set: setCode,
    number: cardNumber,
    rarity: apiCard.rarity || 'Common',
    type: apiCard.type || '',
    aspects: apiCard.aspects || [],
    traits: apiCard.traits || [],
    arenas,
    cost: apiCard.cost !== null && apiCard.cost !== undefined ? parseInt(String(apiCard.cost)) : null,
    power: apiCard.power !== null && apiCard.power !== undefined ? parseInt(String(apiCard.power)) : null,
    hp: apiCard.hp !== null && apiCard.hp !== undefined ? parseInt(String(apiCard.hp)) : null,
    frontText: apiCard.text || null,
    backText: apiCard.back_text || null,
    epicAction: apiCard.epic_action || null,
    keywords: apiCard.keywords || [],
    artist: apiCard.artist || null,
    unique: apiCard.is_unique || false,
    doubleSided: !!(apiCard.back_image_url),
    variantType,
    marketPrice: null,
    lowPrice: null,
    isLeader: apiCard.is_leader || false,
    isBase: apiCard.is_base || false,
    isFoil,
    isHyperspace: variantType === 'Hyperspace' || variantType === 'Hyperspace Foil',
    isShowcase: variantType === 'Showcase',
    isPrestige,
    prestigeTier,
    imageUrl: apiCard.front_image_url || null,
    backImageUrl: apiCard.back_image_url || null,
  }
}
```

- [ ] **Step 3: Run the full card fetch against local swuapi**

```bash
SWUAPI_URL=http://localhost:3001 SWUAPI_API_KEY=<your-key> npx tsx scripts/fetchCards.ts
```

Expected:
- All pages fetched, no errors
- Card count printed per set (spot check: SOR should have ~600+ cards)
- `src/data/cards.json` updated

- [ ] **Step 4: Verify card count and no duplicates**

Check total card count and verify foil/normal cards are NOT being dropped due to UUID collision:

```bash
node -e "
const data = require('./src/data/cards.json')
const cards = data.cards
const uuids = new Set(cards.map(c => c.id))
console.log('Total cards:', cards.length)
console.log('Unique IDs:', uuids.size)
console.log('Normal variants:', cards.filter(c => c.variantType === 'Normal').length)
console.log('Foil variants:', cards.filter(c => c.isFoil).length)
if (uuids.size !== cards.length) console.error('ERROR: Duplicate IDs detected!')
else console.log('OK: All IDs unique')
"
```

Expected: `Total cards` equals `Unique IDs` (no duplicates). If they differ, a UUID collision was introduced — debug before continuing.

- [ ] **Step 5: Run card data validation tests**

```bash
npm run test:data
```

Expected: All tests pass (`🎉 ALL DATA VALIDATION PASSED!`).

If tests fail, check:
- `all cards have required fields` — `id` field must be present (UUID string, not null)
- `leaders have isLeader flag` — `is_leader` field must be mapped correctly
- `foil cards have isFoil flag` — `variant_type` mapping must be correct

- [ ] **Step 6: Spot-check new fields are present in cards.json**

```bash
node -e "
const data = require('./src/data/cards.json')
const card = data.cards.find(c => c.variantType === 'Normal' && c.keywords && c.keywords.length > 0)
if (card) {
  console.log('Sample card with keywords:', JSON.stringify({ id: card.id, name: card.name, keywords: card.keywords, artist: card.artist, isLeader: card.isLeader, isBase: card.isBase }, null, 2))
} else {
  console.log('No cards with keywords found — check keyword mapping')
}
"
```

Expected: A card object printed with a UUID `id`, non-null `keywords` array, `artist` string, and correct `isLeader`/`isBase` booleans.

- [ ] **Step 7: Commit**

```bash
git add scripts/fetchCards.ts src/data/cards.json src/data/cards.raw.json
git commit -m "feat: migrate ApiCard to snake_case fields and use uuid as primary card ID"
```

---

## Testing Checklist (post-implementation)

Run this checklist after all three tasks are complete:

- [ ] `SWUAPI_URL=http://localhost:3001 SWUAPI_API_KEY=<key> npx tsx scripts/fetchCards.ts` — fetches all cards across multiple paginated requests with no errors
- [ ] `node -e "..."` count check — total cards matches unique IDs (no UUID collisions / dropped foils)
- [ ] `npm run test:data` — all data validation tests pass
- [ ] `npm run build` — production build succeeds
- [ ] Request without auth gets 401 from swuapi (verify by running without `SWUAPI_API_KEY` set — the script should print the 401 error message)
- [ ] Deck image generation works: start app with `SWUAPI_URL=http://localhost:3001 SWUAPI_API_KEY=<key> npm run dev` and generate a deck image through the UI

---

## Out of Scope

- **`/merges` endpoint** (optional per spec): would periodically re-point `from_uuid` → `to_uuid` in local references. Treat as a follow-up ticket.
- **Database migration**: existing `card_generations.card_id` records store old numeric string IDs. After this migration, new records will store UUIDs. Backfilling old records is a separate concern.
