# Other Formats Implementation Plan

## Overview

Add a third button "Other Formats" to the landing page alongside Draft and Sealed. Other Formats provides access to four alternative limited formats:

1. **Chaos Draft** - Draft with packs from 3 different sets (Beta)
2. **Rotisserie Draft** - Snake draft from entire card pool, face-up (Beta)
3. **Pack Wars** - Build deck from 2 packs (Beta)
4. **Pack Blitz** - Build deck from 1 pack (Beta)

**Note:** All Other Formats features require beta access.

---

## User Flow

### Landing Page
```
[Sealed] [Draft]                    ← Non-beta users
[Sealed] [Draft] [Other Formats]         ← Beta users only
```

### Other Formats Selection Screen
After clicking "Other Formats" (only visible to beta users):

```
┌─────────────────────────────────────────────────────┐
│                 Other Formats (Beta)                      │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐                   │
│  │ Chaos Draft │  │ Rotisserie  │                   │
│  │             │  │   Draft     │                   │
│  └─────────────┘  └─────────────┘                   │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐                   │
│  │ Pack Wars   │  │ Pack Blitz  │                   │
│  │             │  │             │                   │
│  └─────────────┘  └─────────────┘                   │
│                                                      │
│                   [← Back]                           │
└─────────────────────────────────────────────────────┘
```

---

## Mode 1: Chaos Draft

### Flow
1. User selects "Chaos Draft"
2. **Set Selection Screen**: Multi-select exactly 3 sets
   - Shows all available sets as toggleable buttons
   - Counter shows "X/3 sets selected"
   - "Start Draft" button enables when exactly 3 selected
3. **Draft Creation**: Standard draft creation flow
   - Host creates draft with `draftType: 'chaos'` and `chaosSets: ['SET1', 'SET2', 'SET3']`
   - Players join via share link
4. **Pack Generation**: When draft starts, each pack round uses a random set from the 3 selected
   - Round 1: Random set from [SET1, SET2, SET3]
   - Round 2: Random set from remaining 2
   - Round 3: Remaining set
   - OR: Each pack is randomly one of the 3 sets (simpler)
5. **Rest of draft**: Standard draft flow

### Database Changes
```sql
-- Add to drafts table
ALTER TABLE drafts ADD COLUMN draft_mode VARCHAR(20) DEFAULT 'standard';
-- Values: 'standard', 'chaos', 'rotisserie'

ALTER TABLE drafts ADD COLUMN chaos_sets TEXT[];
-- Array of set codes, e.g., ['SOR', 'TWI', 'JTL']
```

### API Changes
- `POST /api/draft` - Accept `draftMode` and `chaosSets` parameters
- `GET /api/draft/:id` - Return `draftMode` and `chaosSets` in response

### UI Components
- `ChaosDraftSetPicker.tsx` - Multi-select set picker (max 3)

---

## Mode 2: Rotisserie Draft

### Overview
Rotisserie is a "face-up" draft where all cards are visible and players snake-draft one card at a time.

### Rules
- **Card Pool**: All cards from selected sets (configurable: 1-6 sets)
- **One Copy Rule**: Each card can only be drafted by one player
- **Snake Draft Order**: 1-2-3...n, then n...3-2-1, repeat
- **Deck Requirements**:
  - 1 Leader (must be drafted)
  - 1 Base (rare bases drafted, any common base available to all)
  - 50 cards total drafted → 30-card deck + sideboard
- **Real-time**: All players see picks as they happen

### Flow
1. User selects "Rotisserie Draft"
2. **Set Selection**: Choose which sets to include (default: all)
3. **Player Count Selection**: 2-12 players
4. **Create Draft**: Host gets share link
5. **Waiting Room**: Players join, see draft order (randomized on start)
6. **Draft Phase**:
   - Full card pool displayed (searchable, filterable by set/aspect/type/cost)
   - Current picker highlighted
   - Timer per pick (configurable: 30s/60s/90s/unlimited)
   - Real-time updates via WebSocket
   - Picked cards shown in each player's pool
7. **Deck Building**: Standard deckbuilder with drafted pool

