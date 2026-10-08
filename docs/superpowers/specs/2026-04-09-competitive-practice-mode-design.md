# Competitive Practice Mode — Design Spec

**Date:** 2026-04-09
**Status:** Approved

---

## Overview

Competitive Practice Mode (CPM) adds two capabilities to Protect the Pod:

1. **Competitive Draft** — A draft format enforcing official SWU competitive rules (Appendix C timers, restricted card review, deck build timer) with a premium gold visual theme
2. **Practice Matchmaking** — Three rounds of BO3 Swiss-style matchmaking after the draft, with game-by-game result reporting, Wayfinder auto-ingestion, and pod owner controls

FOP (Friends of the Pod) required to create. Anyone can join.

**Language constraint:** Never use "tournament" in UI, user-facing text, or new code naming. Use "matchmaking", "practice games", "rounds", "competitive practice" instead.

---

## 1. Competitive Draft Rules

When `pods.competitive = true`, the draft enforces:

### Locked Settings

- Exactly 8 players (`max_players` locked to 8, bots can fill seats)
- Seats auto-shuffled on start
- Chat disabled once draft begins (system messages still flow, chat works in lobby)
- "View drafted cards" button hidden during pack draft — replaced by "X/Y cards drafted" counter
- 30-second review period between packs (players CAN view drafted cards during this window)

### Appendix C Timers

These replace the existing round timer and last-player timer.

**Leader draft:**

| Leaders Remaining | Time |
|---|---|
| 3 | 15s |
| 2 | 10s |
| 1 | Auto-pick |

**Pack draft:**

| Cards Remaining | Time |
|---|---|
| 14 | 60s |
| 13-12 | 40s |
| 11-10 | 30s |
| 9-8 | 25s |
| 7 | 20s |
| 6 | 15s |
| 5-4 | 10s |
| 3-2 | 5s |
| 1 | Auto-pick |

**Timer expiration:** Auto-pick using existing bot logic (same strategy system used when players drop). Player sees "Time's up! Auto-picked: {card name}" message.

**Between packs:** 30-second review period where players can view their drafted cards.

### Deck Build Timer

- 20 minutes to build deck after draft completes
- Timer displayed prominently on DeckBuilder page
- Warning at 5 minutes — yellow visual pulse
- Warning at 1 minute — red visual pulse
- At 0:00 — deck auto-locks in current state, player redirected to play page
- If deck is incomplete (no leader/base, <30 cards): locked as-is

### Round 1 Start Trigger

Round 1 starts when ALL of the following:
- All players have submitted a deck (navigated to play page), OR the 20-min timer expires — whichever comes first
- Pod owner can also force-start via "Start Round 1" button

---

## 2. Practice Matchmaking Flow

### Round Structure

3 rounds. Always BO3. Auto-advance when all matches confirmed.

### Pairing

**Round 1:** Opposite-seat from draft (1v5, 2v6, 3v7, 4v8). If a player is dropped/booted, their opponent gets a bye.

**Rounds 2-3:** Swiss — group by match wins, pair within groups. No rematches. If odd number of active players, bye assigned to lowest-ranked player without a prior bye. Pod owner can override the automatic bye assignment.

### Result Reporting (Three Paths)

**1. Wayfinder auto-ingestion:**
Wayfinder POSTs to existing `/api/plugin/v1/match/result` endpoint. Endpoint is extended to also write game-by-game results to `practice_matches` when the pool belongs to a competitive pod. Auto-confirmed, no manual step needed.

**2. Manual mutual confirmation:**
Both players submit game-by-game results using melee.gg-style UI:

```
  [Player A]  [Draw]  [Player B]     ← Game 1
  [Player A]  [Draw]  [Player B]     ← Game 2
  [Player A]  [Draw]  [Player B]     ← Game 3
  [Submit]
```

Click winner (or draw) for each game. If both players' submissions match → auto-confirmed. If they conflict → flagged for pod owner.

**3. Pod owner override:**
Owner can edit any match result at any time. Overrides skip confirmation.

### Round Advancement

When all matches in a round are confirmed → next round auto-pairs and appears immediately. No manual trigger, no interstitial.

### Final Results

After round 3 completes, a "Results" tab appears. Numbered list (1st, 2nd, 3rd...) sorted by:
1. Match wins (primary)
2. OMW% as tiebreaker (opponent match-win percentage, floor 33%)

