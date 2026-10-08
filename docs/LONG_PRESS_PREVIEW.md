# Plan: Long Press Card Preview on Mobile

## Goal
On mobile (including Safari dev tools simulator), long press (~500ms) shows enlarged card preview that fits on the viewport without scrolling. Desktop hover behavior unchanged. Long press must NOT trigger the normal onClick (e.g. moving cards between pool/deck in deckbuilder).

## Status: COMPLETE

All edits implemented and build verified.

## What's Already Done (DO NOT REDO)

| File | Status |
|------|--------|
| `src/hooks/useCardPreview.ts` | DONE — exports `handleCardTouchStart`, `handleCardTouchEnd`, `dismissPreview`; has `longPressTriggeredRef`; `handleCardTouchEnd(e?)` calls `e.preventDefault()` when long press fired to block synthetic click |
| `src/components/DeckBuilder/CardPreview.tsx` | DONE — accepts `isMobile` and `onDismiss` props; when `isMobile`, renders fullscreen semi-transparent overlay with card centered and scaled to fit viewport; tap overlay calls `onDismiss` |
| `src/components/Card.tsx` | DONE — `onTouchStart`/`onTouchEnd` in `CardProps` interface; passed to div via `{...rest}` spread |
| `src/components/DeckBuilder/ResizableCard.tsx` | DONE — `onTouchStart`/`onTouchEnd` in interface AND explicitly on the div element |
| `src/components/DeckBuilder.tsx` | DONE — destructures `handleCardTouchStart`/`handleCardTouchEnd`/`dismissPreview` from hook; passes touch handlers to ArenaView, LeaderBaseSelector, StickyInfoBar; CardPreview gets `isMobile={hoveredCardPreview.isMobile}` and `onDismiss={dismissPreview}` |
| `src/components/DeckBuilder/ArenaView.tsx` | DONE — accepts `onCardTouchStart`/`onCardTouchEnd`; passes to LeaderBaseSelector, ArenaPoolSection, ArenaDeckSection |
| `src/components/DeckBuilder/ArenaPoolSection.tsx` | DONE — accepts touch props; passes `onTouchStart`/`onTouchEnd` to ResizableCard |
| `src/components/DeckBuilder/ArenaDeckSection.tsx` | DONE — accepts touch props; passes to ArenaCardStack |
| `src/components/DeckBuilder/ArenaCardStack.tsx` | DONE — accepts touch props; passes `onTouchStart`/`onTouchEnd` to ResizableCard |

## Remaining Step 1: LeaderBaseSelector.tsx — add touch to Card renders

**File:** `src/components/DeckBuilder/LeaderBaseSelector.tsx`

The component already accepts `onCardTouchStart`/`onCardTouchEnd` props and has `handleTouchStart`/`handleTouchEnd` wrapper functions. But it does NOT pass them to the `<Card>` components it renders.

**Find the two Card renders** (leaders ~line 280, bases ~line 326). They currently have `onMouseEnter` and `onMouseLeave`. Add touch handlers after them:

```
// Leaders Card (around line 280-282):
  onMouseEnter={(e) => handleMouseEnter(cardId, card, e)}
  onMouseLeave={handleMouseLeave}
+ onTouchStart={() => handleTouchStart(card)}
+ onTouchEnd={handleTouchEnd}

// Bases Card (around line 326-328):
  onMouseEnter={(e) => handleMouseEnter(cardId, card, e)}
  onMouseLeave={handleMouseLeave}
+ onTouchStart={() => handleTouchStart(card)}
+ onTouchEnd={handleTouchEnd}
```

## Remaining Step 2: pack-wars page — wire up all touch handlers

**File:** `app/formats/pack-wars/[shareId]/page.tsx`

**2a.** Add `handleCardTouchStart`, `handleCardTouchEnd`, `dismissPreview` to the useCardPreview destructure (~line 47-53):

```tsx
const {
  hoveredCardPreview,
  handleCardMouseEnter,
  handleCardMouseLeave,
  handlePreviewMouseEnter,
  handlePreviewMouseLeave,
+ handleCardTouchStart,
+ handleCardTouchEnd,
+ dismissPreview,
} = useCardPreview()
```

**2b.** Add touch handlers to leader Card renders (~line 137-138):
```
  onMouseEnter={(e) => handleCardMouseEnter(leader, e)}
  onMouseLeave={handleCardMouseLeave}
+ onTouchStart={() => handleCardTouchStart(leader)}
+ onTouchEnd={(e) => handleCardTouchEnd(e)}
```

**2c.** Add touch handlers to base Card renders (~line 151-152):
```
  onMouseEnter={(e) => handleCardMouseEnter(base, e)}
  onMouseLeave={handleCardMouseLeave}
+ onTouchStart={() => handleCardTouchStart(base)}
+ onTouchEnd={(e) => handleCardTouchEnd(e)}
```

**2d.** Add `isMobile` and `onDismiss` to CardPreview render (~line 178-184):
```tsx
<CardPreview
  card={hoveredCardPreview.card}
  x={hoveredCardPreview.x}
  y={hoveredCardPreview.y}
+ isMobile={hoveredCardPreview.isMobile}
  onMouseEnter={handlePreviewMouseEnter}
  onMouseLeave={handlePreviewMouseLeave}
+ onDismiss={dismissPreview}
/>
```

## Verification
1. `npm run build` — no build errors
2. Manual test in Safari mobile simulator: long press shows preview, tap overlay dismisses, short tap moves card normally (no double-action)
