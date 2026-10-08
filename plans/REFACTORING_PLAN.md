# SWUPOD Major Refactoring Plan

**Version:** 1.0
**Date:** January 2026
**Status:** Planning

---

## Executive Summary

This document outlines a comprehensive refactoring initiative for the SWUPOD codebase. The goal is to dramatically improve code quality, testability, and maintainability while preserving all existing functionality.

### Current State
- **12,018 lines** in the 7 largest files alone
- **DeckBuilder.jsx**: 7,042 lines with 68+ hooks
- **stats/page.js**: 1,345 lines with multiple embedded components
- **171 instances** of duplicated JSON parsing patterns
- Limited unit test coverage for business logic
- Tightly coupled components that are difficult to test in isolation

### Target State
- No file over 300 lines (components) or 200 lines (utilities)
- 80%+ unit test coverage on business logic
- Clear separation of concerns: UI, state, business logic, data access
- Dependency injection enabling true unit testing
- Documented architecture with clear module boundaries

### Guiding Principles
Based on Martin Fowler's *Refactoring*, Michael Feathers' *Working Effectively with Legacy Code*, and Robert Martin's *Clean Code*:

1. **Test Before Refactor**: Never refactor code without test coverage
2. **Small Steps**: Make tiny, reversible changes; commit frequently
3. **Preserve Behavior**: Refactoring changes structure, not behavior
4. **Extract, Don't Rewrite**: Pull out pieces; don't start from scratch

---

## Part 1: Code Analysis

### 1.1 Critical Files (Immediate Priority)

| File | Lines | Issues | Priority |
|------|-------|--------|----------|
| `DeckBuilder.jsx` | 7,042 | 68 hooks, mixed concerns, untestable | CRITICAL |
| `stats/page.js` | 1,345 | 10+ embedded components, no separation | CRITICAL |
| `pool/[shareId]/deck/play/page.js` | 1,115 | 23 hooks, 127 lines of sorting logic | HIGH |
| `boosterPack.js` | 686 | Global state, mixed concerns | HIGH |
| `SealedPod.jsx` | 665 | Mixed UI/data concerns | HIGH |
| `draftAdvance.js` | 629 | Business logic + DB queries mixed | HIGH |
| `PackDraftPhase.jsx` | 536 | Direct localStorage coupling | MEDIUM |

### 1.2 Code Smells Identified

#### Bloaters
- **God Component**: `DeckBuilder.jsx` handles pool display, deck building, drag-drop, filtering, sorting, sideboard, leaders, bases, and error handling
- **Long Methods**: Sorting functions spanning 100+ lines
- **Data Clumps**: Expansion state props repeated across components

#### Change Preventers
- **Shotgun Surgery**: Changing card filtering requires edits to 5+ files
- **Divergent Change**: `DeckBuilder` changes for UI, logic, and data reasons

#### Couplers
- **Feature Envy**: Components reaching deep into draft state
- **Inappropriate Intimacy**: Direct `localStorage` access scattered everywhere

#### Dispensables
- **Duplicate Code**: JSON parsing pattern repeated 171 times
- **Dead Code**: Unused variables and commented-out blocks

### 1.3 Testability Issues

1. **No Dependency Injection**: Components create their own dependencies
2. **Side Effects in Components**: API calls, localStorage, timers mixed with rendering
3. **Global State**: `beltCache`, `botBehaviors` as module-level variables
4. **Coupled Business Logic**: Calculations embedded in JSX

---

## Part 2: Target Architecture

### 2.1 Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI Layer                                    │
│  React Components - Pure presentation, receive data via props/hooks     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ DeckBuilder  │ │ PoolSection  │ │ CardGrid     │ │ FilterPanel  │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Hooks Layer                                   │
│  Custom hooks - State management, side effects, compose services        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ useDeckState │ │ useFilters   │ │ useDragDrop  │ │ useCardSort  │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Services Layer                                  │
│  Business logic - Pure functions, no side effects, fully testable       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ DeckService  │ │ DraftService │ │ SortService  │ │ FilterService│   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Data Access Layer                                 │
│  API clients, repositories - Isolated I/O, easy to mock                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ HttpClient   │ │ DraftRepo    │ │ PoolRepo     │ │ StorageRepo  │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 New Directory Structure