W-L record displayed per player. No "winner" declaration, no trophy iconography.

### Dropped Players

When a player is booted by pod owner:
- Marked as dropped — past results stand (count for opponent records)
- Future rounds: their would-be opponents get a bye
- Dropped players' results still count for OMW% calculations

---

## 3. Database Schema

### New Tables

**`practice_rounds`**

```sql
CREATE TABLE practice_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'complete'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(pod_id, round_number)
);

CREATE INDEX idx_practice_rounds_pod ON practice_rounds(pod_id);
```

**`practice_matches`**

```sql
CREATE TABLE practice_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES practice_rounds(id) ON DELETE CASCADE,
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  is_bye BOOLEAN NOT NULL DEFAULT false,
  game1_result TEXT,            -- 'player1', 'player2', 'draw', null
  game2_result TEXT,
  game3_result TEXT,
  player1_submitted BOOLEAN NOT NULL DEFAULT false,
  player2_submitted BOOLEAN NOT NULL DEFAULT false,
  final_confirmed BOOLEAN NOT NULL DEFAULT false,
  match_winner TEXT,            -- 'player1', 'player2', 'draw', null
  wayfinder_match_id TEXT,
  pod_owner_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_practice_matches_round ON practice_matches(round_id);
CREATE INDEX idx_practice_matches_pod ON practice_matches(pod_id);
CREATE INDEX idx_practice_matches_players ON practice_matches(player1_id, player2_id);
```

### Column Additions

**On `pods`:**

```sql
ALTER TABLE pods ADD COLUMN competitive BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pods ADD COLUMN deck_lock_at TIMESTAMPTZ;
```

**On `pod_players`:**

```sql
ALTER TABLE pod_players ADD COLUMN dropped BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pod_players ADD COLUMN dropped_at TIMESTAMPTZ;
```

---

## 4. API Routes

### New Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/draft/[shareId]/match/[matchId]/report` | Player in match | Submit game-by-game BO3 result |
| POST | `/api/draft/[shareId]/match/[matchId]/override` | Pod owner | Override any match result |
| POST | `/api/draft/[shareId]/boot/[userId]` | Pod owner | Boot a player (mark dropped) |
| POST | `/api/draft/[shareId]/assign-bye` | Pod owner | Override automatic bye for current round |
| POST | `/api/draft/[shareId]/start-matches` | Pod owner | Force-start round 1 before all decks submitted |

### Modified Routes

| Route | Change |
|-------|--------|
| `POST /api/draft` | Accept `competitive: true`, require FOP |
| `POST /api/draft/[shareId]/pick` | Use Appendix C timers when competitive |
| `POST /api/plugin/v1/match/result` | Also write to `practice_matches` when pool belongs to competitive pod |

### Auto-Advance Logic

No separate "advance round" route. After confirming a match result (in report, override, or Wayfinder ingestion handlers): check if all matches in the round are done. If so, create next round + generate pairings + broadcast state.

---

## 5. Services (Pure Logic)

Three new files in `src/services/matchmaking/`:

### `pairing.ts`

```typescript
// Round 1: opposite-seat from draft
pairRound1(players: Player[], seatNumbers: Map<string, number>): Pairing[]

// Round 2+: Swiss by record, no rematches
pairSwiss(players: Player[], previousMatches: Match[]): Pairing[]

// Bye assignment: lowest-ranked without prior bye
assignBye(players: Player[]): string  // returns player ID
```

### `results.ts`

```typescript
// Derive match winner from 3 games (first to 2 wins)
deriveMatchWinner(g1: string, g2: string, g3: string | null): string

// Compare two player submissions for confirmation
resultsMatch(p1Submission: GameResults, p2Submission: GameResults): boolean

// Opponent match-win %, floor 33%
calculateOMW(playerId: string, allMatches: Match[]): number

// Sort by match wins then OMW%
rankPlayers(players: Player[], allMatches: Match[]): RankedPlayer[]
```

### `timers.ts`

```typescript
// Appendix C pack draft timer
getCompetitivePickTimeout(cardsRemaining: number): number  // seconds

// Appendix C leader draft timer
getLeaderPickTimeout(leadersRemaining: number): number  // seconds
```

Each file gets a corresponding `.test.ts`. All pure functions — no DB, no IO.