### Database Changes
```sql
-- Rotisserie-specific columns
ALTER TABLE drafts ADD COLUMN rotisserie_sets TEXT[];
ALTER TABLE drafts ADD COLUMN pick_timer_seconds INTEGER DEFAULT 60;
ALTER TABLE drafts ADD COLUMN current_picker_index INTEGER DEFAULT 0;
ALTER TABLE drafts ADD COLUMN pick_direction INTEGER DEFAULT 1; -- 1 or -1 for snake

-- Track all picks
CREATE TABLE rotisserie_picks (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER REFERENCES drafts(id),
  player_id VARCHAR(255),
  card_id VARCHAR(255),
  pick_number INTEGER,
  picked_at TIMESTAMP DEFAULT NOW()
);
```

### WebSocket Events
```typescript
// Server → Client
'rotisserie:pick_made' - { playerId, cardId, pickNumber }
'rotisserie:turn_changed' - { currentPickerId, timeRemaining }
'rotisserie:timer_tick' - { timeRemaining }
'rotisserie:draft_complete' - {}

// Client → Server
'rotisserie:make_pick' - { cardId }
```

### UI Components
- `RotisserieDraft.tsx` - Main draft view
- `RotisserieCardPool.tsx` - Full card pool with filters
- `RotisseriePickOrder.tsx` - Player order with current picker
- `RotisseriePlayerPools.tsx` - All players' drafted cards
- `RotisserieTimer.tsx` - Pick countdown timer

### Complexity: HIGH
This is the most complex mode. Consider implementing in phases:
- Phase 1: 2-player rotisserie (simpler turn logic)
- Phase 2: Multi-player with snake draft
- Phase 3: Spectator mode

---

## Mode 3: Pack Wars

### Overview
Quick casual format: open 2 packs, build a deck on the fly.

### Rules
- **Packs**: 2 booster packs per player
- **Leaders**: Both leaders from packs are available (player picks which to use each game)
- **Bases**: Use one base from packs (or any common base)
- **Deck**: All non-leader, non-base cards shuffled together = draw deck
- **Starting Hand**: 4 cards (no mulligan)
- **Aspect Penalties**: Ignored by default (toggle option)
- **Resource Buffer**: Optional - add blank cards as guaranteed resources

### Flow
1. User selects "Pack Wars"
2. **Set Selection**: Pick one set for both packs
3. **Options**:
   - [ ] Ignore Aspect Penalties (default: checked)
   - [ ] Resource Buffer (default: unchecked)
     - If checked: "How many buffer cards?" (1-5, default 3)
4. **Generate Pool**:
   - Server generates 2 packs
   - Leaders and bases extracted
   - Remaining cards form the pool
5. **Play Screen**:
   - Shows both leaders (tap to select active)
   - Shows available bases
   - Shows deck (face down, shuffled)
   - "Draw Hand" button → shows 4 cards
   - Option to export to Karabast

### Database Changes
```sql
-- New pool type
-- pools.pool_type can now be: 'sealed', 'draft', 'pack_wars', 'pack_blitz'

ALTER TABLE pools ADD COLUMN ignore_aspect_penalties BOOLEAN DEFAULT false;
ALTER TABLE pools ADD COLUMN resource_buffer_count INTEGER DEFAULT 0;
```

### API Changes
- `POST /api/pack-wars` - Generate pack wars pool
  ```json
  {
    "setCode": "SEC",
    "ignoreAspectPenalties": true,
    "resourceBufferCount": 3
  }
  ```

### UI Components
- `PackWarsSetup.tsx` - Set selection and options
- `PackWarsPlay.tsx` - Play interface with leaders, deck, hand

---

## Mode 4: Pack Blitz

### Overview
Micro version of Pack Wars using only 1 pack.

### Rules
- **Packs**: 1 booster pack per player
- **Leader**: Use the leader from the pack (no choice)
- **Base**: Use the base from the pack (or any common base)
- **Deck**: All non-leader, non-base cards = draw deck
- **Starting Hand**: 4 cards (no mulligan)
- **Aspect Penalties**: Ignored by default (toggle option)
- **Resource Buffer**: Optional

### Flow
Same as Pack Wars but with 1 pack.

### API Changes
- `POST /api/pack-blitz` - Generate pack blitz pool
  ```json
  {
    "setCode": "SEC",
    "ignoreAspectPenalties": true,
    "resourceBufferCount": 2
  }
  ```

### UI Components
- Reuse `PackWarsSetup.tsx` with `mode` prop
- Reuse `PackWarsPlay.tsx`

---

## Beta Access

**All Other Formats features require beta access.**

