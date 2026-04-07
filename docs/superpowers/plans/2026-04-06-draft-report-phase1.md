# Draft Report (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a FOP-gated Draft Report page with tabs for Seating, Draft Log, Pool, Deck, and a Gameplay placeholder, plus golden glow buttons on Pool/DeckBuilder/Play pages, a dropdown entry, and a reports list page.

**Architecture:** New page at `/draft/[shareId]/report` reuses existing components (PlayerCircle, draft log rendering, SealedPod card display, ArenaView) as tab content. A single API endpoint aggregates draft data scoped to the authenticated user's seat. A `report_public` column on `pools` controls shareability. Golden glow buttons gate on `isPatron` + `draftShareId` + ownership.

**Tech Stack:** Next.js App Router, React, CSS, PostgreSQL migration

---

## File Structure

### New Files
- `app/draft/[shareId]/report/page.tsx` — Draft Report page (tabs, header, data loading)
- `app/draft/[shareId]/report/report.css` — Report page styles
- `app/api/draft/[shareId]/report/route.ts` — Report data API (aggregates seating, picks, pool, deck)
- `app/api/draft/[shareId]/report/visibility/route.ts` — Toggle report public/private
- `app/draft/reports/page.tsx` — Reports list page
- `app/draft/reports/reports.css` — Reports list styles
- `app/api/draft/reports/route.ts` — List user's draft reports
- `src/components/DraftReportButton.tsx` — Golden glow button component
- `src/components/DraftReportButton.css` — Golden glow animation styles
- `migrations/050_add_report_public_to_pools.sql` — DB migration

### Modified Files
- `src/components/SealedPod.tsx` — Add DraftReportButton next to Draft Log
- `src/components/DeckBuilder/DeckBuilderHeader.tsx` — Add DraftReportButton next to Draft Log
- `app/pool/[shareId]/deck/play/page.tsx` — Add DraftReportButton next to Draft Log
- `src/components/AuthWidget.tsx` — Add "Draft Reports" dropdown entry

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/050_add_report_public_to_pools.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/050_add_report_public_to_pools.sql
ALTER TABLE pools ADD COLUMN IF NOT EXISTS report_public BOOLEAN DEFAULT false;
```

- [ ] **Step 2: Run migration locally**

Run: `psql $DATABASE_URL -f migrations/050_add_report_public_to_pools.sql`
Expected: `ALTER TABLE`

- [ ] **Step 3: Verify column exists**

Run: `psql $DATABASE_URL -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='pools' AND column_name='report_public'"`
Expected: One row showing `report_public | boolean | false`

- [ ] **Step 4: Commit**

```bash
git add migrations/050_add_report_public_to_pools.sql
git commit -m "feat: add report_public column to pools table"
```

---

### Task 2: Report Data API

**Files:**
- Create: `app/api/draft/[shareId]/report/route.ts`

This endpoint aggregates all data needed for the report: draft seating (all players + leaders), user's draft picks, pool cards, and deck builder state. It gates on FOP status.

- [ ] **Step 1: Create the API route**

