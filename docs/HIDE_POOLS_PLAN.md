# Hide/Show Pools Feature Plan

## Overview
Add ability to hide sealed and draft pools from the history page. Hidden pools appear in a collapsible "Hidden" section at the bottom of each tab.

## Database Changes

### Migration: `migrations/025_add_hidden_column.sql`
```sql
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false;
```

Note: Draft pools don't need a `hidden` column because the history page shows the user's **card_pool** for completed drafts (via `pool_share_id`). Active drafts without pools can't be hidden (they don't have a pool yet).

## API Changes

### `app/api/pools/[shareId]/route.js` (PUT handler)
Add `hidden` to the list of accepted update fields:
- Add to destructuring: `const { cards, packs, deckBuilderState, poolName, isPublic, setCode, name, hidden } = body`
- Add update logic: `if (typeof hidden === 'boolean') { updates.push('hidden = $' + (params.length + 1)); params.push(hidden) }`

### `app/api/pools/route.js` (GET handler - fetch user pools)
Add `hidden` to the SELECT fields so frontend receives it.

### `app/api/draft/history/route.js`
Add `cp.hidden` to the SELECT query and include in formatted response.

## Frontend Changes

### `src/utils/poolApi.js`
Add new function:
```javascript
export async function togglePoolHidden(shareId, hidden) {
  return updatePool(shareId, { hidden })
}
```

### `app/history/page.js`

#### State additions
```javascript
const [showHiddenSealed, setShowHiddenSealed] = useState(false)
const [showHiddenDraft, setShowHiddenDraft] = useState(false)
```

#### Filter pools into visible/hidden
```javascript
const visibleSealedPools = sealedPools.filter(p => !p.hidden)
const hiddenSealedPools = sealedPools.filter(p => p.hidden)
const visibleDraftPods = draftPods.filter(p => !p.hidden)
const hiddenDraftPods = draftPods.filter(p => p.hidden)
```

#### Toggle handler
```javascript
const handleToggleHidden = async (shareId, currentHidden, type) => {
  try {
    await updatePool(shareId, { hidden: !currentHidden })
    if (type === 'sealed') {
      setSealedPools(pools => pools.map(p =>
        p.shareId === shareId ? { ...p, hidden: !currentHidden } : p
      ))
    } else {
      setDraftPods(pods => pods.map(p =>
        p.poolShareId === shareId ? { ...p, hidden: !currentHidden } : p
      ))
    }
  } catch (err) {
    console.error('Failed to toggle hidden:', err)
  }
}
```

#### Eye icon buttons (in Actions column, LEFT of delete/X button)
```jsx
{/* Closed eye = hide (for visible pools) */}
<button
  className="history-hide-button"
  onClick={() => handleToggleHidden(pool.shareId, pool.hidden, 'sealed')}
  title="Hide"
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
</button>

{/* Open eye = unhide (for hidden pools) */}
<button
  className="history-unhide-button"
  onClick={() => handleToggleHidden(pool.shareId, pool.hidden, 'sealed')}
  title="Show"
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
</button>
```

#### Hidden section (at bottom of each tab)
```jsx
{hiddenSealedPools.length > 0 && (
  <div className="hidden-pools-section">
    <button
      className="hidden-pools-toggle"
      onClick={() => setShowHiddenSealed(!showHiddenSealed)}
    >
      <svg ...chevron icon rotated based on expanded state />
      Hidden ({hiddenSealedPools.length})
    </button>
    {showHiddenSealed && (
      <table className="history-table hidden-pools-table">
        {/* Same structure as main table, but with open eye icon */}
      </table>
    )}
  </div>
)}
```

### `app/history/History.css`
Add styles for:
- `.history-hide-button` - Same pattern as delete button but with neutral/gray color
- `.history-unhide-button` - Same pattern but maybe slightly different hover
- `.hidden-pools-section` - Container with top margin/border
- `.hidden-pools-toggle` - Collapsible header button
- `.hidden-pools-table` - Slightly muted appearance (lower opacity)

## Files to Modify

1. `migrations/025_add_hidden_column.sql` (new)
2. `app/api/pools/[shareId]/route.js` - Add hidden to PUT
3. `app/api/pools/route.js` - Add hidden to SELECT
4. `app/api/draft/history/route.js` - Add cp.hidden to SELECT
5. `app/history/page.js` - UI logic and rendering
6. `app/history/History.css` - Styles for hide buttons and hidden section

## Edge Cases

- **Active drafts**: No hide button (they don't have a pool yet)
- **Completed drafts without pool**: No hide button (poolShareId is null)
- **Draft pools**: Use `poolShareId` for the API call, not `shareId`

---

## Additional Fixes (while we're in here)

### 1. Remove disabled edit button (don't show if can't edit)

**Problem**: When you can't edit a draft title (active draft or not your pool), a red disabled pencil icon shows. Instead, just hide it entirely.

**File**: `src/components/EditableTitle.jsx`

Change line 85 from:
```jsx
{(isEditable || editDisabled) && (
```
to:
```jsx
{isEditable && (
```

Also remove the `editDisabled` prop handling since it's no longer needed:
- Remove `editDisabled` from props destructuring
- Remove `disabled` class logic
- Remove `disabled` attribute

**File**: `src/components/EditableTitle.css`
- Remove `.editable-title-edit-button.disabled` styles (lines 33-40)

**File**: `app/history/page.js`
- Remove `editDisabled={isActive}` prop from EditableTitle (line 329)

### 2. Fix draft table row height alignment

**Problem**: Horizontal lines in draft table don't align because the actions cell content has different height.

**File**: `app/history/History.css`

Add to `.history-actions-cell`:
```css
.history-actions-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 32px;  /* Match button height */
}
```

This ensures all action cells have consistent minimum height.

---

## Updated Files to Modify

1. `migrations/025_add_hidden_column.sql` (new)
2. `app/api/pools/[shareId]/route.js` - Add hidden to PUT
3. `app/api/pools/route.js` - Add hidden to SELECT
4. `app/api/draft/history/route.js` - Add cp.hidden to SELECT
5. `app/history/page.js` - UI logic, rendering, remove editDisabled prop
6. `app/history/History.css` - Hide button styles, hidden section, fix row height
7. `src/components/EditableTitle.jsx` - Remove editDisabled logic
8. `src/components/EditableTitle.css` - Remove disabled button styles

---

## Verification

1. Run migration on local db
2. Start dev server: `npm run dev`
3. Go to /history page
4. Test sealed tab:
   - Click eye icon on a pool - should disappear from main list
   - "Hidden (1)" section should appear at bottom
   - Expand hidden section - pool should be there with open eye
   - Click open eye - pool returns to main list
5. Test draft tab:
   - Same behavior for completed drafts
   - Active drafts should NOT have hide button
   - **Active drafts should NOT have edit pencil icon**
6. Refresh page - hidden state should persist
7. Verify table rows align properly (horizontal lines consistent)
