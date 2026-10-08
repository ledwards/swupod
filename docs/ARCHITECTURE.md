# SWUPOD Architecture

**Last Updated:** January 2026

This document describes the target architecture for SWUPOD after the refactoring initiative.

---

## Overview

SWUPOD is a Star Wars: Unlimited draft and sealed simulator built with Next.js. The architecture follows a layered approach to maximize testability and maintainability.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js App                              │
│  app/                                                            │
│  ├── pages (route handlers)                                      │
│  └── api/ (API routes)                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                          │
│  src/components/                                                 │
│  Pure React components, no business logic                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       State Layer                                │
│  src/hooks/                                                      │
│  Custom hooks for state management and side effects             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Business Layer                              │
│  src/services/                                                   │
│  Pure functions implementing business logic                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
│  src/repositories/                                               │
│  Data access, API calls, storage                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Systems                            │
│  PostgreSQL, WebSocket, localStorage, External APIs              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Domains

### 1. Pack Generation Domain

Responsible for creating realistic booster packs following SWU collation rules.

```
src/belts/           # Belt system (hopper-based card dispensing)
├── LeaderBelt.js    # 1 leader per pack
├── BaseBelt.js      # 1 base per pack
├── CommonBelt.js    # 9 commons with A/B pool deduplication
├── UncommonBelt.js  # 3 uncommons
├── RareLegendaryBelt.js
├── FoilBelt.js
└── ...

src/utils/
├── boosterPack.js   # Pack generation orchestration
├── packConstants.js # Rarity rates, slot definitions
└── setConfigs/      # Per-set configuration
```

**Key Concepts:**
- **Belt**: A dispenser that draws cards from a "hopper", refilling from a "filling pool" when empty
- **Seam**: A group of cards that can't appear adjacent (prevents duplicates)
- **Treatment**: Card variant (Normal, Foil, Hyperspace, Showcase)

### 2. Draft Domain

Manages multiplayer draft sessions with real-time synchronization.

```
src/services/draft/
├── draftService.js      # Draft advancement logic
├── leaderDraft.js       # Leader selection phase
└── packDraft.js         # Pack passing phase

src/hooks/draft/
├── useDraftSocket.js    # WebSocket connection
├── useDraftState.js     # Draft room state
└── useDraftSelection.js # Card selection

src/repositories/
└── draftRepository.js   # Draft API calls
```

**Draft Phases:**
1. **Lobby** - Players join, host configures
2. **Leader Draft** - 3 rounds of leader selection
3. **Pack Draft** - Open packs, pick cards, pass packs
4. **Review** - View picks before deck building

### 3. Deck Building Domain

Provides deck construction with filtering, sorting, and validation.

```
src/services/deck/
├── deckService.js       # Deck operations
├── aspectPenalties.js   # Aspect penalty calculations
└── deckValidation.js    # Deck legality rules

src/services/cards/
├── cardSorting.js       # All sorting algorithms
└── cardFiltering.js     # All filtering logic

src/hooks/deck/
├── useDeckState.js      # Pool/deck/sideboard state
├── useDeckFilters.js    # Filter state
├── useDeckSort.js       # Sort state
└── useDragDrop.js       # Drag-drop behavior
```

### 4. Sealed Domain

Generates sealed pools for solo play.

```
src/services/sealed/
└── sealedService.js     # Pool generation

src/repositories/
└── poolRepository.js    # Pool CRUD operations
```

---

## Layer Responsibilities

### Presentation Layer (`src/components/`)

**Purpose**: Render UI based on props

**Rules**:
- Components receive all data via props or hooks
- No direct API calls
- No business logic (calculations, validations)
- No direct localStorage/sessionStorage access
- Keep components under 300 lines

**Example**:
```jsx
// GOOD - Pure presentation
function CardGrid({ cards, onCardClick, selectedIds }) {
  return (
    <div className="card-grid">
      {cards.map(card => (
        <Card
          key={card.id}
          card={card}
          selected={selectedIds.includes(card.id)}
          onClick={() => onCardClick(card.id)}
        />
      ))}
    </div>
  )
}

// BAD - Business logic in component
function CardGrid({ cards }) {
  const sortedCards = cards.sort((a, b) => a.cost - b.cost) // Logic!
  const filteredCards = sortedCards.filter(c => c.aspect === 'Aggression') // Logic!
  // ...
}
```

### State Layer (`src/hooks/`)

**Purpose**: Manage state and compose services

**Rules**:
- Hooks call services for business logic
- Hooks call repositories for data access
- Hooks manage React state (useState, useReducer)
- Hooks handle side effects (useEffect)
- Keep hooks focused (single responsibility)

**Example**:
```javascript
// src/hooks/deck/useDeckFilters.js
import { filterCards } from '@/src/services/cards/cardFiltering'

export function useDeckFilters(initialFilters = {}) {
  const [filters, setFilters] = useState(initialFilters)

  const applyFilters = useCallback((cards) => {
    return filterCards(cards, filters) // Delegates to service
  }, [filters])

  return { filters, setFilters, applyFilters }
}
```

### Business Layer (`src/services/`)

**Purpose**: Implement business logic as pure functions

**Rules**:
- NO React imports
- NO side effects (API calls, storage, timers)
- NO state management
- Pure functions: same input → same output
- 90%+ test coverage required

