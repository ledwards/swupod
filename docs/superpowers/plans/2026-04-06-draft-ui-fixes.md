# Draft UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 UI issues in the draft experience: timer layout shift, selection banner position, fullscreen toggle, modal timer centering, Wayfinder on pod page, Draft Log button placement, and dynamic card pool detection.

**Architecture:** All changes are CSS/layout fixes and minor React state additions. No new components or services. One import change in PlayInstructions to use dynamic set detection.

**Tech Stack:** React (Next.js), CSS, TypeScript

---

### Task 1: Fix timer layout shift — reserve space when hidden

**Files:**
- Modify: `src/components/TimerPanel.tsx:129-131`
- Modify: `src/components/TimerPanel.css` (add new class)

- [ ] **Step 1: Change TimerPanel to render a placeholder instead of null**

In `src/components/TimerPanel.tsx`, replace the early return on line 130:

```tsx
  // If neither timer should be shown, return null (hides entire container)
  if (!isDrafting || (!showRoundTimer && !showLastPlayerTimer)) return null
```

with a placeholder that reserves the same height:

```tsx
  // If neither timer should be shown, render invisible placeholder to prevent layout shift
  if (!isDrafting || (!showRoundTimer && !showLastPlayerTimer)) {
    if (compact) return null
    return <div className="timer-bar-placeholder" aria-hidden="true" />
  }
```

- [ ] **Step 2: Add placeholder CSS**

In `src/components/TimerPanel.css`, add at the end (before the mobile media query at line 172):