```
src/
├── components/                 # UI Components (presentation only)
│   ├── DeckBuilder/
│   │   ├── index.jsx          # Main component (<300 lines)
│   │   ├── PoolSection.jsx    # Pool display
│   │   ├── DeckSection.jsx    # Deck display
│   │   ├── SideboardSection.jsx
│   │   ├── LeadersBasesSection.jsx
│   │   ├── FilterPanel.jsx    # Reusable filter UI
│   │   ├── CardGrid.jsx       # Grid display
│   │   └── DragDropCanvas.jsx # Drag-drop visualization
│   ├── Draft/
│   │   ├── LeaderDraftPhase.jsx
│   │   ├── PackDraftPhase.jsx
│   │   ├── DraftLobby.jsx
│   │   └── PlayerCircle/
│   ├── common/                # Shared UI components
│   │   ├── Button.jsx
│   │   ├── Modal.jsx
│   │   ├── CardPreview.jsx
│   │   └── Tooltip.jsx
│   └── ...
│
├── hooks/                     # Custom React hooks
│   ├── deck/
│   │   ├── useDeckState.js    # Deck/pool state management
│   │   ├── useDeckFilters.js  # Filter state and logic
│   │   ├── useDeckSort.js     # Sorting state and logic
│   │   └── useDragDrop.js     # Drag-drop behavior
│   ├── draft/
│   │   ├── useDraftState.js   # Draft room state
│   │   ├── useDraftSocket.js  # WebSocket connection
│   │   └── useDraftSelection.js
│   ├── common/
│   │   ├── useLocalStorage.js # localStorage abstraction
│   │   ├── useIsMobile.js     # Device detection
│   │   └── useHoverPreview.js # Tooltip/preview logic
│   └── ...
│
├── services/                  # Pure business logic (no I/O)
│   ├── deck/
│   │   ├── deckService.js     # Deck building operations
│   │   ├── deckService.test.js
│   │   ├── aspectPenalties.js # Aspect penalty calculations
│   │   └── aspectPenalties.test.js
│   ├── draft/
│   │   ├── draftService.js    # Draft advancement logic
│   │   ├── draftService.test.js
│   │   ├── leaderDraft.js     # Leader draft specific
│   │   └── packDraft.js       # Pack draft specific
│   ├── cards/
│   │   ├── cardSorting.js     # All sorting algorithms
│   │   ├── cardSorting.test.js
│   │   ├── cardFiltering.js   # All filtering logic
│   │   └── cardFiltering.test.js
│   └── ...
│
├── repositories/              # Data access layer
│   ├── httpClient.js          # Base HTTP client with error handling
│   ├── draftRepository.js     # Draft API calls
│   ├── poolRepository.js      # Pool API calls
│   ├── storageRepository.js   # localStorage abstraction
│   └── ...
│
├── utils/                     # Pure utilities
│   ├── json.js               # jsonParse, jsonStringify helpers
│   ├── validation.js         # Input validation
│   └── ...
│
└── contexts/                  # React contexts (minimal)
    ├── AuthContext.jsx
    └── ...

app/
├── stats/
│   ├── page.js               # Main stats page (composition only)
│   └── components/
│       ├── ReferenceTab.jsx
│       ├── QATab.jsx
│       ├── TestTab.jsx
│       └── GenerationStatsTab/
│           ├── index.jsx
│           ├── CardsSubTab.jsx
│           └── PacksSubTab.jsx
└── ...
```