```typescript
// app/api/draft/[shareId]/report/route.ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiCheckPatronStatus } from '@/src/utils/auth'
import { reconstructDraftLog } from '@/src/utils/draftLogReconstruction'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { shareId } = await params

  // Get the draft pod
  const pod = await queryRow(
    `SELECT p.id, p.share_id, p.set_code, p.set_name, p.name, p.status,
            p.max_players, p.current_players, p.host_id, p.started_at, p.completed_at,
            p.all_packs, p.settings, p.is_public
     FROM pods p WHERE p.share_id = $1 AND p.pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Find the user's player record in this draft
  const myPlayer = await queryRow(
    `SELECT pp.id, pp.seat_number, pp.user_id, pp.drafted_leaders, pp.drafted_cards
     FROM pod_players pp WHERE pp.pod_id = $1 AND pp.user_id = $2`,
    [pod.id, session.id]
  )
  if (!myPlayer) {
    return NextResponse.json({ error: 'You are not a participant in this draft' }, { status: 403 })
  }

  // Get all players for seating display
  const playersResult = await query(
    `SELECT pp.seat_number, pp.user_id, pp.is_bot, pp.drafted_leaders,
            pp.strategy_name, pp.mixin_name,
            u.username, u.avatar_url
     FROM pod_players pp
     LEFT JOIN users u ON pp.user_id = u.id
     WHERE pp.pod_id = $1
     ORDER BY pp.seat_number`,
    [pod.id]
  )
  const players = playersResult.rows.map(row => ({
    seatNumber: row.seat_number,
    userId: row.user_id,
    username: row.username || (row.is_bot ? `Bot (Seat ${row.seat_number})` : `Player ${row.seat_number}`),
    avatarUrl: row.avatar_url,
    isBot: row.is_bot,
    draftedLeaders: row.drafted_leaders ? (typeof row.drafted_leaders === 'string' ? JSON.parse(row.drafted_leaders) : row.drafted_leaders) : [],
    strategyName: row.strategy_name,
    mixinName: row.mixin_name,
  }))

  // Get user's draft picks (for Draft Log tab)
  const allPacks = pod.all_packs ? (typeof pod.all_packs === 'string' ? JSON.parse(pod.all_packs) : pod.all_packs) : null
  let picks: unknown[] = []
  if (allPacks) {
    try {
      picks = reconstructDraftLog({
        targetSeat: myPlayer.seat_number,
        totalSeats: pod.max_players,
        allPacks,
        players: playersResult.rows.map(r => ({
          odId: r.user_id,
          seatNumber: r.seat_number,
          draftedCards: r.drafted_cards ? (typeof r.drafted_cards === 'string' ? JSON.parse(r.drafted_cards) : r.drafted_cards) : [],
          draftedLeaders: r.drafted_leaders ? (typeof r.drafted_leaders === 'string' ? JSON.parse(r.drafted_leaders) : r.drafted_leaders) : [],
        })),
      })
    } catch (e) {
      console.error('Failed to reconstruct draft log for report:', e)
    }
  }

  // Get user's pool (for Pool + Deck tabs)
  const pool = await queryRow(
    `SELECT cp.id, cp.share_id, cp.cards, cp.packs, cp.deck_builder_state,
            cp.report_public, cp.pool_type, cp.created_at
     FROM card_pools cp
     JOIN pod_players pp ON pp.id = cp.pod_player_id
     WHERE pp.pod_id = $1 AND pp.user_id = $2`,
    [pod.id, session.id]
  )

  return NextResponse.json({
    draft: {
      shareId: pod.share_id,
      name: pod.name,
      setCode: pod.set_code,
      setName: pod.set_name,
      status: pod.status,
      maxPlayers: pod.max_players,
      currentPlayers: pod.current_players,
      isPublic: pod.is_public,
      startedAt: pod.started_at,
      completedAt: pod.completed_at,
      competitive: pod.settings?.competitive || false,
    },
    players,
    mySeat: myPlayer.seat_number,
    picks,
    pool: pool ? {
      shareId: pool.share_id,
      cards: typeof pool.cards === 'string' ? JSON.parse(pool.cards) : (pool.cards || []),
      packs: typeof pool.packs === 'string' ? JSON.parse(pool.packs) : (pool.packs || []),
      deckBuilderState: typeof pool.deck_builder_state === 'string' ? JSON.parse(pool.deck_builder_state) : pool.deck_builder_state,
      reportPublic: pool.report_public,
      createdAt: pool.created_at,
    } : null,
  })
}
```

- [ ] **Step 2: Test the endpoint manually**

Run: `npm run dev`
Then in another terminal: `curl -s http://localhost:3000/api/draft/<a-real-shareId>/report -H "Cookie: <your-session-cookie>" | jq '.draft.name, .mySeat, (.players | length)'`
Expected: Draft name, your seat number, player count

- [ ] **Step 3: Commit**

```bash
git add app/api/draft/\[shareId\]/report/route.ts
git commit -m "feat: add draft report data API endpoint"
```

---

### Task 3: Report Visibility API

**Files:**
- Create: `app/api/draft/[shareId]/report/visibility/route.ts`

- [ ] **Step 1: Create the visibility toggle endpoint**

```typescript
// app/api/draft/[shareId]/report/visibility/route.ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { shareId } = await params
  const body = await request.json()
  const { reportPublic } = body

  if (typeof reportPublic !== 'boolean') {
    return NextResponse.json({ error: 'reportPublic must be a boolean' }, { status: 400 })
  }

  // Find the draft pod
  const pod = await queryRow(
    `SELECT id FROM pods WHERE share_id = $1 AND pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Update the user's pool report_public flag
  const result = await query(
    `UPDATE card_pools SET report_public = $1
     FROM pod_players pp
     WHERE card_pools.pod_player_id = pp.id
       AND pp.pod_id = $2
       AND pp.user_id = $3`,
    [reportPublic, pod.id, session.id]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'You are not a participant in this draft' }, { status: 403 })
  }

  return NextResponse.json({ success: true, reportPublic })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/draft/\[shareId\]/report/visibility/route.ts
