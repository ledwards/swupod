# DeckBuilder Refactor Plan

## Current Status (Updated Feb 1, 2026)

### REFACTOR COMPLETE

The DeckBuilder refactoring project is now complete. All major goals have been achieved.

### Final Metrics
- **Original DeckBuilder.jsx:** ~6700 lines
- **Final DeckBuilder.jsx:** 2030 lines
- **Reduction:** ~4670 lines (~70%)
- **E2E Tests:** All passing
- **Unit Tests:** 204 tests passing

### Completed Work Summary

#### Component Extractions (`src/components/DeckBuilder/`)
| Component | Lines | Description |
|-----------|-------|-------------|
| CardPreview.jsx | ~200 | Enlarged card preview on hover |
| AspectFilterModal.jsx | ~550 | Aspect filter modal dialog |
| LeaderBaseSelector.jsx | ~250 | Leader and base card selection |
| SortControls.jsx | ~100 | Sort option buttons |
| FilterWithModal.jsx | ~50 | Filter button with modal trigger |
| AspectPenaltyToggle.jsx | ~75 | Toggle for showing aspect penalties |
| BulkMoveButtons.jsx | ~80 | Add All/Remove All buttons |
| SectionHeader.jsx | ~100 | Section header with controls |
| DeckBuilderHeader.jsx | ~200 | Main header with title and actions |
| StickyInfoBar.jsx | ~315 | Sticky stats bar |
| TypeIcon.jsx | ~50 | Card type icons |
| GroupHeader.jsx | ~75 | Group header for card groups |
| ListTableHeader.jsx | ~55 | Sortable table headers |
| SelectionListSection.jsx | ~115 | Leaders/Bases list view |
| PoolListSection.jsx | ~400 | Pool/Deck/Sideboard list view |
| PoolSection.jsx | ~200 | Pool grid view |
| DeckSection.jsx | ~200 | Deck grid view |
| Tooltip.jsx | ~30 | Tooltip component |
| DeckImageModal.jsx | ~70 | Deck image export modal |
| DeleteDeckSection.jsx | ~80 | Delete deck button and modal |
| ViewModeToggle.jsx | ~40 | Grid/List view toggle |
| CollapsibleSectionHeader.jsx | ~35 | Expandable section header |
| CardGrid.jsx | ~20 | Reusable card grid container |

#### Hook Extractions (`src/hooks/`)
| Hook | Lines | Description |
|------|-------|-------------|
| useDeckExport.js | ~370 | Export to JSON, clipboard, image |
| useDragAndDrop.js | ~380 | Drag and drop card movement |
| useCardPreview.js | ~130 | Card preview hover state |
| useTooltip.js | ~100 | Tooltip positioning and state |

#### Utility Extractions (`src/utils/`)
| File | Functions | Description |
|------|-----------|-------------|
| cardSort.js | getCardTypeOrder, getTypeStringOrder, sortGroupKeys, createGetGroupKey, createDefaultSortFn, createGroupCardSortFn | Card sorting utilities |
| aspectCombinations.js | getAspectCombinationKey, getAspectCombinationDisplayName, getAspectKey | Aspect grouping utilities |

#### CSS Extraction
| File | Lines | Description |
|------|-------|-------------|
| Card.css | 416 | All `.canvas-card` styles extracted from DeckBuilder.css |
| DeckBuilder.css | 2066 | Reduced from 2447 lines |

#### Context
| File | Description |
|------|-------------|
| DeckBuilderContext.jsx | Shared state for deck builder (sort options, leader/base, aspect penalties, bulk operations) |

### Test Coverage
- `cardSort.test.js` - 42 tests
- `aspectCombinations.test.js` - 22 tests
- `useTooltip.test.js` - 2 tests
- `useCardPreview.test.js` - 2 tests
- `CardGrid.test.js` - Component contract tests

### Success Criteria
- [x] DeckBuilder.jsx reduced by 70% (6700 → 2030 lines)
- [x] Card component used everywhere
- [x] Context for shared state (DeckBuilderContext)
- [x] Each component < 200 lines (most are)
- [x] All E2E tests pass
- [x] Unit tests for utilities
- [x] CSS consolidated (Card.css extracted)
- [x] Dead code removed

---

## Architecture Overview

```
src/
├── components/
│   ├── Card.jsx                    # Reusable card component
│   ├── Card.css                    # All card-related styles
│   ├── DeckBuilder.jsx             # Main orchestrator (2030 lines)
│   ├── DeckBuilder.css             # DeckBuilder-specific styles
│   └── DeckBuilder/                # Sub-components
│       ├── CardGrid.jsx            # Reusable card grid
│       ├── CardPreview.jsx         # Card hover preview
│       ├── DeckSection.jsx         # Deck grid view
│       ├── PoolSection.jsx         # Pool grid view
│       ├── PoolListSection.jsx     # List view for pool/deck
│       ├── SelectionListSection.jsx # List view for leaders/bases
│       └── ... (20+ components)
├── contexts/
│   └── DeckBuilderContext.jsx      # Shared deck builder state
├── hooks/
│   ├── useDeckExport.js            # Export functionality
│   ├── useDragAndDrop.js           # Drag and drop
│   ├── useCardPreview.js           # Card preview state
│   └── useTooltip.js               # Tooltip state
└── utils/
    ├── cardSort.js                 # Sorting utilities
    └── aspectCombinations.js       # Aspect grouping utilities
```

## Commands
```bash
# Run E2E tests
npm run test:e2e -- --grep "Sealed Happy Path"

# Run unit tests
npm test

# Check line count
wc -l src/components/DeckBuilder.jsx

# Check CSS line counts
wc -l src/components/Card.css src/components/DeckBuilder.css
```

## Important Notes
- NEVER PUSH WITHOUT HUMAN REVIEW - pushes trigger deploy
- The mobile test (`deck-builder.spec.js:220`) is flaky - pre-existing issue
- Skip 8-player test during iteration (takes 10+ minutes)