### 2.3 Module Boundaries

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| `components/*` | Render UI based on props | hooks, contexts |
| `hooks/*` | Manage state, compose services | services, repositories |
| `services/*` | Business logic, pure functions | NONE (pure) |
| `repositories/*` | Data access, API calls | httpClient |
| `utils/*` | Shared utilities | NONE (pure) |

**Rule**: Lower layers NEVER import from higher layers.

---

## Part 3: Refactoring Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Establish infrastructure without touching existing code behavior.

#### 1.1 Create Utility Layer
```
Priority: HIGH
Risk: LOW
```

Extract duplicated patterns into utilities:

| Utility | Purpose | Replaces |
|---------|---------|----------|
| `src/utils/json.js` | Safe JSON parsing | 171 inline occurrences |
| `src/repositories/httpClient.js` | HTTP client with error handling | 15+ fetch patterns in draftApi.js |
| `src/hooks/common/useLocalStorage.js` | localStorage abstraction | Direct localStorage calls |
| `src/hooks/common/useIsMobile.js` | Device detection | Inline checks in 3+ files |

**Tests Required Before**:
- Characterization tests for existing JSON parsing behavior
- Characterization tests for existing fetch error handling

#### 1.2 Create Service Layer Structure
```
Priority: HIGH
Risk: LOW
```

Create empty service files with interfaces:

```javascript
// src/services/cards/cardSorting.js
/**
 * Sort cards by aspect, then by cost, then by name
 * @param {Card[]} cards - Cards to sort
 * @param {Object} options - Sort options
 * @returns {Card[]} Sorted cards
 */
export function sortByAspect(cards, options = {}) {
  // Will be extracted from play/page.js
}
```

### Phase 2: Extract Pure Business Logic (Week 2-4)
**Goal**: Pull business logic out of components into testable services.

#### 2.1 Card Sorting Service
```
Priority: HIGH
Risk: MEDIUM
Current Location: app/pool/[shareId]/deck/play/page.js (lines 16-107)
Target: src/services/cards/cardSorting.js
```

**Before Refactoring**:
1. Write characterization test capturing current sorting behavior
2. Test with various card sets and edge cases

**Extract**:
- `getDefaultAspectSortKey(card)` (61 lines)
- `defaultSort(cards)` (27 lines)
- Any sorting used in DeckBuilder

**After**:
```javascript
// src/services/cards/cardSorting.test.js
describe('cardSorting', () => {
  describe('sortByAspect', () => {
    it('sorts vigilance before command', () => {})
    it('sorts by cost within same aspect', () => {})
    it('handles cards with no aspect', () => {})
    it('handles multi-aspect cards', () => {})
  })
})
```

#### 2.2 Aspect Penalty Service
```
Priority: HIGH
Risk: MEDIUM
Current Location: DeckBuilder.jsx (lines 169-250)
Target: src/services/deck/aspectPenalties.js
```

**Extract**:
- Leader aspect penalty registry (hardcoded object)
- `calculateAspectPenalty(deck, leader, base)` function
- `getRelevantAspects(leader, base)` function

**Tests**:
```javascript
describe('aspectPenalties', () => {
  it('returns 0 for cards matching leader aspects', () => {})
  it('returns penalty for out-of-aspect cards', () => {})
  it('handles Mon Mothma ignoring relevant aspect penalty', () => {})
  it('handles Hera ignoring relevant aspect penalty', () => {})
})
```

#### 2.3 Card Filtering Service
```
Priority: HIGH
Risk: MEDIUM
Current Location: DeckBuilder.jsx (scattered throughout)
Target: src/services/cards/cardFiltering.js
```

**Extract**:
- Aspect filtering logic
- Type filtering logic
- Cost filtering logic
- Rarity filtering logic
- Search/text filtering logic

### Phase 3: Extract Repository Layer (Week 4-5)
**Goal**: Isolate all data access behind clean interfaces.

