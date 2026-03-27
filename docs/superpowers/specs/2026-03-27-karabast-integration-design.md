# Karabast Integration Design

**Date:** 2026-03-27
**Repos:** swupod (PTP), wayfinder
**Status:** Approved

---

## Overview

When a player lands on a PTP play page with the Wayfinder browser extension installed, the extension shows a Wayfinder-branded modal that automates the handover to karabast.net — creating or joining lobbies with the correct deck, format, and card pool pre-filled. Match results captured by the extension are then linked back to PTP decklists, pools, and draft logs bidirectionally.

This work is divided into three independently shippable phases.

---

## Phase 1: Karabast Launch Modal

### Content Script

A new content script `content-ptp-play.js` (in `packages/extension-shared`) is injected on all PTP play pages via a new manifest entry:

```
*://protectthepod.net/pool/*/deck/play*
*://protectthepod.net/formats/pack-wars/*/play*
*://protectthepod.net/formats/pack-blitz/*/play*
```

The script injects a Shadow DOM overlay to prevent CSS leakage from the PTP page. It auto-shows on first load per session and collapses to a "Play on Karabast" pill button after dismissal.

On load, the script extracts the `shareId` and format type (`pool`, `pack-wars`, `pack-blitz`) from the URL and calls `GET /api/plugin/v1/play/[format]/[shareId]` (new PTP endpoint, no auth required) to retrieve the set code. It then determines the Karabast card pool selection:

- Set with the highest `setNumber` among all released sets → **Current**
- Any older set → **Unlimited**

Deck URL = `window.location.href`.

### Modal Layout

```
┌─────────────────────────────────────────┐
│  ⚡ Play on Karabast           [×]       │
├─────────────────────────────────────────┤
│  [Create Private Lobby]                  │
│  [Create Public Lobby]                   │
├─────────────────────────────────────────┤
│  X Public Limited Lobbies  [Join Public] │
├─────────────────────────────────────────┤
│  Private lobby URL: [____________] [Join]│
└─────────────────────────────────────────┘
```

- **Create Private Lobby / Create Public Lobby**: drives Karabast lobby creation automation (see below)
- **Join Public Lobby**: shows count of public Limited lobbies waiting for a player (polled every 10s); button disabled when count is 0; opens karabast.net for the user to pick a lobby
- **Join Private Lobby**: text input; validates URL matches `https://karabast.net/?lobbyId=<uuid-v4>`; shows inline error on invalid URL

### Public Lobby Count

Source: `GET https://api.karabast.net/api/available-lobbies` (unauthenticated public REST API).
Filter response by `format === "limited"` → length = count.
Poll every 10s while modal is open. No WebSocket needed.

### Karabast Lobby Creation Automation

1. Content script stores `{ ptpDeckUrl, cardPool, privacy, ptpShareId, ptpFormat }` in `chrome.storage.session`.
2. Opens karabast.net in a new tab.
3. The existing `inject-karabast.js` (extended) detects the stored session intent and drives the Karabast UI:
   - Click New Game / Create Lobby
   - Tick New Deck; paste deck URL
   - Select Format: Limited
   - Select Card Pool: Current or Unlimited
   - Select Privacy: Private or Public
   - Click Create Game
4. Detect lobby creation completion (lobby state page loads).
5. **If Private**: detect "Copy Invite Link" button → copy to clipboard → display Wayfinder-branded success banner: "Private lobby link copied".
6. Clear session intent from `chrome.storage.session`.

All Karabast selectors are encapsulated in a single `karabast-selectors.ts` file so UI changes require edits in one place.

### Join Private Lobby Flow

1. Validate URL: must match `https://karabast.net/?lobbyId=<uuid-v4>` regex. Show inline error if not.
2. Content script stores `{ ptpDeckUrl, ptpShareId, ptpFormat, joinIntent: true }` in `chrome.storage.session`.
3. Open the URL in a new tab (Karabast auto-joins the lobby on load).
4. `inject-karabast.js` detects the `joinIntent` session flag, locates the deck link input field, pastes the PTP deck URL, and clicks Import Deck.

---

## Phase 2: Match Result Linking

### Overview

When a Limited game ends on Karabast with the plugin active, Wayfinder links the game record to a PTP deck, pool, pod, and draft log. PTP gains W/L/D on decklists with links to Wayfinder match records. Wayfinder match records gain links back to PTP entities.

### Linking Strategy (two-tier)

**Tier 1 — Modal context (primary):** When the user creates or joins a lobby via the Phase 1 modal, `content-ptp-play.js` stores `{ ptpDeckUrl, ptpShareId, ptpFormat }` in `chrome.storage.session` alongside the lobby intent. `inject-karabast.js` includes this context in the existing capture payload sent to `POST /api/ingestion/capture`. This is an exact, zero-ambiguity link.

**Tier 2 — Deck comparison (fallback):** If no modal context is present (user navigated to Karabast manually), the Wayfinder server calls `POST /api/plugin/v1/match/deck-lookup` on PTP with the captured card list. PTP queries its decklists for a match with ≥95% card overlap and returns the matching pool/deck/draft IDs. Wayfinder stores whatever is returned.