```css
/* Invisible placeholder to prevent layout shift when timer is hidden */
.timer-bar-placeholder {
  height: 55px; /* matches .timer-panel padding (15px*2) + content (~25px) */
  margin-bottom: 20px; /* matches .timer-panel margin-bottom */
}
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Open a draft without timers enabled. Verify the cards section does not jump when a timer would appear/disappear. The space should be reserved.

- [ ] **Step 4: Commit**

```bash
git add src/components/TimerPanel.tsx src/components/TimerPanel.css
git commit -m "fix: reserve timer space to prevent layout shift during draft"
```

---

### Task 2: Move selection banner below cards

**Files:**
- Modify: `src/components/PackDraftPhase.tsx:403-441,483`

- [ ] **Step 1: Cut the selection confirmation banner block**

In `src/components/PackDraftPhase.tsx`, remove the entire selection confirmation banner block (lines 403-441) — from the comment `{/* Selection confirmation banner...` through the closing `})()}`.

- [ ] **Step 2: Paste it after the `.current-pack` div**

Insert the same block immediately after the closing `</div>` of `.current-pack` (after current line 483), so it renders below the card grid:

```tsx
          </div>

          {/* Selection confirmation banner - below cards */}
          {selectedCardId && !showPassing && (() => {
            const selectedCard = currentPack.find(c => (c.instanceId || c.id) === selectedCardId)
            if (!selectedCard || !selectedCard.name) return null
            const firstAspect = selectedCard.aspects?.[0]
            const aspectColor = firstAspect ? getSingleAspectColor(firstAspect) : NO_ASPECT_COLOR
            return (
              <div
                className="selection-confirmation-banner"
                style={{
                  background: `linear-gradient(135deg, ${aspectColor}33 0%, ${aspectColor}22 100%)`,
                  borderColor: aspectColor,
                }}
              >
                <div className="selection-info">
                  <span className="selection-label">Selected:</span>
                  <span className="selection-card-name" style={{ color: aspectColor }}>
                    {selectedCard.name || selectedCard.title || 'Card'}
                  </span>
                  {selectedCard.subtitle && (
                    <span className="selection-card-subtitle">{selectedCard.subtitle}</span>
                  )}
                </div>
                {hasSelected ? (
                  // Only show "Waiting" if there are players who aren't done yet
                  players?.some(p => p.pickStatus !== 'picked' && p.pickStatus !== 'selected') ? (
                    <div className="selection-status-text">Waiting for other players...</div>
                  ) : null
                ) : (
                  <button className="deselect-button" onClick={(e) => handleDeselect(e)} title="Deselect">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            )
          })()}


        </div>
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Open a draft, select a card. The selection confirmation banner should now appear below the card grid.

- [ ] **Step 4: Commit**

```bash
git add src/components/PackDraftPhase.tsx
git commit -m "fix: move selection confirmation banner below card grid"
```

---

### Task 3: Add fullscreen toggle for draft pick window

**Files:**
- Modify: `src/components/PackDraftPhase.tsx:104,354,396`
- Modify: `src/components/PackDraftPhase.css`

- [ ] **Step 1: Add fullscreen state**

In `src/components/PackDraftPhase.tsx`, after line 104 (`const [showReviewModal, setShowReviewModal] = useState(false)`), add:

```tsx
  const [isFullscreen, setIsFullscreen] = useState(false)
```

- [ ] **Step 2: Add Escape key handler for fullscreen**

After the new state declaration, add:

```tsx
  // Exit fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])
```

- [ ] **Step 3: Add fullscreen class to cards-section**

In `src/components/PackDraftPhase.tsx`, change the `<div className="cards-section">` (line 354) to:

```tsx
        <div className={`cards-section${isFullscreen ? ' cards-section-fullscreen' : ''}`}>
```

- [ ] **Step 4: Add the fullscreen toggle button**

In the `draft-progress-info` div (around line 396), after the "Your Cards" button, add:

```tsx
              <Button variant="icon" size="sm" className="fullscreen-toggle-button" onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullscreen ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20"></polyline>
                    <polyline points="20 10 14 10 14 4"></polyline>
                    <line x1="14" y1="10" x2="21" y2="3"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <polyline points="9 21 3 21 3 15"></polyline>
                    <line x1="21" y1="3" x2="14" y2="10"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                  </svg>
                )}
              </Button>
```

- [ ] **Step 5: Add fullscreen CSS**

In `src/components/PackDraftPhase.css`, add after the `.cards-section` block (after line 219):

```css
.cards-section-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: #1a1a1a;
  overflow-y: auto;
  padding: 20px;
  border-radius: 0;
  border: none;
  min-width: unset;
  max-width: unset;
}
```

- [ ] **Step 6: Verify visually**

Run: `npm run dev`

Open a draft. Click the fullscreen button — the cards section should cover the whole screen. Click again or press Escape to return to normal.

- [ ] **Step 7: Commit**

```bash
git add src/components/PackDraftPhase.tsx src/components/PackDraftPhase.css
git commit -m "feat: add fullscreen toggle for draft pick window"
```

---

### Task 4: Center timer in review modal

**Files:**
- Modify: `src/components/DraftReviewModal.css:75-80`

- [ ] **Step 1: Fix the CSS**

In `src/components/DraftReviewModal.css`, change `.review-controls-center` (lines 75-80):

```css
.review-controls-center {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  gap: 15px;
```

to:

```css
.review-controls-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 15px;
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`

Open a draft with timers, click "Your Cards" to open the review modal. The timer should be centered at the top, not clipped to the right.

- [ ] **Step 3: Commit**

```bash
git add src/components/DraftReviewModal.css
git commit -m "fix: center timer in draft review modal"
```

---

### Task 5: Pass setCode and wayfinderDetected to PlayInstructions on pod page

**Files:**
- Modify: `app/draft/[shareId]/pod/page.tsx:49-60,729-735,839-846`

- [ ] **Step 1: Add Wayfinder detection state and effect**

In `app/draft/[shareId]/pod/page.tsx`, after the existing state declarations (after `const [practiceHand, setPracticeHand] = useState(...)` block around line 60), add:

```tsx
  // Detect Wayfinder extension via DOM marker
  const [wayfinderDetected, setWayfinderDetected] = useState(false)
  useEffect(() => {
    if (document.querySelector('meta[name="wayfinder-installed"]')) {
      setWayfinderDetected(true)
      return
    }
    const onInstalled = () => setWayfinderDetected(true)
    document.addEventListener('wayfinder:installed', onInstalled)
    const timer = setTimeout(() => {
      if (document.querySelector('meta[name="wayfinder-installed"]')) setWayfinderDetected(true)
    }, 1000)
    return () => {
      document.removeEventListener('wayfinder:installed', onInstalled)
      clearTimeout(timer)
    }
  }, [])
```

- [ ] **Step 2: Update solo PlayInstructions call**

In the solo PlayInstructions call (around line 729), add `setCode` and `wayfinderDetected` props:

```tsx
            <PlayInstructions
              shareId={myPoolShareId}
              poolType="sealed"
              setCode={draft?.setCode || myPool?.setCode}
              hasBye={false}
              isSoloDraft={true}
              onCopyLink={copyDeckUrl}
              showActions={false}
              wayfinderDetected={wayfinderDetected}
            />
```

- [ ] **Step 3: Update non-solo PlayInstructions call**

In the non-solo PlayInstructions call (around line 839), add `setCode` and `wayfinderDetected` props:

```tsx
        {!isSolo && <PlayInstructions
          shareId={myPoolShareId}
          poolType="draft"
          setCode={draft?.setCode || myPool?.setCode}
          opponentName={myOpponent?.username}
          hasBye={myBye}
          onCopyLink={copyDeckUrl}
          showActions={false}
          wayfinderDetected={wayfinderDetected}
        />}
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev`

Navigate to a pod page. If the Wayfinder extension is installed, the Wayfinder tab should now appear in the play instructions. The card pool should show "Current" or "Unlimited" correctly.

- [ ] **Step 5: Commit**

```bash
git add app/draft/[shareId]/pod/page.tsx
git commit -m "feat: pass setCode and wayfinderDetected to PlayInstructions on pod page"
```

---

### Task 6: Move Draft Log button next to Practice Hand

**Files:**
- Modify: `app/draft/[shareId]/pod/page.tsx:715-724,885-897`
- Modify: `app/pool/[shareId]/deck/play/page.tsx:1678-1702,1751-1765`

- [ ] **Step 1: Move Draft Log into Practice Hand container on pod page**

In `app/draft/[shareId]/pod/page.tsx`, replace the Practice Hand container (lines 715-724):

```tsx
        <div className="practice-hand-button-container">
          <button className="pod-action-button" onClick={() => drawPracticeHand()} disabled={!myPoolShareId || !myPool}>
            <svg width="32" height="32" viewBox="0 -2 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <g transform="rotate(-15 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(0 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(15 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
            </svg>
            Practice Hand
          </button>
        </div>
```

with:

```tsx
        <div className="practice-hand-button-container">
          <button className="pod-action-button" onClick={() => drawPracticeHand()} disabled={!myPoolShareId || !myPool}>
            <svg width="32" height="32" viewBox="0 -2 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <g transform="rotate(-15 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(0 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(15 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
            </svg>
            Practice Hand
          </button>
          <button className="pod-action-button" onClick={() => router.push(`/draft/${shareId}/log`)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Draft Log
          </button>
        </div>
```

- [ ] **Step 2: Remove the old Draft Log container from pod page**

Delete the bottom Draft Log container (lines 885-897):

```tsx
        {/* Draft log link at bottom */}
        <div className="practice-hand-button-container" style={{ marginTop: '1rem' }}>
          <button className="pod-action-button" onClick={() => router.push(`/draft/${shareId}/log`)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Draft Log
          </button>
        </div>
```

- [ ] **Step 3: Move Draft Log into Practice Hand container on play page**

In `app/pool/[shareId]/deck/play/page.tsx`, find the Practice Hand container (around line 1678). After the closing `</div>` of the `post-to-discord-wrapper` conditional (before the `</div>` that closes `.practice-hand-button-container`), add the Draft Log button:

```tsx
          {pool?.draftShareId && pool?.poolType === 'draft' && (
            <button className="play-action-button" onClick={() => router.push(`/draft/${pool.draftShareId}/log`)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Draft Log
            </button>
          )}
```

- [ ] **Step 4: Remove the old Draft Log container from play page**

Delete the bottom Draft Log container (around lines 1751-1765):

```tsx
        {/* Draft log link at bottom (for draft pools) */}
        {pool?.draftShareId && pool?.poolType === 'draft' && (
          <div className="practice-hand-button-container" style={{ marginTop: '1rem' }}>
            <button className="play-action-button" onClick={() => router.push(`/draft/${pool.draftShareId}/log`)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Draft Log
            </button>
          </div>
        )}
```

- [ ] **Step 5: Verify visually**

Run: `npm run dev`

Check both the pod page and the play page. Draft Log should now appear next to Practice Hand at the top, not at the bottom.

- [ ] **Step 6: Commit**

```bash
git add app/draft/[shareId]/pod/page.tsx app/pool/[shareId]/deck/play/page.tsx
git commit -m "fix: move Draft Log button next to Practice Hand at top of page"
```

---

### Task 7: Use dynamic set detection for card pool name

**Files:**
- Modify: `src/components/PlayInstructions.tsx:4,52`

- [ ] **Step 1: Add import**

In `src/components/PlayInstructions.tsx`, after the existing imports (line 4), add:

```tsx
import { getLatestReleasedSetCode } from '../utils/setConfigs/latest'
```

- [ ] **Step 2: Replace hardcoded set check**

Replace line 52:

```tsx
  const isCurrentSet = setCode === 'LAW'
```

with:

```tsx
  const isCurrentSet = setCode === getLatestReleasedSetCode()
```

- [ ] **Step 3: Run the existing test**

Run: `npm run build`

Verify no build errors. The function is already tested in `app/api/plugin/v1/play/[format]/[shareId]/route.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/components/PlayInstructions.tsx
git commit -m "fix: use dynamic set detection for card pool name instead of hardcoded LAW"
```

---

### Task 8: Build and final verification

- [ ] **Step 1: Run the build**

Run: `npm run build`

Verify no errors.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Fix any lint errors introduced by the changes.

- [ ] **Step 3: Run tests**

Run: `npm run test`

All tests should pass.

- [ ] **Step 4: Final commit (if any lint fixes)**

```bash
git add -A
git commit -m "fix: lint fixes for draft UI changes"
```