---

## 6. Play Page UI

The play page (`/pool/[shareId]/deck/play`) is enhanced when the pool belongs to a competitive pod.

### Layout

**Top section** — unchanged (leader, base, deck, export buttons).

**Matchmaking section** (new, below existing content):

**Your current match** — prominent callout above round tabs: "Your match: You vs. {opponent}" with "Play on Karabast" button (Wayfinder) or manual play instructions.

**Round tabs:** `Round 1 | Round 2 | Round 3 | Results` — current round is active tab by default. Completed rounds accessible but visually subdued.

**Match cards** — 4 per round tab (or 3 + bye). Each shows:
- Player A name/avatar — Player B name/avatar
- Game-by-game results: `G1: A | G2: B | G3: —`
- Status: "In Progress", "Awaiting Confirmation", "Complete"
- Your match visually highlighted/expanded with "Report Result" button

**Report Result form** (melee.gg style):
```
  [Player A]  [Draw]  [Player B]     ← Game 1
  [Player A]  [Draw]  [Player B]     ← Game 2
  [Player A]  [Draw]  [Player B]     ← Game 3
  [Submit]
```

**Results tab:** Numbered list — rank, player name/avatar, W-L record, OMW%.

### Pod Owner Controls

Same layout with extra controls:
- Edit icon on any match card → override result
- Boot button on any player
- Bye override dropdown on bye match cards
- "Start Round 1" button (before round 1 begins)

---

## 7. Visual Theme

### During Draft (lobby, leader draft, pack draft)

- Dark + gold color scheme — gold accents (`rgba(255,215,0,*)`) replace default green/white
- "COMPETITIVE" badge in header
- Darker background atmosphere
- Distinct at a glance from regular drafts

### During Matchmaking (play page)

- Gold accent carries through — round tabs gold active state, match cards gold borders
- "COMPETITIVE PRACTICE" label in matchmaking section header
- Active match card has gold glow animation
- Results tab: gold accent on #1 rank (subtle, not a trophy)

### Creation Flow

- Draft creation dropdown: "Competitive Practice" option with rule description
- FOP-gated — non-FOP see it greyed with "Friends of the Pod" label
- Pod name defaults to: "{Set Name} Competitive Practice"

---

## 8. Socket & Real-time Sync

### Reuse Existing Infrastructure

Same socket room `draft:${shareId}`, same `broadcastDraftState()` function, same `useDraftSocket` hook.

### New Phase

`draft_state.phase = 'matchmaking'` — added after pack draft completes and deck build finishes.

### Broadcast Payload Additions (matchmaking phase)

```typescript
{
  // ...existing draft state fields...
  matchmakingStatus: 'deck_building' | 'active' | 'complete',
  currentRound: number,
  deckBuildDeadline: string,  // ISO timestamp
  rounds: [{
    roundNumber: number,
    status: 'active' | 'complete',
    matches: [{
      id: string,
      player1: { id, username, avatarUrl },
      player2: { id, username, avatarUrl } | null,
      isBye: boolean,
      game1Result: string | null,
      game2Result: string | null,
      game3Result: string | null,
      player1Submitted: boolean,
      player2Submitted: boolean,
      finalConfirmed: boolean,
      matchWinner: string | null
    }]
  }]
}
```

### Broadcast Triggers

- Deck build timer expires / all decks submitted
- Result submitted by a player
- Result confirmed (both match or Wayfinder)
- Pod owner overrides a result
- Round auto-advances
- Player booted

---

## 9. Wayfinder Integration

### Existing Endpoint

`POST /api/plugin/v1/match/result` already records W/L/D on `card_pools` and appends `wayfinder_match_ids`.

### Extension for Competitive Pods

When the pool belongs to a competitive pod (`pods.competitive = true`):

1. Look up which `practice_match` the player is currently in (active round, their match)
2. Write game-by-game results to `practice_matches`
3. Auto-confirm the match (set `final_confirmed = true`, `wayfinder_match_id`)
4. Check if all matches in round are done → auto-advance if so
5. Broadcast updated state

Wayfinder results override manual submissions — if a player manually submitted but Wayfinder also reports, Wayfinder wins.

---

## 10. Files to Create

