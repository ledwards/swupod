# React Hooks

Custom React hooks for the Protect the Pod application.

## DeckBuilder Hooks

These hooks were extracted from DeckBuilder.jsx to separate concerns and improve testability.

### useDeckExport

Export functionality for decks (JSON, clipboard, image).

```jsx
import { useDeckExport } from '../hooks/useDeckExport'

function MyComponent() {
  const {
    exportToJson,           // Download deck as JSON file
    copyDeckToClipboard,    // Copy deck list to clipboard
    copyJsonToClipboard,    // Copy JSON to clipboard
    exportDeckImage,        // Generate deck image
    showDeckImageModal,     // Show/hide image modal
    setShowDeckImageModal,
    deckImageUrl,           // Generated image URL
    isExporting,            // Loading state
    copyStatus,             // 'idle' | 'success' | 'error'
  } = useDeckExport({
    cardPositions,          // Card position state
    leaderCard,             // Selected leader
    baseCard,               // Selected base
    poolName,               // Deck name
    shareId,                // Share URL ID
  })
}
```

**Location:** `src/hooks/useDeckExport.js` (~370 lines)

### useDragAndDrop

Handles drag and drop card movement between sections.

```jsx
import { useDragAndDrop } from '../hooks/useDragAndDrop'

function MyComponent() {
  const {
    isDragging,             // Currently dragging?
    draggedCardId,          // ID of dragged card
    dragOffset,             // Mouse offset for smooth drag
    handleDragStart,        // Start drag handler
    handleDragEnd,          // End drag handler
    handleDrop,             // Drop handler
  } = useDragAndDrop({
    cardPositions,
    setCardPositions,
    canvasRef,              // Canvas element ref
  })
}
```

**Location:** `src/hooks/useDragAndDrop.js` (~380 lines)

### useCardPreview

Manages card preview hover state with delayed show/hide.

```jsx
import { useCardPreview } from '../hooks/useCardPreview'

function MyComponent() {
  const {
    previewCard,            // Card to preview
    previewPosition,        // { x, y } position
    showPreview,            // Show preview?
    handleCardHover,        // Mouse enter handler
    handleCardLeave,        // Mouse leave handler
  } = useCardPreview({
    hoverDelay: 300,        // Delay before showing (ms)
    hideDelay: 100,         // Delay before hiding (ms)
  })
}
```

**Location:** `src/hooks/useCardPreview.js` (~130 lines)
**Tests:** `src/hooks/useCardPreview.test.js`

### useTooltip

Manages tooltip positioning and visibility.

```jsx
import { useTooltip } from '../hooks/useTooltip'

function MyComponent() {
  const {
    tooltip,                // { show, text, x, y }
    showTooltip,            // Show tooltip with text at position
    hideTooltip,            // Hide tooltip
  } = useTooltip()

  // Usage
  showTooltip('Card name', event.clientX, event.clientY)
}
```

**Location:** `src/hooks/useTooltip.js` (~100 lines)
**Tests:** `src/hooks/useTooltip.test.js`

## Draft Hooks

### useDraftSocket

WebSocket connection for real-time draft synchronization.

```jsx
import { useDraftSocket } from '../hooks/useDraftSocket'

function DraftRoom() {
  const { socket, isConnected, error } = useDraftSocket(draftId, userId)
}
```

**Location:** `src/hooks/useDraftSocket.js`

### useDraftSync

Syncs draft state with server via WebSocket.

```jsx
import { useDraftSync } from '../hooks/useDraftSync'

function DraftRoom() {
  const { draftState, pickCard, passPack } = useDraftSync(socket, draftId)
}
```

**Location:** `src/hooks/useDraftSync.js`

## Common Hooks

Located in `src/hooks/common/`:

| Hook | Description |
|------|-------------|
| `useLocalStorage.js` | Persist state to localStorage |
| `useDebounce.js` | Debounce rapidly changing values |
| `useClickOutside.js` | Detect clicks outside element |
| `useKeyPress.js` | Listen for keyboard shortcuts |
| `useWindowSize.js` | Track window dimensions |

## Testing Hooks

Hooks are tested using Node.js built-in test runner:

```bash
# Run all hook tests
npm run test:hooks

# Run specific test file
node src/hooks/useTooltip.test.js
```

Note: Since hooks require React, tests document the hook contract rather than running actual React code. Full integration is tested via E2E tests.

## Creating New Hooks

1. Create file in `src/hooks/` with `use` prefix
2. Add JSDoc comment describing purpose and usage
3. Export hook function
4. Create `.test.js` file with contract tests
5. Add to this README

### Hook Template

```jsx
/**
 * useMyHook - Description of what this hook does
 *
 * @param {Object} options - Hook options
 * @param {string} options.foo - Description
 * @returns {Object} Hook return value
 */
export function useMyHook({ foo }) {
  const [state, setState] = useState(null)

  const action = useCallback(() => {
    // Implementation
  }, [])

  return {
    state,
    action,
  }
}
```
