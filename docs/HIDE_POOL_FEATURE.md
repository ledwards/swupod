# Hide/Show Pool Feature Plan

Hide pools from the main history view without deleting them.

## Overview

Users can hide sealed pools and draft pools from their history tabs. Hidden pools are moved to a collapsible "Hidden" section at the bottom of each tab. They can be unhidden at any time.

## UI Design

### Eye Icon States

```
👁️  (open eye)   = visible pool, click to hide
👁️‍🗨️ (closed eye) = hidden pool, click to unhide
```

### Icon Placement

- In the Actions column, to the LEFT of delete/X buttons
- Same size and style as existing action buttons (16x16 SVG)

### Tab Layout

```
┌─────────────────────────────────────────┐
│ Sealed                                  │
├─────────────────────────────────────────┤
│ Title     Set    Leader   Date   Actions│
│ ─────────────────────────────────────── │
│ My Pool   SEC    Vader    Jan 1   👁️ 🗑️ │
│ Pool 2    JTL    Luke     Jan 2   👁️ 🗑️ │
│                                         │
│ ▼ Hidden (2)                            │
│ ─────────────────────────────────────── │
│ Old Pool  SOR    Boba     Dec 1   👁️ 🗑️ │
│ Test      TWI    Ahsoka   Nov 1   👁️ 🗑️ │
└─────────────────────────────────────────┘
```

### Hidden Section

- Collapsed by default (shows "▶ Hidden (N)")
- Click to expand (shows "▼ Hidden (N)")
- Same table format as main section
- Hidden pools show OPEN eye icon (click to unhide)

## Database Changes

### Migration: Add `hidden` column

```sql
-- Migration: 027_add_pool_hidden.sql

ALTER TABLE card_pools
ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- For draft pods, we track hidden on the player's pool, not the pod itself
-- Since users already have a card_pools entry for their draft pool,
-- the same hidden column works for both sealed and draft
```

### No changes needed to draft_pods

Draft visibility is controlled by the user's `card_pools` entry (via `pool_share_id`). When a user hides their draft pool, it hides just for them.

## API Changes

### Update pool endpoint

`PATCH /api/pools/:shareId`

Already exists for renaming. Add support for `hidden` field:

```javascript
// Request body
{ hidden: true }  // or false to unhide

// Response
{ success: true, pool: { ...updatedPool } }
```

### Fetch pools endpoint

`GET /api/users/:userId/pools`

Already returns pools. Add `hidden` field to response. No filtering needed - client handles display logic.

## Frontend Changes

### 1. State Management (app/history/page.js)

```javascript
// Add state for hidden section expansion
const [showHiddenSealed, setShowHiddenSealed] = useState(false)
const [showHiddenDraft, setShowHiddenDraft] = useState(false)

// Split pools into visible and hidden
const visibleSealedPools = sealedPools.filter(p => !p.hidden)
const hiddenSealedPools = sealedPools.filter(p => p.hidden)

const visibleDraftPods = draftPods.filter(p => !p.hidden)
const hiddenDraftPods = draftPods.filter(p => p.hidden)
```

### 2. Toggle Handler

```javascript
const handleToggleHidden = async (shareId, currentlyHidden, type) => {
  try {
    await updatePool(shareId, { hidden: !currentlyHidden })

    if (type === 'sealed') {
      setSealedPools(pools =>
        pools.map(p => p.shareId === shareId ? { ...p, hidden: !currentlyHidden } : p)
      )
    } else {
      setDraftPods(pods =>
        pods.map(p => p.poolShareId === shareId ? { ...p, hidden: !currentlyHidden } : p)
      )
    }
  } catch (err) {
    console.error('Failed to toggle hidden:', err)
  }
}
```

### 3. Eye Icon Component

```jsx
// Visible eye icon (pool is shown, click to hide)
const EyeOpenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
)

// Closed eye icon (pool is hidden, click to show)
const EyeClosedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
)
```

