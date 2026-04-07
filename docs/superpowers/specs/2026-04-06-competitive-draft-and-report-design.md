# Competitive Draft Mode & Draft Report — Design Spec

## Overview

Two major features for Friends of the Pod (FOP) users, delivered in 3 phases:

1. **Phase 1: Draft Report** — A comprehensive post-draft report page with tabs for seating, log, pool, deck, and (later) gameplay
2. **Phase 2: Competitive Draft Mode** — A new draft format enforcing official competitive rules with a premium visual experience
3. **Phase 3: Gameplay Tab + Wayfinder Integration** — Match tracking, replay links, deck validation, tournament bracket

---

## Phase 1: Draft Report

### Page: `/draft/[shareId]/report`

A single-page report of YOUR draft experience. The `shareId` here is the draft pod's shareId (same as used in draft log URLs). The report is scoped to the authenticated user's seat — each player in the pod has their own report at the same URL, showing their own data. FOP-gated — only visible to Friends of the Pod. Shows only your own data (not other players' decks/logs).

### Header

- Draft name, date, player count
- "COMPETITIVE" badge if from a competitive draft (Phase 2+)
- **Public/Private toggle** — controls whether this report URL is viewable by others. Private by default. Does NOT affect per-player draft log visibility settings (those are independent).
- **Copy Link** button — copies report URL to clipboard

### Tabs

#### 1. Draft Seating
- Renders the `PlayerCircle` component from the draft room
- Shows all 8 seats with drafted leaders
- Interactive — same as the live pod view

#### 2. Draft Log
- Identical to existing `/draft/[shareId]/log` page content
- YOUR picks only (single seat view, not all players)
- Sections: Leader Draft, Pack 1, Pack 2, Pack 3
- Each pick shows available cards with picked card highlighted

#### 3. Pool
- Identical to pool page (`SealedPod` component card display)
- All drafted cards organized by pack/round
- Card preview on hover/tap

#### 4. Deck
- Arena view of built deck (read-only, no drag/drop)
- Shows leader, base, main deck, sideboard
- All export buttons: Download JSON, Copy to Clipboard, Export Deck Image, Export Pool Image
- If deck not yet built: "Still deckbuilding..." message

#### 5. Gameplay (Phase 3 placeholder)
- Placeholder tab with "Coming Soon" message
- CTA to install Wayfinder extension
- Brief description of what will be here: match results, replay links, tournament bracket
- Tab styled differently (italic, sparkle icon) to indicate upcoming

### Golden Glow Button

A button with animated golden border glow that links to the draft report. Appears on:

- **Pool page** — next to Draft Log button in `sealed-pod-header`
- **DeckBuilder page** — next to Draft Log button in `header-buttons`
- **Play page** — next to Draft Log button in action buttons row

**Visibility conditions:**
- User is FOP (`isPatron`)
- Pool is from a draft (`draftShareId` exists)
- User is the pool owner

**Style:** Gold border (`rgba(255,215,0,0.6)`), pulsing glow animation, document icon with trophy accent.

### Dropdown Entry

"Draft Reports" entry in `AuthWidget` dropdown menu. Gold-tinted text. Links to `/draft/reports` — a list page showing your reports sorted by most recent. Only visible to FOP users.

### Draft Reports List Page: `/draft/reports`

- FOP-gated
- Lists all drafts where the user has a report
- Each entry: draft name, date, set, player count
- Links to individual report pages
- Empty state: "No draft reports yet. Join a draft to get started!"

### Data Sources (all exist in PTP already)

- Draft seating: `pod_players` with leaders via `/api/draft/[shareId]`
- Draft log: `draft_picks` via `/api/draft/[shareId]/log`
- Pool: `pools` via `/api/pools/[shareId]`
- Deck: `pools.deck_builder_state` via `/api/pools/[shareId]`

### New API Endpoints

- `GET /api/draft/[shareId]/report` — Returns report data (seating, your picks, pool, deck state)
- `PATCH /api/draft/[shareId]/report/visibility` — Toggle public/private
- `GET /api/draft/reports` — List user's draft reports

### New DB Fields

- `pools.report_public` (BOOLEAN, default false) — Whether the draft report is publicly viewable

---

## Phase 2: Competitive Draft Mode

### Overview

A new draft mode enforcing official Star Wars: Unlimited competitive rules. Creates a premium, visually distinct drafting experience.

### Access Control

- **Creating** a competitive draft: FOP only (`isPatron` required)
- **Joining** a competitive draft: Anyone (non-FOP players can participate)

### Creation Flow

New option on `/draft` page: "Create Competitive Draft" with a short description and bullet points listing the rules. Trophy outline icon.

Dropdown entry under "Live Pod": "(trophy icon) Competitive Draft Pod" — FOP only.

### Draft Settings (Enforced, Not Configurable)

- **Exactly 8 players** — `maxPlayers` locked to 8
- **Seats auto-shuffled** on draft start — no manual shuffle button, system message says seats were randomized
- **Pack shuffle** — still available, optional
- **Pod Chat disabled** once draft begins — chat panel shows "Chat is disabled during competitive drafts" message. System messages still appear. Chat works during waiting/lobby phase.
- **No pack review during picks** — the "view drafted cards" button is hidden during pack draft. Instead show "X/Y cards drafted" counter.
- **30 seconds between packs** — review period where players CAN view their drafted cards
- **Last-pick timer and round timer DISABLED** — replaced by Appendix C per-card timers
- **Settings that are hidden/disabled:** Round timer toggle, last player timer toggle, timer duration dropdowns

### Default Naming

- Pod name defaults to: "{Set Name} Competitive Draft"
- Discord embed (if public) uses competitive branding

### Bots

- Bots can be added to fill seats
- Bots auto-pick using existing bot logic (same as drop behavior)

### Timer Rules (Appendix C)

#### Leader Draft (C.3.1)
| Leaders Remaining | Time |
|---|---|
| 3 | 15 seconds |
| 2 | 10 seconds |
| 1 | Auto-pick (N/A) |

#### Pack Draft (C.3.2)
| Cards Remaining | Time |
|---|---|
| 14 | 60 seconds |
| 13 | 40 seconds |
| 12 | 40 seconds |
| 11 | 30 seconds |
| 10 | 30 seconds |
| 9 | 25 seconds |
| 8 | 25 seconds |
| 7 | 20 seconds |
| 6 | 15 seconds |
| 5 | 10 seconds |
| 4 | 10 seconds |
| 3 | 5 seconds |
| 2 | 5 seconds |
| 1 | Auto-pick (N/A) |

#### Between Packs
- 30 seconds between Pack 1→2 and Pack 2→3 to review drafted cards

#### Timer Expiration Behavior
- Auto-pick using bot logic (same strategy system used when players drop)
- Player sees "Time's up! Auto-picked: {card name}" message

### Deck Build Timer

- **20 minutes** to build deck after draft completes
- Timer displayed prominently on DeckBuilder page
- **Warning at 5 minutes** — visual warning (yellow flash/pulse)
- **Warning at 1 minute** — urgent warning (red flash/pulse)
- **At 0:00** — Deck auto-locks in current state and player is redirected to play page
- If deck is incomplete (no leader/base, <30 cards): locked as-is, player proceeds with whatever they have

### Visual Theme — Full Takeover

The competitive draft experience has a distinct premium visual treatment that persists through all phases (lobby, leader draft, pack draft):

- **Dark + gold color scheme** — gold accents (`rgba(255,215,0,*)`) replace the default green/white
- **Different background atmosphere** — darker, more dramatic than standard drafts
- **"COMPETITIVE FORMAT" badge** — prominent badge in header area
- **Animated gold border/frame** elements
- **Trophy iconography** throughout
- **Distinct from regular drafts** at a glance — players know immediately they're in a competitive pod

### OG Image

Custom Open Graph image for competitive draft pod URLs. Details TBD — to be designed separately. Should be visually striking and clearly branded as competitive.

### FOP Perks Listing

Wherever Friends of the Pod perks are listed (Patreon page, /beta page, marketing), add "Competitive Draft Mode" as a perk.

### New DB Fields

- `pods.competitive` (BOOLEAN, default false) — Whether this is a competitive draft
- `pods.deck_lock_at` (TIMESTAMPTZ, nullable) — When deck building time expires
- `pods.deck_locked` (BOOLEAN, default false) — Whether deck has been auto-locked

### New/Modified API Endpoints

- `POST /api/draft` — Add `competitive: true` option (requires FOP)
- `PATCH /api/draft/[shareId]/settings` — Competitive settings locked (reject changes)
- New timer logic in socket server for per-card timeouts
- New auto-pick endpoint triggered by timer expiration

### Socket Events

- `competitive:timer` — Broadcasts current pick timer state (seconds remaining, cards remaining)
- `competitive:review` — Signals 30-second inter-pack review period
- `competitive:deck-locked` — Signals deck build time expired

---

## Phase 3: Gameplay Tab + Wayfinder Integration

### Overview

Complete the Draft Report Gameplay tab with match tracking, replay links, and deck validation. Requires coordinated work across PTP and Wayfinder codebases.

### Wayfinder → PTP: Match Result Push

Build out the stubbed `sendMatchResultToPtp()` in Wayfinder's ingestion pipeline:

- When a Karabast game is captured that's linked to a PTP pool (via `ptpPoolShareId`):
  - Push match result (W/L/D, opponent info, replay ID) to PTP
  - PTP stores in new `draft_match_results` table
  - Links to the draft report

### PTP Receiving Endpoint

- `POST /api/draft/[shareId]/match-result` — Receives match data from Wayfinder
  - Auth: Service key (same pattern as existing PTP private API)
  - Body: `{ outcome, opponentHandle, opponentLeader, opponentBase, replayId, gameNumber, matchNumber }`

### Gameplay Tab Content

Layout: Bo3 matches stacked vertically, games within each match displayed side-by-side (2-3 games per match).

Each game shows:
- Your leader + base
- Opponent leader + base
- W/L result
- Link to replay (on Wayfinder)

If no match data yet: instructions for installing Wayfinder and playing on Karabast.

### Deck Validation

Via Wayfinder plugin: compare the deck played on Karabast against the deck built in PTP.

- On match result push, include cards played
- PTP compares against `deck_builder_state`
- Report shows validation status: "Deck Verified" or "Deck Mismatch Detected"

### Tournament Bracket / Match Tracking

If all players have the Wayfinder plugin:
- Auto-populate bracket with match results as games complete
- Show live tournament progress

Fallback: Pod leader can manually enter W/L results via a host panel.

### New DB Tables

```sql
draft_match_results (
  id UUID PRIMARY KEY,
  pool_id UUID REFERENCES pools,
  draft_pod_id UUID REFERENCES pods,
  match_number INTEGER,
  game_number INTEGER,
  outcome TEXT, -- 'win', 'loss', 'draw'
  opponent_handle TEXT,
  opponent_leader TEXT,
  opponent_base TEXT,
  replay_id TEXT,
  deck_validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Quick Fixes (Already Implemented)

These were completed before the spec was written:

1. ~~Yellow leave button on /draft → changed to yellow X icon~~
2. ~~Draft Log button added to DeckBuilder page~~
3. ~~Draft Log button spacing fixed on Pool page~~
4. ~~"Find a human opponent" → "You need to find a human opponent"~~