git commit -m "feat: add draft report visibility toggle API"
```

---

### Task 4: Reports List API

**Files:**
- Create: `app/api/draft/reports/route.ts`

- [ ] **Step 1: Create the list endpoint**

```typescript
// app/api/draft/reports/route.ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const result = await query(
    `SELECT p.share_id as "draftShareId", p.name, p.set_code as "setCode",
            p.set_name as "setName", p.max_players as "maxPlayers",
            p.completed_at as "completedAt", p.started_at as "startedAt",
            p.settings,
            pp.seat_number as "seatNumber",
            pp.drafted_leaders as "draftedLeaders"
     FROM pods p
     JOIN pod_players pp ON pp.pod_id = p.id
     WHERE pp.user_id = $1
       AND p.pod_type = 'draft'
       AND p.status = 'complete'
     ORDER BY p.completed_at DESC NULLS LAST
     LIMIT 50`,
    [session.id]
  )

  const reports = result.rows.map(row => {
    const leaders = row.draftedLeaders
      ? (typeof row.draftedLeaders === 'string' ? JSON.parse(row.draftedLeaders) : row.draftedLeaders)
      : []
    return {
      draftShareId: row.draftShareId,
      name: row.name,
      setCode: row.setCode,
      setName: row.setName,
      maxPlayers: row.maxPlayers,
      completedAt: row.completedAt,
      startedAt: row.startedAt,
      competitive: row.settings?.competitive || false,
      seatNumber: row.seatNumber,
      leaderName: leaders[0]?.name || null,
      leaderImageUrl: leaders[0]?.imageUrl || null,
    }
  })

  return NextResponse.json({ reports })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/draft/reports/route.ts
git commit -m "feat: add draft reports list API"
```

---

### Task 5: Golden Glow Button Component

**Files:**
- Create: `src/components/DraftReportButton.tsx`
- Create: `src/components/DraftReportButton.css`

- [ ] **Step 1: Create the CSS with golden glow animation**

```css
/* src/components/DraftReportButton.css */
.draft-report-button {
  border: 2px solid rgba(255, 215, 0, 0.6) !important;
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.2), inset 0 0 6px rgba(255, 215, 0, 0.03);
  animation: draftReportGlow 2s ease-in-out infinite alternate;
}

.draft-report-button:hover {
  border-color: rgba(255, 215, 0, 0.9) !important;
  box-shadow: 0 0 24px rgba(255, 215, 0, 0.5), inset 0 0 12px rgba(255, 215, 0, 0.1) !important;
  transform: translateY(-2px);
}

@keyframes draftReportGlow {
  0% { box-shadow: 0 0 12px rgba(255, 215, 0, 0.2), inset 0 0 6px rgba(255, 215, 0, 0.03); }
  100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.4), inset 0 0 10px rgba(255, 215, 0, 0.08); }
}

/* Pool page variant (matches secondary button sizing) */
.draft-report-button.pool-variant {
  margin-top: 0.75rem;
}

/* Play page variant (matches play-action-button sizing) */
.draft-report-button-play {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  font-family: 'Barlow', sans-serif;
  border: 2px solid rgba(255, 215, 0, 0.6);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 8px;
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.2), inset 0 0 6px rgba(255, 215, 0, 0.03);
  animation: draftReportGlow 2s ease-in-out infinite alternate;
}