| File | Purpose |
|------|---------|
| `migrations/052_create_practice_rounds.sql` | Practice rounds table |
| `migrations/053_create_practice_matches.sql` | Practice matches table |
| `migrations/054_add_competitive_to_pods.sql` | `competitive`, `deck_lock_at` on pods |
| `migrations/055_add_dropped_to_pod_players.sql` | `dropped`, `dropped_at` on pod_players |
| `src/services/matchmaking/pairing.ts` | Swiss + opposite-seat pairing |
| `src/services/matchmaking/pairing.test.ts` | Pairing tests |
| `src/services/matchmaking/results.ts` | Match results, OMW%, ranking |
| `src/services/matchmaking/results.test.ts` | Results tests |
| `src/services/matchmaking/timers.ts` | Appendix C timer lookups |
| `src/services/matchmaking/timers.test.ts` | Timer tests |
| `app/api/draft/[shareId]/match/[matchId]/report/route.ts` | Report match result |
| `app/api/draft/[shareId]/match/[matchId]/override/route.ts` | Pod owner override |
| `app/api/draft/[shareId]/boot/[userId]/route.ts` | Boot player |
| `app/api/draft/[shareId]/assign-bye/route.ts` | Override bye assignment |
| `app/api/draft/[shareId]/start-matches/route.ts` | Force-start round 1 |

### Files to Modify

| File | Change |
|------|--------|
| `app/api/draft/route.ts` | Accept `competitive: true`, require FOP |
| `app/api/draft/[shareId]/pick/route.ts` | Appendix C timers when competitive |
| `app/api/plugin/v1/match/result/route.ts` | Write to `practice_matches` for competitive pods |
| `app/pool/[shareId]/deck/play/page.tsx` | Matchmaking UI (round tabs, match cards, reporting) |
| `src/hooks/useDraftSocket.ts` | Handle matchmaking phase data |
| `src/components/PlayerCircle.tsx` | Gold theme variant for competitive |
| `src/components/PackDraftPhase.tsx` | Hide card review, show counter, Appendix C timers |
| `src/components/LeaderDraftPhase.tsx` | Appendix C leader timers |
| `src/components/TimerPanel.tsx` | Appendix C timer display |
| `src/components/DeckBuilder/DeckBuilderHeader.tsx` | 20-min countdown, auto-lock |
| `server.ts` | Competitive timer logic in socket handlers |
| `src/lib/socketBroadcast.ts` | Include matchmaking data in broadcast payload |
| `app/draft/new/page.tsx` | "Competitive Practice" creation option |

---

## 11. Test Plan

### Unit Tests — Pairing (`src/services/matchmaking/pairing.test.ts`)

1. Round 1 opposite-seat: 8 players → 1v5, 2v6, 3v7, 4v8
2. Round 1 with dropped player: opponent gets bye
3. Swiss pairing by record: grouped by wins, paired within
4. No rematches: previously paired players not re-paired
5. Float down: odd player in bracket floats to next
6. Bye assignment: lowest-ranked without prior bye
7. No double bye: player with bye cannot get another
8. Full 3-round simulation with realistic results

### Unit Tests — Results (`src/services/matchmaking/results.test.ts`)

1. Derive winner from 2-0 (3 games, first to 2)
2. Derive winner from 2-1
3. Handle draws in individual games
4. Results match: identical submissions confirm
5. Results conflict: different submissions flagged
6. OMW% calculation with floor at 33%
7. OMW% excludes bye rounds
8. Rank players by wins then OMW%

### Unit Tests — Timers (`src/services/matchmaking/timers.test.ts`)

1. Pack draft: 14 cards → 60s, 13 → 40s, etc.
2. Leader draft: 3 remaining → 15s, 2 → 10s
3. Auto-pick at 1 remaining (returns 0)

### API Tests

1. Report result: both players submit, mutual confirmation
2. Report conflict: different results flagged
3. Override: pod owner sets result regardless
4. Boot player: marked dropped, future opponents get bye
5. Wayfinder ingestion: auto-confirms match, writes game results
6. Auto-advance: all matches confirmed → next round created
7. Create competitive draft: requires FOP
8. Non-FOP can join competitive draft

### E2E Tests

1. Full competitive practice flow: create → draft with timers → build deck → 3 rounds of BO3 → final results
2. Pod owner controls: override result, boot player, assign bye
3. Manual result reporting: melee.gg-style form, mutual confirmation