#### 3.1 HTTP Client
```javascript
// src/repositories/httpClient.js
class HttpClient {
  async get(url) { /* standardized GET */ }
  async post(url, body) { /* standardized POST */ }
  async put(url, body) { /* standardized PUT */ }
  async delete(url) { /* standardized DELETE */ }
}

// Easy to mock in tests
export const createHttpClient = (baseUrl) => new HttpClient(baseUrl)
```

#### 3.2 Draft Repository
```
Current Location: src/utils/draftApi.js (338 lines)
Target: src/repositories/draftRepository.js
```

**Extract**:
- `getDraft(shareId)`
- `joinDraft(shareId, userId)`
- `selectCard(shareId, cardId)`
- `advanceDraft(shareId)`

**All methods return promises, no error handling in callers**.

#### 3.3 Pool Repository
```
Current Location: src/utils/poolApi.js
Target: src/repositories/poolRepository.js
```

#### 3.4 Storage Repository
```javascript
// src/repositories/storageRepository.js
export const storageRepository = {
  get: (key, defaultValue = null) => { /* safe localStorage get */ },
  set: (key, value) => { /* safe localStorage set */ },
  remove: (key) => { /* safe localStorage remove */ },
  clear: () => { /* clear all */ }
}
```

### Phase 4: Extract Custom Hooks (Week 5-7)
**Goal**: Move state management out of components into reusable hooks.

#### 4.1 DeckBuilder Hooks
```
Target: src/hooks/deck/
```

| Hook | Responsibility | Extracted From |
|------|----------------|----------------|
| `useDeckState` | pool, deck, sideboard state | DeckBuilder lines 30-150 |
| `useDeckFilters` | aspect, type, cost, rarity filters | DeckBuilder lines 200-300 |
| `useDeckSort` | sort options, sort execution | DeckBuilder lines 400-500 |
| `useDragDrop` | drag state, drop handlers, canvas | DeckBuilder lines 600-800 |
| `useExpansionState` | accordion expand/collapse | DeckBuilder lines 150-200 |

**Example**:
```javascript
// src/hooks/deck/useDeckFilters.js
export function useDeckFilters(initialFilters = {}) {
  const [filters, setFilters] = useState(initialFilters)

  const applyFilters = useCallback((cards) => {
    return filterCards(cards, filters) // Uses pure service function
  }, [filters])

  const setAspectFilter = useCallback((aspect) => {
    setFilters(f => ({ ...f, aspect }))
  }, [])

  return { filters, applyFilters, setAspectFilter, /* ... */ }
}
```

#### 4.2 Draft Hooks
```
Target: src/hooks/draft/
```

| Hook | Responsibility |
|------|----------------|
| `useDraftRoom` | Draft room state, player data |
| `useDraftSelection` | Card selection with localStorage sync |
| `useLeaderPreview` | Leader hover preview with timeout |

#### 4.3 Common Hooks
```
Target: src/hooks/common/
```

| Hook | Responsibility | Current Duplication |
|------|----------------|---------------------|
| `useLocalStorage` | Persistent state | 10+ direct calls |
| `useIsMobile` | Device detection | 3+ inline checks |
| `useHoverPreview` | Tooltip with debounce | 4+ implementations |
| `usePagination` | Page state, limits | stats page |

### Phase 5: Component Decomposition (Week 7-10)
**Goal**: Break god components into focused, single-responsibility components.

#### 5.1 DeckBuilder Decomposition

**Before**: 1 file, 7,042 lines
**After**: 10+ files, ~250 lines each

```
src/components/DeckBuilder/
├── index.jsx              # Composition root (~200 lines)
├── PoolSection.jsx        # Pool display and interactions
├── DeckSection.jsx        # Deck display and interactions
├── SideboardSection.jsx   # Sideboard display
├── LeadersBasesSection.jsx # Leader/base selection
├── FilterPanel.jsx        # Filter controls (reusable)
├── SortControls.jsx       # Sort buttons
├── CardGrid.jsx           # Card display grid
├── DragDropCanvas.jsx     # Visual drag feedback
├── DeckStats.jsx          # Deck statistics display
├── AspectPenaltyDisplay.jsx # Penalty indicators
└── DeckBuilder.css        # Styles (split if needed)
```