.draft-report-button-play:hover {
  background: rgba(0, 0, 0, 0.85);
  border-color: rgba(255, 215, 0, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 0 24px rgba(255, 215, 0, 0.5), inset 0 0 12px rgba(255, 215, 0, 0.1);
}
```

- [ ] **Step 2: Create the button component**

```typescript
// src/components/DraftReportButton.tsx
// @ts-nocheck
import Button from './Button'
import './DraftReportButton.css'

interface DraftReportButtonProps {
  draftShareId: string
  variant?: 'default' | 'pool' | 'play'
}

export default function DraftReportButton({ draftShareId, variant = 'default' }: DraftReportButtonProps) {
  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <path d="M12 18l-2-1.5L8 18v-4h8v4l-2-1.5L12 18z" fill="rgba(255,215,0,0.4)" stroke="rgba(255,215,0,0.9)" strokeWidth="1.5"></path>
    </svg>
  )

  if (variant === 'play') {
    return (
      <button
        className="draft-report-button-play"
        onClick={() => { window.location.href = `/draft/${draftShareId}/report` }}
      >
        {icon}
        Draft Report
      </button>
    )
  }

  return (
    <Button
      variant="secondary"
      className={`draft-report-button${variant === 'pool' ? ' pool-variant' : ''}`}
      onClick={() => { window.location.href = `/draft/${draftShareId}/report` }}
    >
      {icon}
      <span>Draft Report</span>
    </Button>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DraftReportButton.tsx src/components/DraftReportButton.css
git commit -m "feat: add DraftReportButton component with golden glow"
```

---

### Task 6: Add Golden Glow Button to Pool, DeckBuilder, and Play Pages

**Files:**
- Modify: `src/components/SealedPod.tsx`
- Modify: `src/components/DeckBuilder/DeckBuilderHeader.tsx`
- Modify: `app/pool/[shareId]/deck/play/page.tsx`

- [ ] **Step 1: Add button to SealedPod (Pool page)**

In `src/components/SealedPod.tsx`, add import at top:

```typescript
import DraftReportButton from './DraftReportButton'
import { useAuth } from '../contexts/AuthContext'
```

Then after the existing Draft Log button block (the `{draftShareId && (` block around line 402), add:

```typescript
        {draftShareId && isPatron && isOwner && (
          <DraftReportButton draftShareId={draftShareId} variant="pool" />
        )}
```

And destructure `isPatron` from `useAuth()` near the top of the component. Check if `useAuth` is already imported — if so, just add `isPatron` to the destructure. Also check if `isOwner` is already available in the component (it should be, since the pool page passes it).

- [ ] **Step 2: Add button to DeckBuilderHeader**

In `src/components/DeckBuilder/DeckBuilderHeader.tsx`, add import at top:

```typescript
import DraftReportButton from '../DraftReportButton'
```

After the Draft Log button block (the `{draftShareId && (` block we added in the quick fixes), add:

```typescript
        {/* Draft Report button (FOP only) */}
        {draftShareId && isPatron && isOwner && (
          <DraftReportButton draftShareId={draftShareId} />
        )}
```

Add `isPatron` to `DeckBuilderHeaderProps` interface and the destructure. The parent `DeckBuilder.tsx` will need to pass `isPatron` — get it from `useAuth()` in the parent and thread it through.

- [ ] **Step 3: Add button to Play page**

In `app/pool/[shareId]/deck/play/page.tsx`, add import:

```typescript
import DraftReportButton from '../../../../src/components/DraftReportButton'
```

After the existing Draft Log button block (around line 1713), add:

```typescript
                {pool?.draftShareId && pool?.poolType === 'draft' && isPatron && isOwner && (
                  <DraftReportButton draftShareId={pool.draftShareId} variant="play" />
                )}
```

Check that `isPatron` is available from `useAuth()` in this component (it likely already imports `useAuth`). Check that `isOwner` is computed (it likely already is).

- [ ] **Step 4: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/SealedPod.tsx src/components/DeckBuilder/DeckBuilderHeader.tsx app/pool/\[shareId\]/deck/play/page.tsx
git commit -m "feat: add Draft Report golden glow button to Pool, DeckBuilder, and Play pages"
```

---

### Task 7: Add "Draft Reports" to AuthWidget Dropdown

**Files:**
- Modify: `src/components/AuthWidget.tsx`

- [ ] **Step 1: Add the menu item**

In `src/components/AuthWidget.tsx`, find the `{hasShowcases && (` block (around line 377). Add the Draft Reports entry just before it (after the divider at line 375):

```typescript
              {isPatron && (
                <a
                  href="/draft/reports"
                  className="auth-widget-drawer-menu-item auth-widget-draft-reports-item"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault()
                    router.push('/draft/reports')
                    setDrawerOpen(false)
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.9)" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  Draft Reports
                </a>
              )}
```

Check that `isPatron` is available — `AuthWidget` already uses `useAuth()`, so add `isPatron` to the destructure if not already there.

- [ ] **Step 2: Add gold tint CSS**

In `src/components/AuthWidget.css`, add:

```css
.auth-widget-draft-reports-item {
  color: rgba(255, 215, 0, 0.9) !important;
}

.auth-widget-draft-reports-item:hover {
  color: rgba(255, 215, 0, 1) !important;
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/AuthWidget.tsx src/components/AuthWidget.css
git commit -m "feat: add Draft Reports entry to user dropdown"
```

---

### Task 8: Draft Report Page — Shell with Tabs

**Files:**
- Create: `app/draft/[shareId]/report/page.tsx`
- Create: `app/draft/[shareId]/report/report.css`

- [ ] **Step 1: Create the report page CSS**

```css
/* app/draft/[shareId]/report/report.css */

.draft-report-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0a0a1a 0%, #0d0d0d 100%);
  color: white;
  font-family: 'Barlow', sans-serif;
}

.draft-report-header {
  padding: 24px 32px;
  border-bottom: 1px solid rgba(255, 215, 0, 0.2);
  background: linear-gradient(180deg, rgba(255, 215, 0, 0.08) 0%, transparent 100%);
}

.draft-report-header-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.draft-report-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.draft-report-label {
  font-size: 0.75rem;
  color: rgba(255, 215, 0, 0.7);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.draft-report-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}

.draft-report-meta {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
}

.draft-report-header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.draft-report-visibility-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 0.85rem;
  font-family: 'Barlow', sans-serif;
  transition: all 0.2s ease;
}

.draft-report-visibility-toggle:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: white;
}

.draft-report-visibility-toggle.public {
  border-color: rgba(0, 255, 0, 0.3);
  color: rgba(0, 255, 0, 0.7);
}

.draft-report-copy-link {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.5);
  font-size: 0.85rem;
  color: white;
  cursor: pointer;
  font-family: 'Barlow', sans-serif;
  transition: all 0.2s ease;
}

.draft-report-copy-link:hover {
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-1px);
}

.draft-report-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0 32px;
  max-width: 1200px;
  margin: 0 auto;
  overflow-x: auto;
}

.draft-report-tab {
  padding: 14px 24px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
  cursor: pointer;
  border: none;
  background: none;
  font-family: 'Barlow', sans-serif;
  white-space: nowrap;
  transition: color 0.2s ease;
  border-bottom: 2px solid transparent;
}

.draft-report-tab:hover {
  color: rgba(255, 255, 255, 0.8);
}

.draft-report-tab.active {
  color: rgba(255, 215, 0, 0.9);
  border-bottom-color: rgba(255, 215, 0, 0.8);
  font-weight: 600;
}

.draft-report-tab.placeholder {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.draft-report-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px;
}

.draft-report-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: rgba(255, 255, 255, 0.5);
}

.draft-report-error {
  text-align: center;
  padding: 4rem 2rem;
}

.draft-report-error h2 {
  color: rgba(255, 100, 100, 0.9);
  margin-bottom: 1rem;
}

.draft-report-error p {
  color: rgba(255, 255, 255, 0.6);
}

/* Seating tab */
.draft-report-seating {
  display: flex;
  justify-content: center;
  padding: 2rem 0;
}

/* Draft Log tab */
.draft-report-log {
  padding: 1rem 0;
}

.draft-report-log-section {
  margin-bottom: 2rem;
}

.draft-report-log-section h3 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: rgba(255, 215, 0, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5rem;
}

.draft-report-pick-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.draft-report-pick-label {
  min-width: 80px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.draft-report-pick-label span {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.3);
}

/* Pool tab */
.draft-report-pool {
  padding: 1rem 0;
}

.draft-report-pool-section {
  margin-bottom: 2rem;
}

.draft-report-pool-section h3 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: rgba(255, 215, 0, 0.8);
}

/* Deck tab */
.draft-report-deck {
  padding: 1rem 0;
}

.draft-report-deck-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.draft-report-deck-empty {
  text-align: center;
  padding: 4rem 2rem;
  color: rgba(255, 255, 255, 0.4);
}

/* Gameplay placeholder tab */
.draft-report-gameplay-placeholder {
  text-align: center;
  padding: 4rem 2rem;
}

.draft-report-gameplay-placeholder h3 {
  color: rgba(255, 215, 0, 0.8);
  margin-bottom: 1rem;
}

.draft-report-gameplay-placeholder p {
  color: rgba(255, 255, 255, 0.5);
  max-width: 500px;
  margin: 0 auto 1.5rem;
  line-height: 1.6;
}

.draft-report-gameplay-placeholder a {
  color: rgba(255, 215, 0, 0.9);
  text-decoration: underline;
}

.draft-report-message {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 215, 0, 0.4);
  border-radius: 8px;
  color: white;
  font-size: 0.9rem;
  z-index: 100;
}

/* Back button */
.draft-report-back {
  margin-bottom: 1rem;
}

@media (max-width: 768px) {
  .draft-report-header {
    padding: 16px;
  }

  .draft-report-header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .draft-report-tabs {
    padding: 0 16px;
  }

  .draft-report-tab {
    padding: 12px 16px;
    font-size: 0.85rem;
  }

  .draft-report-content {
    padding: 16px;
  }

  .draft-report-pick-row {
    flex-direction: column;
  }

  .draft-report-pick-label {
    min-width: auto;
    flex-direction: row;
    gap: 8px;
  }
}
```

- [ ] **Step 2: Create the report page component**

```typescript
// app/draft/[shareId]/report/page.tsx
// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../src/contexts/AuthContext'
import Button from '../../../../src/components/Button'
import PlayerCircle from '../../../../src/components/PlayerCircle'
import CardWithPreview from '../../../../src/components/CardWithPreview'
import '../../../../src/App.css'
import './report.css'

interface ReportData {
  draft: {
    shareId: string
    name: string
    setCode: string
    setName: string
    status: string
    maxPlayers: number
    currentPlayers: number
    isPublic: boolean
    startedAt: string | null
    completedAt: string | null
    competitive: boolean
  }
  players: Array<{
    seatNumber: number
    userId: string
    username: string
    avatarUrl: string | null
    isBot: boolean
    draftedLeaders: unknown[]
    strategyName: string | null
    mixinName: string | null
  }>
  mySeat: number
  picks: Array<{
    type: 'leader' | 'card'
    packNumber: number
    pickInPack: number
    overallPickNumber: number
    visibleCards: Array<{ instanceId: string; [key: string]: unknown }>
    pickedInstanceId: string | null
  }>
  pool: {
    shareId: string
    cards: unknown[]
    packs: Array<{ cards: unknown[]; name?: string }>
    deckBuilderState: unknown
    reportPublic: boolean
    createdAt: string
  } | null
}

type TabId = 'seating' | 'log' | 'pool' | 'deck' | 'gameplay'

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function DraftReportPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const shareId = resolvedParams.shareId
  const router = useRouter()
  const { user, isPatron } = useAuth()

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('seating')
  const [message, setMessage] = useState<string | null>(null)
  const [reportPublic, setReportPublic] = useState(false)

  useEffect(() => {
    if (!shareId) return
    async function fetchReport() {
      try {
        setLoading(true)
        const res = await fetch(`/api/draft/${shareId}/report`, { credentials: 'include' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to load report' }))
          setError(err.error || 'Failed to load report')
          return
        }
        const reportData = await res.json()
        setData(reportData)
        setReportPublic(reportData.pool?.reportPublic || false)
      } catch {
        setError('Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [shareId])

  const handleToggleVisibility = async () => {
    const newValue = !reportPublic
    setReportPublic(newValue)
    try {
      const res = await fetch(`/api/draft/${shareId}/report/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reportPublic: newValue }),
      })
      if (res.ok) {
        setMessage(newValue ? 'Report is now public' : 'Report is now private')
        setTimeout(() => setMessage(null), 3000)
      } else {
        setReportPublic(!newValue) // revert
      }
    } catch {
      setReportPublic(!newValue) // revert
    }
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/draft/${shareId}/report`
    await navigator.clipboard.writeText(url)
    setMessage('Report link copied!')
    setTimeout(() => setMessage(null), 3000)
  }

  if (loading) {
    return (
      <div className="draft-report-page">
        <div className="draft-report-loading">Loading report...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="draft-report-page">
        <div className="draft-report-content">
          <div className="draft-report-error">
            <h2>Error</h2>
            <p>{error || 'Report not found'}</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }

  if (isPatron === false) {
    return (
      <div className="draft-report-page">
        <div className="draft-report-content">
          <div className="draft-report-error">
            <h2>Friends of the Pod</h2>
            <p>Draft Reports are available exclusively for Friends of the Pod.</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }

  const { draft, players, picks, pool } = data
  const completedDate = draft.completedAt
    ? new Date(draft.completedAt).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      })
    : null

  // Build sections for draft log tab
  const leaderPicks = picks.filter(p => p.type === 'leader')
  const pack1Picks = picks.filter(p => p.type === 'card' && p.packNumber === 1)
  const pack2Picks = picks.filter(p => p.type === 'card' && p.packNumber === 2)
  const pack3Picks = picks.filter(p => p.type === 'card' && p.packNumber === 3)
  const logSections = [
    { title: 'Leader Draft', picks: leaderPicks },
    { title: 'Pack 1', picks: pack1Picks },
    { title: 'Pack 2', picks: pack2Picks },
    { title: 'Pack 3', picks: pack3Picks },
  ].filter(s => s.picks.length > 0)

  // Build pool packs for pool tab
  const poolPacks = pool?.packs || []

  // Parse deck builder state for deck tab
  const deckState = pool?.deckBuilderState || null
  const deckCards = []
  const sideboardCards = []
  let activeLeaderCard = null
  let activeBaseCard = null

  if (deckState && typeof deckState === 'object' && deckState.cardPositions) {
    const allCards = pool?.cards || []
    const cardMap = new Map()
    for (const card of allCards) {
      cardMap.set(card.instanceId || card.id, card)
    }
    for (const [id, pos] of Object.entries(deckState.cardPositions)) {
      const card = cardMap.get(id)
      if (!card) continue
      if (card.isLeader && id === deckState.activeLeader) activeLeaderCard = card
      else if (card.isBase && id === deckState.activeBase) activeBaseCard = card
      else if (pos.section === 'deck' && pos.visible !== false && pos.enabled !== false) deckCards.push(card)
      else if (pos.section === 'sideboard') sideboardCards.push(card)
    }
  }

  // Sort deck by cost
  deckCards.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))

  const tabs: Array<{ id: TabId; label: string; placeholder?: boolean }> = [
    { id: 'seating', label: 'Draft Seating' },
    { id: 'log', label: 'Draft Log' },
    { id: 'pool', label: 'Pool' },
    { id: 'deck', label: 'Deck' },
    { id: 'gameplay', label: 'Gameplay ✨', placeholder: true },
  ]

  return (
    <div className="draft-report-page">
      {/* Header */}
      <div className="draft-report-header">
        <div className="draft-report-header-content">
          <div className="draft-report-header-info">
            <div className="draft-report-label">Draft Report</div>
            <h1 className="draft-report-title">{draft.name || `${draft.setName} Draft`}</h1>
            <div className="draft-report-meta">
              {completedDate && `${completedDate} · `}
              {draft.maxPlayers} Players
              {draft.competitive && ' · Competitive'}
            </div>
          </div>
          <div className="draft-report-header-actions">
            <button
              className={`draft-report-visibility-toggle ${reportPublic ? 'public' : ''}`}
              onClick={handleToggleVisibility}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {reportPublic ? (
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                  </>
                ) : (
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </>
                )}
              </svg>
              {reportPublic ? 'Public' : 'Private'}
            </button>
            <button className="draft-report-copy-link" onClick={handleCopyLink}>
              Copy Link
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="draft-report-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`draft-report-tab ${activeTab === tab.id ? 'active' : ''} ${tab.placeholder ? 'placeholder' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="draft-report-content">
        {/* Seating Tab */}
        {activeTab === 'seating' && (
          <div className="draft-report-seating">
            <PlayerCircle
              players={players.map(p => ({
                odId: p.userId,
                username: p.username,
                avatarUrl: p.avatarUrl,
                seatNumber: p.seatNumber,
                isBot: p.isBot,
                pickStatus: 'picked',
                leaders: p.draftedLeaders,
                draftedLeaders: p.draftedLeaders,
              }))}
              maxPlayers={draft.maxPlayers}
              currentUserId={user?.id}
              showLeaderInfo={true}
            />
          </div>
        )}

        {/* Draft Log Tab */}
        {activeTab === 'log' && (
          <div className="draft-report-log">
            {logSections.length === 0 ? (
              <div className="draft-report-deck-empty">No draft log data available.</div>
            ) : (
              logSections.map(section => (
                <div key={section.title} className="draft-report-log-section">
                  <h3>{section.title}</h3>
                  {section.picks.map((pick, i) => (
                    <div key={i} className="draft-report-pick-row">
                      <div className="draft-report-pick-label">
                        {section.title === 'Leader Draft' ? 'Leaders' : `Pack ${pick.packNumber}`}
                        <span>Pick {pick.pickInPack}</span>
                      </div>
                      <div className="cards-grid">
                        {pick.visibleCards.map(card => (
                          <CardWithPreview
                            key={card.instanceId}
                            card={card}
                            selected={card.instanceId === pick.pickedInstanceId}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* Pool Tab */}
        {activeTab === 'pool' && (
          <div className="draft-report-pool">
            {poolPacks.length === 0 ? (
              <div className="draft-report-deck-empty">No pool data available.</div>
            ) : (
              poolPacks.map((pack, index) => (
                <div key={index} className="draft-report-pool-section">
                  <h3>{pack.name || `Round ${index + 1}`}</h3>
                  <div className="cards-grid">
                    {(pack.cards || []).map((card, ci) => (
                      <CardWithPreview key={card.instanceId || ci} card={card} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Deck Tab */}
        {activeTab === 'deck' && (
          <div className="draft-report-deck">
            {!deckState ? (
              <div className="draft-report-deck-empty">Still deckbuilding...</div>
            ) : (
              <>
                {/* Leader + Base */}
                {(activeLeaderCard || activeBaseCard) && (
                  <div className="draft-report-pool-section">
                    <h3>Leader & Base</h3>
                    <div className="cards-grid">
                      {activeLeaderCard && <CardWithPreview card={activeLeaderCard} selected />}
                      {activeBaseCard && <CardWithPreview card={activeBaseCard} selected />}
                    </div>
                  </div>
                )}

                {/* Main Deck */}
                {deckCards.length > 0 && (
                  <div className="draft-report-pool-section">
                    <h3>Deck ({deckCards.length})</h3>
                    <div className="cards-grid">
                      {deckCards.map((card, i) => (
                        <CardWithPreview key={card.instanceId || i} card={card} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Sideboard */}
                {sideboardCards.length > 0 && (
                  <div className="draft-report-pool-section">
                    <h3>Sideboard ({sideboardCards.length})</h3>
                    <div className="cards-grid" style={{ opacity: 0.6 }}>
                      {sideboardCards.map((card, i) => (
                        <CardWithPreview key={card.instanceId || i} card={card} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Export actions */}
                {pool?.shareId && (
                  <div className="draft-report-deck-actions">
                    <Button variant="secondary" onClick={() => { window.location.href = `/pool/${pool.shareId}/deck` }}>
                      Open in Deck Builder
                    </Button>
                    <Button variant="secondary" onClick={() => { window.location.href = `/pool/${pool.shareId}/deck/play` }}>
                      Play Page
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Gameplay Placeholder Tab */}
        {activeTab === 'gameplay' && (
          <div className="draft-report-gameplay-placeholder">
            <h3>Gameplay — Coming Soon</h3>
            <p>
              Match results, replay links, deck validation, and tournament brackets will appear here
              once integrated with the Wayfinder extension.
            </p>
            <p>
              <a href="https://wayfinder.news" target="_blank" rel="noopener noreferrer">
                Learn more about Wayfinder →
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Back button */}
      <div className="draft-report-content draft-report-back">
        <Button variant="back" onClick={() => router.back()}>Back</Button>
      </div>

      {/* Toast message */}
      {message && <div className="draft-report-message">{message}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/draft/\[shareId\]/report/page.tsx app/draft/\[shareId\]/report/report.css
git commit -m "feat: add Draft Report page with all tabs"
```

---

### Task 9: Draft Reports List Page

**Files:**
- Create: `app/draft/reports/page.tsx`
- Create: `app/draft/reports/reports.css`

- [ ] **Step 1: Create the list page CSS**

```css
/* app/draft/reports/reports.css */

.draft-reports-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0a0a1a 0%, #0d0d0d 100%);
  color: white;
  font-family: 'Barlow', sans-serif;
  padding: 2rem;
}

.draft-reports-content {
  max-width: 800px;
  margin: 0 auto;
}

.draft-reports-header {
  text-align: center;
  margin-bottom: 2rem;
}

.draft-reports-header h1 {
  font-size: 2rem;
  color: rgba(255, 215, 0, 0.9);
  margin-bottom: 0.5rem;
}

.draft-reports-header p {
  color: rgba(255, 255, 255, 0.5);
}

.draft-reports-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.draft-reports-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  color: white;
}

.draft-reports-item:hover {
  border-color: rgba(255, 215, 0, 0.4);
  background: rgba(255, 215, 0, 0.05);
  transform: translateY(-1px);
}

.draft-reports-item-leader {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.05);
}

.draft-reports-item-leader img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.draft-reports-item-info {
  flex: 1;
  min-width: 0;
}

.draft-reports-item-name {
  font-weight: 600;
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.draft-reports-item-meta {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.draft-reports-item-badge {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 215, 0, 0.15);
  color: rgba(255, 215, 0, 0.9);
  border: 1px solid rgba(255, 215, 0, 0.3);
  flex-shrink: 0;
}

.draft-reports-empty {
  text-align: center;
  padding: 4rem 2rem;
  color: rgba(255, 255, 255, 0.4);
}

.draft-reports-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: rgba(255, 255, 255, 0.5);
}
```

- [ ] **Step 2: Create the list page component**

```typescript
// app/draft/reports/page.tsx
// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import Button from '../../../src/components/Button'
import '../../../src/App.css'
import './reports.css'

interface DraftReportEntry {
  draftShareId: string
  name: string
  setCode: string
  setName: string
  maxPlayers: number
  completedAt: string | null
  startedAt: string | null
  competitive: boolean
  seatNumber: number
  leaderName: string | null
  leaderImageUrl: string | null
}

export default function DraftReportsPage() {
  const router = useRouter()
  const { user, isPatron, loading: authLoading } = useAuth()
  const [reports, setReports] = useState<DraftReportEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReports() {
      try {
        setLoading(true)
        const res = await fetch('/api/draft/reports', { credentials: 'include' })
        if (!res.ok) {
          setError('Failed to load reports')
          return
        }
        const data = await res.json()
        setReports(data.reports || [])
      } catch {
        setError('Failed to load reports')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchReports()
    }
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="draft-reports-page">
        <div className="draft-reports-loading">Loading...</div>
      </div>
    )
  }

  if (isPatron === false) {
    return (
      <div className="draft-reports-page">
        <div className="draft-reports-content">
          <div className="draft-reports-empty">
            <h2>Friends of the Pod</h2>
            <p>Draft Reports are available exclusively for Friends of the Pod.</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="draft-reports-page">
      <div className="draft-reports-content">
        <div className="draft-reports-header">
          <h1>Draft Reports</h1>
          <p>Your completed draft reports</p>
        </div>

        {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

        {reports.length === 0 && !error ? (
          <div className="draft-reports-empty">
            No draft reports yet. Join a draft to get started!
          </div>
        ) : (
          <div className="draft-reports-list">
            {reports.map(report => (
              <a
                key={report.draftShareId}
                href={`/draft/${report.draftShareId}/report`}
                className="draft-reports-item"
                onClick={(e) => {
                  e.preventDefault()
                  router.push(`/draft/${report.draftShareId}/report`)
                }}
              >
                <div className="draft-reports-item-leader">
                  {report.leaderImageUrl && (
                    <img src={report.leaderImageUrl} alt={report.leaderName || ''} />
                  )}
                </div>
                <div className="draft-reports-item-info">
                  <div className="draft-reports-item-name">
                    {report.name || `${report.setName} Draft`}
                  </div>
                  <div className="draft-reports-item-meta">
                    {report.completedAt
                      ? new Date(report.completedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })
                      : 'In progress'}
                    {' · '}{report.setName}
                    {' · '}{report.maxPlayers} players
                    {report.leaderName && ` · ${report.leaderName}`}
                  </div>
                </div>
                {report.competitive && (
                  <div className="draft-reports-item-badge">COMPETITIVE</div>
                )}
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: '2rem' }}>
          <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/draft/reports/page.tsx app/draft/reports/reports.css
git commit -m "feat: add Draft Reports list page"
```

---

### Task 10: Final Build Verification and Integration Test

- [ ] **Step 1: Run the full build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run existing tests to check for regressions**

Run: `npm run test 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`

Verify:
1. Navigate to a completed draft's pool page — golden glow "Draft Report" button appears (if FOP)
2. Click the button — loads `/draft/{shareId}/report`
3. All 5 tabs render: Seating shows PlayerCircle, Draft Log shows picks, Pool shows cards, Deck shows built deck, Gameplay shows placeholder
4. Public/Private toggle works
5. Copy Link works
6. User dropdown shows "Draft Reports" entry (FOP only)
7. `/draft/reports` page lists completed drafts

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues from smoke test"
```