### Beta Page Updates
Update `/app/beta/page.tsx` feature list:
```jsx
<ul>
  <li><strong>A Lawless Time (LAW)</strong> - Set 7</li>
  <li>New pack generation rules</li>
  <li><strong>Other Formats</strong> - Alternative limited formats (Chaos Draft, Rotisserie, Pack Wars, Pack Blitz)</li>
</ul>
```

### Access Control
Other Formats button is hidden for non-beta users:
```typescript
// In UI (landing page)
const { user } = useAuth()
const hasBetaAccess = user?.is_beta_tester || user?.is_admin

// Only show Other Formats button to beta users
{hasBetaAccess && (
  <button className="mode-button other-formats-button" onClick={onOtherFormatsClick}>
    Other Formats
  </button>
)}
```

---

## File Structure

```
app/
├── formats/
│   ├── page.tsx                    # Format mode selection screen
│   ├── page.css
│   ├── chaos/
│   │   ├── page.tsx                # Chaos draft set picker
│   │   └── [shareId]/
│   │       └── page.tsx            # Chaos draft room (reuse draft components)
│   ├── rotisserie/
│   │   ├── page.tsx                # Rotisserie setup
│   │   └── [shareId]/
│   │       └── page.tsx            # Rotisserie draft room
│   ├── pack-wars/
│   │   ├── page.tsx                # Pack Wars setup + play
│   │   └── [shareId]/
│   │       └── page.tsx            # Pack Wars pool view
│   └── pack-blitz/
│       ├── page.tsx                # Pack Blitz setup + play
│       └── [shareId]/
│           └── page.tsx            # Pack Blitz pool view

src/components/
├── FunModeSelector.tsx             # Mode selection grid
├── ChaosDraftSetPicker.tsx         # Multi-select for chaos draft
├── RotisserieDraft/
│   ├── RotisserieDraft.tsx
│   ├── RotisserieCardPool.tsx
│   ├── RotisseriePickOrder.tsx
│   └── RotisserieTimer.tsx
├── PackWars/
│   ├── PackWarsSetup.tsx           # Shared by Pack Wars & Blitz
│   └── PackWarsPlay.tsx

app/api/
├── chaos-draft/
│   └── route.ts                    # Create chaos draft
├── rotisserie/
│   ├── route.ts                    # Create rotisserie draft
│   └── [shareId]/
│       └── pick/
│           └── route.ts            # Make a pick
├── pack-wars/
│   └── route.ts                    # Generate pack wars pool
└── pack-blitz/
    └── route.ts                    # Generate pack blitz pool
```

---

## Implementation Order

### Phase 1: Foundation
1. Add "Other Formats" button to landing page (hidden for non-beta users)
2. Create `/app/formats/page.tsx` mode selector
3. Update beta page with "Other Formats" in feature list

### Phase 2: Pack Wars & Pack Blitz (Simplest)
1. Create Pack Wars/Blitz API endpoints
2. Create setup UI with options
3. Create play interface

### Phase 3: Chaos Draft
1. Add database columns for chaos mode
2. Create set picker UI
3. Modify pack generation to support multiple sets
4. Test with existing draft flow

### Phase 4: Rotisserie Draft (Most Complex)
1. Database schema for rotisserie picks
2. WebSocket events for real-time picks
3. Card pool UI with filtering
4. Pick timer implementation
5. Snake draft turn logic
6. Deck builder integration

---

## Open Questions

1. **Chaos Draft pack distribution**: Should each round be a different set, or each pack randomly chosen?
2. **Rotisserie player count limits**: Support 2-12 or narrower range?
3. **Rotisserie time controls**: What default timer? Allow pausing?
4. **Pack Wars export**: Generate Karabast-compatible JSON?
5. **Resource Buffer implementation**: Actual blank cards in deck, or just a hand size modifier?

---

## Testing Checklist

- [ ] Other Formats button hidden for non-beta users
- [ ] Other Formats button visible for beta users
- [ ] Beta users see mode selector with all 4 modes
- [ ] Chaos Draft allows exactly 3 set selection
- [ ] Chaos Draft packs come from selected sets
- [ ] Pack Wars generates 2 packs correctly
- [ ] Pack Blitz generates 1 pack correctly
- [ ] Resource Buffer option adds cards
- [ ] Aspect penalty toggle works
- [ ] Rotisserie shows full card pool
- [ ] Rotisserie snake draft order works
- [ ] Rotisserie real-time updates work
- [ ] Rotisserie timer works