**Decomposition Strategy**:
1. Identify natural boundaries (sections of UI)
2. Write integration tests for DeckBuilder as a whole
3. Extract one section at a time
4. Keep state in hooks, pass down as props
5. Verify integration tests pass after each extraction

#### 5.2 Stats Page Decomposition

**Before**: 1 file, 1,345 lines
**After**: Separate files per tab

```
app/stats/
├── page.js                    # Route handler, tab composition
└── components/
    ├── StatsLayout.jsx        # Shared layout
    ├── TabNavigation.jsx      # Tab switching
    ├── ReferenceTab.jsx       # Reference data display
    ├── QATab.jsx              # QA results
    ├── TestTab.jsx            # Test utilities
    └── GenerationStatsTab/
        ├── index.jsx          # Tab container
        ├── CardsSubTab.jsx    # Card generation stats
        ├── PacksSubTab.jsx    # Pack generation stats
        └── usePagination.js   # Pagination hook
```

#### 5.3 Play Page Decomposition

**Before**: 1,115 lines
**After**: Multiple focused components

```
app/pool/[shareId]/deck/play/
├── page.js                    # Route handler only
└── components/
    ├── PlayPageContent.jsx    # Main content
    ├── OpponentSection.jsx    # Opponent display
    ├── DeckExportModal.jsx    # Export functionality
    └── ByeDisplay.jsx         # Bye handling
```

### Phase 6: API Route Refactoring (Week 10-11)
**Goal**: Separate route handlers from business logic.

#### 6.1 Create Route Handler Pattern
```javascript
// app/api/draft/[shareId]/route.js
import { DraftService } from '@/src/services/draft/draftService'
import { DraftRepository } from '@/src/repositories/draftRepository'
import { formatDraftResponse } from '@/src/utils/responseFormatters'

export async function GET(request, { params }) {
  const { shareId } = params

  // Repository handles data access
  const draftData = await DraftRepository.getDraft(shareId)

  // Service handles business logic
  const processedDraft = DraftService.processDraftState(draftData)

  // Formatter handles response structure
  return formatDraftResponse(processedDraft)
}
```

#### 6.2 Stats Route Refactoring
```
Current: app/api/stats/generations/route.js (397 lines)
Target: Split into StatsService + StatsRepository
```

### Phase 7: Belt System Refactoring (Week 11-12)
**Goal**: Improve testability of pack generation system.

#### 7.1 Extract Belt Factory
```javascript
// src/belts/beltFactory.js
export function createBeltSystem(options = {}) {
  const cache = options.cache || new Map()

  return {
    getCommonBelt: (set) => { /* ... */ },
    getUncommonBelt: (set) => { /* ... */ },
    clearCache: () => cache.clear(),
    // Dependency injection for testing
  }
}
```

#### 7.2 Remove Global State
Replace module-level `beltCache` with injected cache:
```javascript
// Before
let beltCache = new Map() // Global!

// After
export function createBoosterPackGenerator(beltSystem) {
  return {
    generatePack: (set) => { /* uses beltSystem */ }
  }
}
```

---

## Part 4: Testing Strategy

### 4.1 Testing Pyramid

```
                    ┌─────────────┐
                   │    E2E      │  10% - Critical user flows
                  │   Tests     │
                 └─────────────┘
               ┌───────────────────┐
              │   Integration     │  20% - Component interactions
             │      Tests        │
            └───────────────────┘
         ┌───────────────────────────┐
        │       Unit Tests          │  70% - Services, utilities
       │    (Pure Functions)       │
      └───────────────────────────────┘
```

### 4.2 Test Coverage Requirements