**Example**:
```javascript
// src/services/cards/cardSorting.js

/**
 * Sort cards by aspect priority, then cost, then name
 * @param {Card[]} cards - Cards to sort
 * @returns {Card[]} New sorted array (does not mutate input)
 */
export function sortByAspect(cards) {
  return [...cards].sort((a, b) => {
    const aspectDiff = getAspectPriority(a) - getAspectPriority(b)
    if (aspectDiff !== 0) return aspectDiff

    const costDiff = (a.cost ?? 99) - (b.cost ?? 99)
    if (costDiff !== 0) return costDiff

    return a.name.localeCompare(b.name)
  })
}
```

### Data Layer (`src/repositories/`)

**Purpose**: Abstract data access

**Rules**:
- Single responsibility: one repository per domain
- Return promises for async operations
- Handle errors consistently
- Easy to mock in tests

**Example**:
```javascript
// src/repositories/draftRepository.js
import { httpClient } from './httpClient'

export const draftRepository = {
  async getDraft(shareId) {
    return httpClient.get(`/api/draft/${shareId}`)
  },

  async joinDraft(shareId, userId) {
    return httpClient.post(`/api/draft/${shareId}/join`, { userId })
  },

  async selectCard(shareId, cardId) {
    return httpClient.post(`/api/draft/${shareId}/select`, { cardId })
  }
}
```

---

## Dependency Rules

```
┌─────────────────────────────────────────────────┐
│  Components may import:                         │
│  ✓ Other components                             │
│  ✓ Hooks                                        │
│  ✓ Contexts                                     │
│  ✗ Services (use hooks instead)                 │
│  ✗ Repositories (use hooks instead)             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Hooks may import:                              │
│  ✓ Other hooks                                  │
│  ✓ Services                                     │
│  ✓ Repositories                                 │
│  ✓ Contexts                                     │
│  ✗ Components                                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Services may import:                           │
│  ✓ Other services                               │
│  ✓ Utils                                        │
│  ✗ Hooks                                        │
│  ✗ Repositories                                 │
│  ✗ React anything                               │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Repositories may import:                       │
│  ✓ httpClient                                   │
│  ✓ Utils                                        │
│  ✗ Services                                     │
│  ✗ Hooks                                        │
│  ✗ Components                                   │
└─────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### Example 1: User Filters Cards

```
User clicks "Aggression" filter
        │
        ▼
┌─────────────────────────────┐
│  FilterPanel (Component)    │
│  onClick={() =>             │
│    setAspectFilter('Aggression')}
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  useDeckFilters (Hook)      │
│  setFilters(f => ({         │
│    ...f,                    │
│    aspect: 'Aggression'     │
│  }))                        │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  DeckBuilder (Component)    │
│  const filtered =           │
│    applyFilters(pool)       │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  filterCards (Service)      │
│  Pure function filters      │
│  cards by aspect            │
└─────────────────────────────┘
        │
        ▼
  Filtered cards displayed
```

### Example 2: User Selects Card in Draft

```
User clicks card in pack
        │
        ▼
┌─────────────────────────────┐
│  PackDraftPhase (Component) │
│  onCardClick={selectCard}   │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  useDraftSelection (Hook)   │
│  async selectCard(cardId) { │
│    await draftRepo.select() │
│    setSelectedCard(cardId)  │
│  }                          │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  draftRepository            │
│  POST /api/draft/:id/select │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  API Route                  │
│  Validates, updates DB      │
│  Broadcasts via WebSocket   │
└─────────────────────────────┘
```

---

## Testing Strategy

### Unit Tests (Services)

```javascript
// src/services/cards/cardSorting.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { sortByAspect } from './cardSorting.js'

describe('sortByAspect', () => {
  it('sorts vigilance before aggression', () => {
    const cards = [
      { name: 'A', aspects: ['Aggression'] },
      { name: 'B', aspects: ['Vigilance'] }
    ]
    const sorted = sortByAspect(cards)
    assert.strictEqual(sorted[0].name, 'B')
  })
})
```

### Hook Tests

```javascript
// src/hooks/deck/useDeckFilters.test.js
import { renderHook, act } from '@testing-library/react'
import { useDeckFilters } from './useDeckFilters'

describe('useDeckFilters', () => {
  it('filters cards by aspect', () => {
    const { result } = renderHook(() => useDeckFilters())

    act(() => {
      result.current.setAspectFilter('Aggression')
    })

    const cards = [
      { id: 1, aspects: ['Aggression'] },
      { id: 2, aspects: ['Vigilance'] }
    ]
    const filtered = result.current.applyFilters(cards)

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(1)
  })
})
```

### Component Tests

```javascript
// src/components/DeckBuilder/DeckBuilder.integration.test.js
import { render, screen, fireEvent } from '@testing-library/react'
import { DeckBuilder } from './index'

describe('DeckBuilder', () => {
  it('adds card to deck when clicked in pool', () => {
    render(<DeckBuilder pool={mockPool} />)

    fireEvent.click(screen.getByText('Luke Skywalker'))

    expect(screen.getByTestId('deck-section'))
      .toContainElement(screen.getByText('Luke Skywalker'))
  })
})
```

---

## File Size Guidelines

| Type | Max Lines | Notes |
|------|-----------|-------|
| Component | 300 | Split if larger |
| Hook | 150 | Extract helpers if larger |
| Service function | 50 | Split into smaller functions |
| Service file | 200 | Group related functions |
| Test file | 500 | OK to be longer |

---

## See Also

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - Detailed refactoring phases
- [STYLE_GUIDE.md](./STYLE_GUIDE.md) - UI component guidelines
- [CLAUDE.md](../CLAUDE.md) - Developer reference