### 4. Actions Cell Update

```jsx
<td className="history-actions-cell">
  {/* Hide/Show button - always to the left */}
  <button
    className="history-hide-button"
    onClick={() => handleToggleHidden(pool.shareId, pool.hidden, 'sealed')}
    title={pool.hidden ? "Show" : "Hide"}
  >
    {pool.hidden ? <EyeClosedIcon /> : <EyeOpenIcon />}
  </button>

  {/* Existing buttons */}
  <button className="history-view-button" ...>View</button>
  <button className="history-delete-button" ...>🗑️</button>
</td>
```

### 5. Hidden Section Component

```jsx
{/* Hidden pools section */}
{hiddenSealedPools.length > 0 && (
  <div className="hidden-pools-section">
    <button
      className="hidden-pools-toggle"
      onClick={() => setShowHiddenSealed(!showHiddenSealed)}
    >
      <span className="toggle-arrow">{showHiddenSealed ? '▼' : '▶'}</span>
      Hidden ({hiddenSealedPools.length})
    </button>

    {showHiddenSealed && (
      <table className="history-table hidden-pools-table">
        {/* Same table structure, but for hidden pools */}
        {/* Eye icon shows OPEN (unhide) state */}
      </table>
    )}
  </div>
)}
```

### 6. CSS Updates (History.css)

```css
/* Hide button styling */
.history-hide-button {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.history-hide-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

/* Hidden section */
.hidden-pools-section {
  margin-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 16px;
}

.hidden-pools-toggle {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.hidden-pools-toggle:hover {
  color: white;
}

.toggle-arrow {
  font-size: 10px;
}

.hidden-pools-table {
  opacity: 0.7;
}

.hidden-pools-table tr:hover {
  opacity: 1;
}
```

## Implementation Steps

### Phase 1: Database

1. [ ] Create migration `027_add_pool_hidden.sql`
2. [ ] Run migration locally
3. [ ] Verify column exists with `DEFAULT FALSE`

### Phase 2: API

4. [ ] Update `PATCH /api/pools/:shareId` to accept `hidden` field
5. [ ] Verify `GET /api/users/:userId/pools` returns `hidden` field
6. [ ] Update `GET /api/draft/history` to include `hidden` from associated pool

### Phase 3: Frontend - Sealed Tab

7. [ ] Add state for `showHiddenSealed`
8. [ ] Split `sealedPools` into visible/hidden arrays
9. [ ] Add eye icon button to sealed pool rows
10. [ ] Add hidden section with toggle
11. [ ] Implement `handleToggleHidden` for sealed
12. [ ] Add CSS styles

### Phase 4: Frontend - Draft Tab

13. [ ] Add state for `showHiddenDraft`
14. [ ] Split `draftPods` into visible/hidden arrays
15. [ ] Add eye icon button to draft rows (completed drafts only)
16. [ ] Add hidden section with toggle
17. [ ] Connect to pool's hidden status via `poolShareId`

### Phase 5: Testing

18. [ ] Test hide/unhide sealed pool
19. [ ] Test hide/unhide draft pool
20. [ ] Test hidden section collapse/expand
21. [ ] Test persistence after page reload
22. [ ] Test new pools default to visible

## Edge Cases

### Active Drafts
- Active drafts (waiting/leader_draft/pack_draft) should NOT show hide button
- Only completed drafts can be hidden
- Reason: Hiding an active draft would be confusing

### No Pool Share ID
- Some old drafts might not have `poolShareId`
- These cannot be hidden (no pool to set hidden on)
- Hide button should not appear for these

### Anonymous Pools
- Pools with `user_id = NULL` cannot be hidden
- But these shouldn't appear in history anyway

## Future Enhancements (Out of Scope)

- Bulk hide/unhide
- "Hide all older than X days"
- Archive vs Hide (permanent vs temporary)
- Hidden count in tab badge

---

*Plan created: 2026-02-03*