| Layer | Coverage Target | Test Type |
|-------|-----------------|-----------|
| Services | 90%+ | Unit tests |
| Utilities | 95%+ | Unit tests |
| Hooks | 80%+ | Integration tests with React Testing Library |
| Components | 70%+ | Integration tests |
| API Routes | 80%+ | Integration tests |

### 4.3 Characterization Tests

Before refactoring any code, write characterization tests that capture current behavior:

```javascript
// src/services/cards/cardSorting.characterization.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert'

// These tests document CURRENT behavior, even if buggy
describe('Card Sorting - Characterization', () => {
  it('sorts this specific deck in this specific order', () => {
    const deck = loadTestDeck('sample-aggression-deck')
    const sorted = currentSortImplementation(deck)

    // Snapshot of actual current behavior
    assert.deepStrictEqual(
      sorted.map(c => c.id),
      ['SOR-123', 'SOR-456', 'TWI-789', /* ... */]
    )
  })
})
```

### 4.4 Test File Organization

```
src/
├── services/
│   └── cards/
│       ├── cardSorting.js
│       ├── cardSorting.test.js           # Unit tests
│       └── cardSorting.characterization.test.js  # Pre-refactor snapshot
├── hooks/
│   └── deck/
│       ├── useDeckFilters.js
│       └── useDeckFilters.test.js        # Hook tests with RTL
└── components/
    └── DeckBuilder/
        ├── index.jsx
        └── DeckBuilder.integration.test.js  # Full component test
```

---

## Part 5: Implementation Guidelines

### 5.1 The Refactoring Loop

```
┌──────────────────────────────────────────────────────────────┐
│  1. IDENTIFY code to refactor                                │
│     └─► Choose smallest meaningful extraction                │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  2. WRITE characterization test (if none exists)             │
│     └─► Capture current behavior exactly                     │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  3. VERIFY test passes                                       │
│     └─► If test fails, fix test (documenting actual behavior)│
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  4. EXTRACT code to new location                             │
│     └─► Copy, don't cut (leave original temporarily)         │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  5. VERIFY test still passes                                 │
│     └─► New code must behave identically                     │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  6. UPDATE original to use new code                          │
│     └─► Replace inline code with function call               │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  7. VERIFY test still passes                                 │
│     └─► Behavior unchanged after integration                 │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  8. COMMIT                                                   │
│     └─► Small, atomic commit with clear message              │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  9. WRITE new unit tests (for extracted code)                │
│     └─► Now test edge cases, error conditions                │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
                      (Repeat for next piece)
```

### 5.2 Commit Message Format

```
refactor(module): brief description

- What was extracted/changed
- Why (code smell addressed)
- Tests added/updated

Refs: REFACTOR-PHASE-X
```

Examples:
```
refactor(cards): extract sorting logic to cardSorting service

- Moved getDefaultAspectSortKey from play/page.js to services
- Moved defaultSort function
- Added 12 unit tests for sorting edge cases
- Reduces play/page.js by 107 lines

Refs: REFACTOR-PHASE-2
```

### 5.3 Definition of Done (Per Extraction)

- [ ] Characterization test written (if behavior existed)
- [ ] Characterization test passes before refactoring
- [ ] Code extracted to new location
- [ ] Original code updated to use extraction
- [ ] All tests pass (characterization + existing)
- [ ] New unit tests written for extracted code
- [ ] New unit tests achieve 90%+ coverage on extracted code
- [ ] Code committed with proper message
- [ ] No increase in overall bundle size

---

## Part 6: Success Metrics

### 6.1 Quantitative Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Largest file (lines) | 7,042 | <300 | `wc -l` |
| Files over 500 lines | 7 | 0 | Script count |
| Average component lines | ~400 | <150 | Script calculation |
| Duplicated patterns | 171 | <10 | Grep count |
| Unit test coverage | ~30% | 80% | Coverage tool |
| Service test coverage | 0% | 90% | Coverage tool |
| useState hooks in DeckBuilder | 68 | <10 | Grep count |

