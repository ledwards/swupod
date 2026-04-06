# Draft UI Fixes — Design Spec

7 UI issues affecting the draft experience. All are layout/behavior fixes, no new features.

---

## 1. Timer Layout Shift

**Problem:** `TimerPanel` returns `null` when no timer is active (TimerPanel.tsx:130), collapsing the space and shifting everything below it up/down as timers appear/disappear.

**Fix:** Instead of returning `null`, render an invisible placeholder `div` with the same height as the timer bar. The timer area always occupies space, even when hidden.

**Files:** `src/components/TimerPanel.tsx`, `src/components/TimerPanel.css`

**Approach:** When no timer should be shown, render a `div.timer-bar-placeholder` with `visibility: hidden` and `min-height` matching the timer bar height. This reserves space without showing content.

---

## 2. Selection Banner Below Cards

**Problem:** The selection confirmation banner (PackDraftPhase.tsx:403-441) renders above the card grid, between the draft info header and the cards.

**Fix:** Move the selection confirmation banner JSX to render after the `.current-pack` div (line 483), so it appears below the card grid.

**Files:** `src/components/PackDraftPhase.tsx`

---

## 3. Maximize Draft Pick Window

**Problem:** No way to expand the draft pick area to full screen during card selection.

**Fix:** Add a fullscreen toggle button to the `.cards-section`. When toggled:
- `.cards-section` gets a `fullscreen` class that applies `position: fixed; inset: 0; z-index: 9998; background: #1a1a1a; overflow-y: auto; padding: 20px`
- The button icon toggles between expand and collapse icons
- Place the button in the draft info header area, near the "Your Cards" button

**Files:** `src/components/PackDraftPhase.tsx`, `src/components/PackDraftPhase.css`

**State:** Single boolean `isFullscreen` in PackDraftPhase. Toggle on click. Escape key also exits fullscreen.

---

## 4. Timer in Review Modal — Centering

**Problem:** `.review-controls-center` has `justify-content: flex-end` (DraftReviewModal.css:78), pushing the timer to the right and clipping it.

**Fix:** Change `justify-content: flex-end` to `justify-content: center` in `.review-controls-center`. This centers the timer in the available space between the left controls and the close button.

**Files:** `src/components/DraftReviewModal.css`

---

## 5. Deck Complete for Plugin Users on Pod Page

**Problem:** The pod page (`app/draft/[shareId]/pod/page.tsx`) renders `PlayInstructions` without passing `setCode` or `wayfinderDetected`, so plugin users don't get the Wayfinder tab on the pod page.

**Fix:** 
- Pass `setCode={draft.setCode || myPool?.setCode}` and `wayfinderDetected={wayfinderDetected}` to both PlayInstructions calls on the pod page (solo at line 729, non-solo at line 839)
- The pod page needs to detect the Wayfinder extension (add the same `wayfinderDetected` state and detection logic used on the play page)

**Files:** `app/draft/[shareId]/pod/page.tsx`

---

## 6. Draft Log Button Next to Practice Hand

**Problem:** Draft Log button is at the bottom of the page, far from Practice Hand at the top.

**Fix:** Move the Draft Log button into the same `.practice-hand-button-container` as Practice Hand, on both pages where it appears:

1. **Pod page** (`app/draft/[shareId]/pod/page.tsx`): Move Draft Log button from line 886-897 into the container at line 715-724
2. **Play page** (`app/pool/[shareId]/deck/play/page.tsx`): Move Draft Log button from line 1752-1765 into the container at line 1678-1702

Remove the now-empty bottom containers after moving the buttons.

**Files:** `app/draft/[shareId]/pod/page.tsx`, `app/pool/[shareId]/deck/play/page.tsx`

---

## 7. Card Pool Name — Dynamic Latest Set

**Problem:** `PlayInstructions.tsx:52` hardcodes `const isCurrentSet = setCode === 'LAW'`. When a new set releases, this will be wrong.

**Fix:** Import `getLatestReleasedSetCode` from `src/utils/setConfigs/latest` and use it:
```ts
const isCurrentSet = setCode === getLatestReleasedSetCode()
```

This matches the pattern already used in `app/api/plugin/v1/play/[format]/[shareId]/route.ts:51`.

**Files:** `src/components/PlayInstructions.tsx`