### New PTP Endpoints (`/api/plugin/v1/`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/play/[format]/[shareId]` | none | Set code, format, pool metadata (supports pool, pack-wars, pack-blitz) |
| POST | `/match/deck-lookup` | shared secret | Card list → matching deck/pool/draft IDs |
| POST | `/match/result` | shared secret | Write W/L/D result to a PTP deck |

**Shared secret:** `WAYFINDER_PLUGIN_SECRET` env var on both PTP and Wayfinder servers. Wayfinder server sends it as `X-Wayfinder-Secret` request header. The secret never appears in plugin source code.

### PTP Schema Changes

New columns on the decklists table:

```sql
wins                INTEGER NOT NULL DEFAULT 0,
losses              INTEGER NOT NULL DEFAULT 0,
draws               INTEGER NOT NULL DEFAULT 0,
wayfinder_match_ids TEXT[] NOT NULL DEFAULT '{}'
```

New migration in `migrations/`.

### PTP UI Changes

On play pages and the deckbuilder, show a W/L/D badge (e.g., `3W 1L 0D`) when the deck has match results. Each result is a link to the corresponding Wayfinder match record.

### Wayfinder Match Record Page

When a game record has a linked PTP context, the match page (`/matches/[id]`) shows a "PTP" section with links to:

- Pool page: `protectthepod.net/pool/[shareId]`
- Deckbuilder: `protectthepod.net/pool/[shareId]/deck`
- Draft log: `protectthepod.net/draft/[draftId]` (when available)
- Pod page (when available)

### Data Flow

```
Game ends on Karabast
        │
inject-karabast.js sends capture to Wayfinder (/api/ingestion/capture)
        │
   Modal context?
   ┌────┴────┐
  YES       NO
   │         │
Exact PTP    POST card list to PTP /match/deck-lookup
IDs known    │
   │      Fuzzy match ≥95% overlap
   └────┬────┘
        │
Wayfinder server → POST /match/result to PTP (X-Wayfinder-Secret)
        │
PTP: update W/L/D + append Wayfinder match ID
Wayfinder: store PTP pool/deck/draft IDs on game record
```

---

## Phase 3: PTP Data Lake Ingestion into Wayfinder

### Overview

When Wayfinder successfully links a game to a PTP pool for the first time, it queues a background import task to fully ingest that pool into the Wayfinder data pipeline — raw cache (L1) then normalized domain objects with entity joins (L2).

### Trigger

After `POST /match/result` is processed and a new PTP `shareId` is seen for the first time, Wayfinder enqueues `ptp-pool-l1` in the existing DAG import task system (`src/server/import-tasks.ts`). Tasks are idempotent (upsert on shareId).

### L1 — Raw Cache

Import task: `ptp-pool-l1`

| Table | Contents |
|-------|----------|
| `ptp_pools_raw` | Raw JSON response from `GET /api/plugin/v1/pool/[shareId]` — all cards, set, format, player |
| `ptp_draft_logs_raw` | Raw draft log JSON if the pool has an associated draft (picks, packs, rounds) |

No transformation. Preserved for reprocessing.

### L2 — Normalized Domain Objects

Import task: `ptp-pool-l2` (depends on `ptp-pool-l1`)

| Table | Contents |
|-------|----------|
| `pools` | One row per PTP pool — shareId, set, format, player |
| `pool_cards` | Cards in the pool with card IDs normalized to Wayfinder format |
| `decklists` | The player's built deck from the pool |
| `draft_logs` | One row per draft event — pod ID, set, date |
| `draft_picks` | Each pick with pack number, pick number, card ID |

**L2 joins (the key addition over L1):**

- `pools.player_id` → `players.id` (via discord_id)
- `pool_cards.pool_id` → `pools.id`
- `decklists.pool_id` → `pools.id`
- `decklists.game_id` → `games.id`
- `draft_picks.draft_log_id` → `draft_logs.id`
- `draft_logs.pool_id` → `pools.id`

This join graph enables queries like: "win rate of LAW limited decks built from PTP draft pods this season."

### Import Task DAG

```
ptp-pool-l1
     │
ptp-pool-l2
     │
(future: ptp-archetypes, ptp-elo-update)
```

---

## Security Model Summary

| Concern | Approach |
|---------|----------|
| PTP read endpoints (Phase 1) | No auth — shareId is already public (in the URL) |
| PTP write endpoints (Phase 2) | `X-Wayfinder-Secret` header — server-to-server only, never in plugin source |
| Wayfinder plugin auth | Existing Discord OAuth → plugin token flow, unchanged |
| Secret storage | `WAYFINDER_PLUGIN_SECRET` env var on Railway for both apps |

---

## Out of Scope

- Karabast account linking (the plugin does not log into Karabast on the user's behalf)
- Automated deck import into Karabast without user interaction (the lobby creation flow still opens a visible browser tab)
- Match result linking for non-Limited formats
- Retroactive ingestion of historical PTP pools (Phase 3 only ingests pools discovered via Phase 2)