### 6.2 Qualitative Metrics

| Metric | How to Measure |
|--------|----------------|
| Time to add new filter | Should be <30 mins, single file change |
| Time to fix sorting bug | Should be <15 mins, single test file to verify |
| New developer onboarding | Can understand module in <1 hour |
| Test reliability | No flaky tests |

### 6.3 Progress Tracking

Create a tracking issue/document with checkboxes:

```markdown
## Phase 1: Foundation
- [ ] Create json.js utility
- [ ] Create httpClient.js
- [ ] Create useLocalStorage hook
- [ ] Create useIsMobile hook

## Phase 2: Services
- [ ] Extract cardSorting service (with tests)
- [ ] Extract cardFiltering service (with tests)
- [ ] Extract aspectPenalties service (with tests)
...
```

---

## Part 7: Risk Mitigation

### 7.1 Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing functionality | Medium | High | Characterization tests before each refactor |
| Scope creep during refactoring | High | Medium | Strict "extract only" rule; no improvements during extraction |
| Performance regression | Low | Medium | Benchmark critical paths before/after |
| Team confusion during transition | Medium | Medium | Clear documentation, communication |
| Incomplete refactoring | Medium | Low | Each phase delivers value independently |

### 7.2 Rollback Strategy

Each phase is independently deployable. If issues arise:
1. Revert to previous commit
2. Investigate with characterization tests
3. Fix and re-apply

### 7.3 Feature Freeze Recommendations

During active refactoring of a module:
- No new features to that module
- Bug fixes allowed (with tests first)
- Other modules can proceed normally

---

## Part 8: Documentation Updates

### 8.1 Documents to Create

| Document | Purpose |
|----------|---------|
| `docs/ARCHITECTURE.md` | System architecture overview |
| `docs/SERVICES.md` | Service layer documentation |
| `docs/HOOKS.md` | Custom hooks reference |
| `docs/TESTING.md` | Testing standards and patterns |

### 8.2 Documents to Update

| Document | Updates Needed |
|----------|---------------|
| `CLAUDE.md` | Add service/hook patterns, testing guidelines |
| `docs/STYLE_GUIDE.md` | Component composition patterns |

### 8.3 Documents to Retire

Review and potentially consolidate:
- `docs/DEV_LOG.md` - Archive if stale
- `docs/QA_STATUS.md` - Merge into TESTING.md if relevant

---

## Appendix A: Code Smell Reference

### Smell: Long Method
**Signs**: Method > 20 lines, multiple indent levels, multiple concerns
**Fix**: Extract Method, Extract Variable

### Smell: Large Class
**Signs**: Class > 300 lines, many instance variables, multiple responsibilities
**Fix**: Extract Class, Extract Subclass

### Smell: Feature Envy
**Signs**: Method uses another object's data more than its own
**Fix**: Move Method to the class whose data it uses

### Smell: Data Clumps
**Signs**: Same group of variables passed together repeatedly
**Fix**: Extract Class (create a parameter object)

### Smell: Primitive Obsession
**Signs**: Using strings/numbers instead of small domain objects
**Fix**: Replace Primitive with Object

### Smell: Duplicate Code
**Signs**: Same structure in multiple places
**Fix**: Extract Method, Pull Up Method, Extract Class

---

## Appendix B: Resources

### Books
- *Refactoring* by Martin Fowler (2nd Edition)
- *Working Effectively with Legacy Code* by Michael Feathers
- *Clean Code* by Robert C. Martin

### Online
- [Refactoring Catalog](https://refactoring.com/catalog/)
- [Refactoring.Guru - Code Smells](https://refactoring.guru/refactoring/smells)
- [Martin Fowler's Blog](https://martinfowler.com/bliki/)

---

## Approval

- [ ] Technical review complete
- [ ] Stakeholder approval
- [ ] Ready to begin Phase 1

---

*This document is a living plan. Update as discoveries are made during refactoring.*
