# Rotisserie Draft Fix Plan

## Problem Summary

The rotisserie draft page is broken:
- Shows "Players (0/)" with no player list
- No owner controls, no copy link
- Shows draft view instead of lobby view
- All data appears undefined

## Root Cause

**API Response Unwrapping Bug**: The API uses `jsonResponse()` which wraps data as `{ success, data, message }`. The play page does `setData(result)` instead of `setData(result.data)`.

## Files to Fix

### 1. `app/formats/rotisserie/[shareId]/page.tsx`

**Bug locations:**
- Line 104-105: `setData(result)` should be `setData(result.data)`
- Line 138-139: `setData(result)` should be `setData(result.data)`

### 2. Additional Issues Found

The code has good lobby vs active view logic at line 237, but since `data.status` is undefined (because data is wrong), it falls through to the active view.

## Implementation Steps

1. Fix API response unwrapping in fetchData callback
2. Fix API response unwrapping in handleAction callback
3. Test the fix manually
4. Write E2E test for rotisserie draft flow

## E2E Test Plan

Create `e2e/rotisserie.spec.js` that tests:
1. Navigate to /formats/rotisserie
2. Select sets and create draft
3. Verify lobby view shows with:
   - Player list with host
   - Share link copy button
   - "Add Bot" button (host controls)
   - "Start Draft" button (disabled until 2+ players)
4. Add a bot player
5. Start the draft
6. Verify active view shows with:
   - Turn indicator
   - Card pool
   - Pick functionality

## Verification

1. `npm run build` passes
2. Manual test: create rotisserie draft, verify lobby shows
3. E2E test passes
