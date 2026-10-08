# DeckBuilder Components

This folder contains sub-components extracted from the main `DeckBuilder.jsx` to improve maintainability and reusability.

## Component Overview

### Layout Components

| Component | Description | Used By |
|-----------|-------------|---------|
| `CardGrid.jsx` | Renders a grid of card stacks. Handles empty states. | DeckSection, PoolSection |
| `CardPreview.jsx` | Shows enlarged card preview on hover with foil/hyperspace effects | DeckBuilder |
| `Tooltip.jsx` | Positioned tooltip overlay for card info | DeckBuilder |

### Section Components (Grid View)

| Component | Description | Props From |
|-----------|-------------|------------|
| `DeckSection.jsx` | Renders deck cards in grid view, grouped by sort option | DeckBuilderContext |
| `PoolSection.jsx` | Renders pool/sideboard cards in grid view | DeckBuilderContext |
| `LeaderBaseSelector.jsx` | Leader and base selection with click-to-select | DeckBuilderContext |

### Section Components (List View)

| Component | Description |
|-----------|-------------|
| `SelectionListSection.jsx` | Table view for leaders and bases |
| `PoolListSection.jsx` | Table view for pool, deck, and sideboard with sorting |
| `ListTableHeader.jsx` | Reusable sortable table header with checkbox |

### Section Components (Arena View)

| Component | Description |
|-----------|-------------|
| `ArenaView.tsx` | Main arena view container (desktop only) |
| `ArenaPoolSection.tsx` | Top half: pool cards with aspect filters and search |
| `ArenaDeckSection.tsx` | Bottom half: deck cards in cost columns |
| `ArenaCardStack.tsx` | Stacked cards within a cost column |
| `ArenaLeaderBaseSelector.tsx` | Horizontal leader/base row for arena view |
| `ResizableCard.tsx` | Card component that scales to container width |

### Header & Controls

| Component | Description |
|-----------|-------------|
| `DeckBuilderHeader.jsx` | Main header with title, export buttons, back navigation |
| `SectionHeader.jsx` | Section header with sort/filter controls |
| `StickyInfoBar.jsx` | Sticky bar showing deck stats (card counts, leader ability) |
| `SortControls.jsx` | Sort option buttons (aspect, cost, type, default) |
| `FilterWithModal.jsx` | Filter button that opens AspectFilterModal |
| `AspectPenaltyToggle.jsx` | Toggle switch for showing/hiding aspect penalties |
| `ViewModeToggle.jsx` | Grid/List view toggle button |
| `CollapsibleSectionHeader.jsx` | Expandable section header with arrow indicator |

### UI Elements

| Component | Description |
|-----------|-------------|
| `TypeIcon.jsx` | Card type icon (Unit, Event, Upgrade, etc.) |
| `GroupHeader.jsx` | Header for card groups showing aspect/cost/type with count |
| `ArenaActionsBar.jsx` | Unified ACTIONS bar (+ All / − All / Swap / In Aspect / Out of Aspect) shared by arena, playmat, and table views |
| `AspectFilterModal.jsx` | Modal dialog for filtering by aspects, types, sets |

### Modals

| Component | Description |
|-----------|-------------|
| `DeckImageModal.jsx` | Modal for deck image export with download/copy buttons |
| `DeleteDeckSection.jsx` | Delete button with confirmation modal |

## Architecture

```
DeckBuilder.jsx (Main Orchestrator)
├── Uses DeckBuilderContext for shared state
├── Renders based on viewMode (grid/list/arena)
│
├── Grid View:
│   ├── LeaderBaseSelector
│   ├── PoolSection → CardGrid
│   └── DeckSection → CardGrid
│
├── List View:
│   ├── SelectionListSection (Leaders/Bases)
│   └── PoolListSection (Pool/Deck/Sideboard)
│
└── Arena View (desktop only):
    ├── ArenaLeaderBaseSelector (horizontal row)
    ├── ArenaPoolSection (aspect filters + card grid)
    └── ArenaDeckSection (cost columns with stacked cards)
```

## Context Usage

Components use `DeckBuilderContext` for shared state:

```jsx
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'

function MyComponent() {
  const {
    // State
    deckSortOption,
    poolSortOption,
    leaderCard,
    baseCard,
    showAspectPenalties,
    // Actions
    setDeckSortOption,
    setPoolSortOption,
    moveCardsToDeck,
    moveCardsToPool,
  } = useDeckBuilder()
}
```

## CSS

Card-specific styles are in `Card.css` (imported by `Card.jsx`).
DeckBuilder layout and section styles are in `DeckBuilder.css`.
Arena view styles are in `ArenaView.css`.

### Key CSS Classes

- `.canvas-card` - Base card styling (in Card.css)
- `.cards-grid` - Card grid container
- `.card-block` - Section block container
- `.list-table` - Table styling for list view
- `.section-header` - Section header styling
- `.arena-view` - Arena view container
- `.arena-pool-section` - Pool section in arena view
- `.arena-deck-section` - Deck section in arena view
- `.arena-section-title` - Shared title styling for Pool/Deck
- `.arena-controls-row` - Shared spacing class for filter/action rows
- `.arena-content-area` - Shared spacing class for content below controls

## Adding New Components

1. Create component file in this folder
2. Add JSDoc comment at top describing purpose
3. Export from `index.js`
4. Use `useDeckBuilder()` hook for context access
5. Keep components under 200 lines

## Testing

Components are tested through:
- E2E tests in `e2e/` folder
- Unit tests for utilities in `src/utils/*.test.js`
- Hook tests in `src/hooks/*.test.js`

```bash
# Run E2E tests
npm run test:e2e -- --grep "Sealed Happy Path"

# Run unit tests
npm test
```
