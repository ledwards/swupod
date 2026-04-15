# CPM Full UI E2E Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `tests/e2e/competitive-cpm-full.spec.ts` — a single Playwright test that drives 8 real browser contexts through the entire Competitive Practice Mode flow (create → draft → deck-build → 3 BO3 rounds → final standings), with every user action performed via UI clicks and a seeded RNG selecting winners.

**Architecture:** Modeled on `tests/e2e/multiplayer-draft.spec.ts`. One Chromium browser, 8 `BrowserContext`s (one per test user), one `Page` per context. Every player action — draft creation, joining, picking cards, building decks, reporting matches — is a Playwright UI interaction. The only non-UI steps are user-row creation in DB (auth bootstrap, identical to the existing 8-player draft test) and final cleanup.

**Tech Stack:** Playwright (already configured), pg (DB cleanup only), existing `tests/e2e/test-utils.ts` helpers, Mulberry32 PRNG (5 lines, inline). Node test runner.

**Spec:** `docs/superpowers/specs/2026-04-14-cpm-full-ui-e2e-design.md`

---

## File Structure

| File | Purpose | Action |
|------|---------|--------|
| `tests/e2e/test-utils.ts` | Add `isAdmin` option to `createTestUser` (host needs `is_admin` to bypass FOP check and see the competitive toggle) | Modify |
| `src/components/PlayerSeat.tsx` | Add `data-testid="player-seat-${seatNumber}"` for stable seat lookup | Modify |
| `src/components/MatchCard.tsx` | Add `data-testid="match-card-${match.id}"` and `data-match-status="..."` for stable match lookup and status assertion | Modify |
| `src/components/MatchmakingPanel.tsx` | Add `data-testid="matchmaking-panel"`, `data-matchmaking-status="..."`, and `data-current-round="..."` so tests can read overall matchmaking state without scraping CSS | Modify |
| `src/components/ResultReportModal.tsx` | Add `data-testid="result-report-modal"` and `data-game-row="game1\|game2\|game3"` on rows so each game's three buttons are addressable | Modify |
| `tests/e2e/competitive-cpm-full.spec.ts` | The new test file | Create |

The `data-testid` additions are tiny, non-functional, and serve the stability of every UI test that follows — not just this one. They are part of this plan's scope.

---

## Task 1: Extend `createTestUser` to support `isAdmin`

**Files:**
- Modify: `tests/e2e/test-utils.ts:54`

**Why:** The host of a competitive draft needs `is_admin = true` to bypass the FOP check in `app/api/draft/route.ts:34-39` AND to make `isPatron` resolve to `true` in `AuthContext` (via the patron-status endpoint at `app/api/auth/patron-status/route.ts:14-19`). Without this, the "Competitive" toggle never appears on `/draft`.

- [ ] **Step 1: Modify the `createTestUser` signature and INSERT to accept `isAdmin`**

In `tests/e2e/test-utils.ts`, find the `createTestUser` function (around line 54). Replace its body with:

```typescript
export async function createTestUser(username: string, testId: string, options?: { isBetaTester?: boolean; isAdmin?: boolean }): Promise<TestUserResult> {
  const uniqueId = `test_${testId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Insert user into database
  const db = getPool()
  const result = await db.query(
    `INSERT INTO users (discord_id, username, email, avatar_url, is_beta_tester, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [uniqueId, username, `${uniqueId}@test.local`, null, options?.isBetaTester || false, options?.isAdmin || false]
  )

  const user = result.rows[0]

  // Create JWT token (must include is_beta_tester for requireBetaAccess)
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar_url: user.avatar_url,
      is_beta_tester: user.is_beta_tester || false,
      is_admin: user.is_admin || false,
    },
    JWT_SECRET,
    { expiresIn: '1d' }
  )

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    token,
    cookieName: COOKIE_NAME,
  }
}
```

- [ ] **Step 2: Verify existing tests still compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "test-utils|createTestUser" | head`
Expected: no new errors related to `createTestUser` (existing call sites use only `isBetaTester` which remains optional and additive).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/test-utils.ts
git commit -m "test: add isAdmin option to createTestUser

Required for the upcoming CPM full UI e2e test — the host must be admin
to bypass the FOP check and see the Competitive toggle on /draft."
```

---

## Task 2: Add `data-testid` markers to PlayerSeat

**Files:**
- Modify: `src/components/PlayerSeat.tsx` (lines around 64 and 78)

**Why:** Tests need to look up a player's seat number from the lobby UI to verify Round 1 opposite-seat pairing. The current rendering exposes seat number as raw text inside the avatar div, with no stable selector.

- [ ] **Step 1: Add `data-testid` to both the empty and filled seat wrappers**

In `src/components/PlayerSeat.tsx`, find the empty-seat block (around line 64):

```tsx
return (
  <div className="player-seat empty">
    <div className="seat-avatar empty-avatar">
      <span>{seatNumber}</span>
    </div>
    <div className="seat-name">Empty</div>
  </div>
)
```

Change the outer `<div>` to:

```tsx
<div className="player-seat empty" data-testid={`player-seat-${seatNumber}`} data-seat-number={seatNumber}>
```

Find the filled-seat block (around line 78):

```tsx
<div className={`player-seat ${isCurrentUser ? 'current-user' : ''}`}>
```

Change to:

```tsx
<div className={`player-seat ${isCurrentUser ? 'current-user' : ''}`} data-testid={`player-seat-${seatNumber}`} data-seat-number={seatNumber} data-player-id={player?.id || ''} data-username={player?.username || ''}>
```

- [ ] **Step 2: Verify the page still type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "PlayerSeat" | head`
Expected: no errors. (`data-*` attributes are valid HTML and TypeScript accepts them.)

- [ ] **Step 3: Commit**

```bash
git add src/components/PlayerSeat.tsx
git commit -m "test: add data-testid + data-seat-number + data-player-id to PlayerSeat

Stable selectors so e2e tests can map players to seat numbers without
scraping CSS class internals."
```

---

## Task 3: Add `data-testid` markers to MatchCard

**Files:**
- Modify: `src/components/MatchCard.tsx`

**Why:** The test needs to (a) find a specific match card by id, (b) read its current status (In Progress / Awaiting Confirmation / Complete / Bye), and (c) read each player's name without ambiguity. Boot buttons and report buttons also need stable hooks.

- [ ] **Step 1: Add data attributes to the outer card and to each player slot**

In `src/components/MatchCard.tsx`, replace the `<div className={...}>` outer wrapper (around line 60) with:

```tsx
<div
  className={`match-card${isMyMatch ? ' match-card--mine' : ''}${match.finalConfirmed ? ' match-card--confirmed' : ''}`}
  data-testid={`match-card-${match.id}`}
  data-match-id={match.id}
  data-match-status={status}
  data-final-confirmed={match.finalConfirmed ? 'true' : 'false'}
  data-match-winner={match.matchWinner || ''}
  data-is-bye={match.isBye ? 'true' : 'false'}
  data-player1-id={match.player1?.id || ''}
  data-player2-id={match.player2?.id || ''}
>
```

- [ ] **Step 2: Add `data-testid` to the Report Result button**

Find the Report Result Button (around line 127) and replace it with a wrapping div that has the testid (Button itself doesn't accept arbitrary HTML attrs cleanly):

```tsx
{canReport && (
  <span data-testid={`match-report-button-${match.id}`}>
    <Button variant="primary" size="sm" onClick={() => onReport(match.id)}>
      Report Result
    </Button>
  </span>
)}
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "MatchCard" | head`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/MatchCard.tsx
git commit -m "test: add data-testid + match metadata attrs to MatchCard

E2e tests can now look up a match card by id, assert its status,
and click its Report button without selector scraping."
```

---

## Task 4: Add `data-testid` markers to MatchmakingPanel

**Files:**
- Modify: `src/components/MatchmakingPanel.tsx`

**Why:** The test needs to: assert overall matchmaking state (deck_building / active / complete), read the current round, click round tabs and the Results tab, and verify standings.

- [ ] **Step 1: Add data attributes to the outer panel**

In `src/components/MatchmakingPanel.tsx`, find the outer return (around line 144) and replace:

```tsx
<div className="matchmaking-panel">
```

with:

```tsx
<div
  className="matchmaking-panel"
  data-testid="matchmaking-panel"
  data-matchmaking-status={matchmakingStatus}
  data-current-round={currentRound}
  data-active-tab={activeTab}
>
```

- [ ] **Step 2: Add `data-testid` to each round tab and to the Results tab**

Find the tab-render block (around line 179):

```tsx
{tabs.map(tab => (
  <button
    key={tab.key}
    className={`matchmaking-tab${activeTab === tab.key ? ' matchmaking-tab--active' : ''}`}
    onClick={() => setActiveTab(tab.key)}
  >
    {tab.label}
  </button>
))}
```

Replace with:

```tsx
{tabs.map(tab => (
  <button
    key={tab.key}
    className={`matchmaking-tab${activeTab === tab.key ? ' matchmaking-tab--active' : ''}`}
    onClick={() => setActiveTab(tab.key)}
    data-testid={`matchmaking-tab-${tab.key}`}
  >
    {tab.label}
  </button>
))}
```

- [ ] **Step 3: Add `data-testid` to the standings list rows**

Find the standings render (around line 198):

```tsx
{standings.map((player, i) => (
  <li key={player.id} className={`matchmaking-standing-row${player.id === currentUserId ? ' matchmaking-standing-row--mine' : ''}`}>
    <span className="matchmaking-standing-rank">{i + 1}.</span>
    <span className="matchmaking-standing-name">{player.username}</span>
    <span className="matchmaking-standing-record">
      {player.wins}W-{player.losses}L{player.draws > 0 ? `-${player.draws}D` : ''}
    </span>
  </li>
))}
```

Replace with:

```tsx
{standings.map((player, i) => (
  <li
    key={player.id}
    className={`matchmaking-standing-row${player.id === currentUserId ? ' matchmaking-standing-row--mine' : ''}`}
    data-testid={`standing-row-${i + 1}`}
    data-player-id={player.id}
    data-rank={i + 1}
    data-wins={player.wins}
    data-losses={player.losses}
    data-draws={player.draws}
  >
    <span className="matchmaking-standing-rank">{i + 1}.</span>
    <span className="matchmaking-standing-name">{player.username}</span>
    <span className="matchmaking-standing-record">
      {player.wins}W-{player.losses}L{player.draws > 0 ? `-${player.draws}D` : ''}
    </span>
  </li>
))}
```

- [ ] **Step 4: Add `data-testid` to the "Start Round 1" button wrapper**

Find the start-button block (around line 168):

```tsx
{showStartButton && (
  <div className="matchmaking-host-controls">
    <Button variant="primary" glowColor="yellow" onClick={onStartMatches}>
      Start Round 1
    </Button>
  </div>
)}
```

Replace with:

```tsx
{showStartButton && (
  <div className="matchmaking-host-controls" data-testid="start-matches-button-container">
    <Button variant="primary" glowColor="yellow" onClick={onStartMatches}>
      Start Round 1
    </Button>
  </div>
)}
```

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "MatchmakingPanel" | head`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/MatchmakingPanel.tsx
git commit -m "test: add data-testid + matchmaking metadata attrs to MatchmakingPanel

Stable selectors for tabs, standings rows, the Start button, and an
overall data-matchmaking-status hook."
```

---

## Task 5: Add `data-testid` markers to ResultReportModal

**Files:**
- Modify: `src/components/ResultReportModal.tsx`

**Why:** The test needs to address each game's three radio buttons (player1 / draw / player2) by game number, and find the Submit button reliably.

- [ ] **Step 1: Add `data-testid` to each `GameRow` and to its three buttons**

In `src/components/ResultReportModal.tsx`, replace the `GameRow` component (around line 111) with:

```tsx
function GameRow({ label, gameKey, player1Name, player2Name, value, onChange }: {
  label: string
  gameKey: 'game1' | 'game2' | 'game3'
  player1Name: string
  player2Name: string
  value: string | null
  onChange: (v: string) => void
}) {
  return (
    <div className="result-report-row" data-testid={`game-row-${gameKey}`} data-game-key={gameKey}>
      <span className="result-report-label">{label}</span>
      <div className="result-report-buttons">
        <button
          className={`result-report-btn${value === 'player1' ? ' result-report-btn--selected' : ''}`}
          onClick={() => onChange('player1')}
          type="button"
          data-testid={`game-${gameKey}-player1`}
        >
          {player1Name}
        </button>
        <button
          className={`result-report-btn result-report-btn--draw${value === 'draw' ? ' result-report-btn--selected' : ''}`}
          onClick={() => onChange('draw')}
          type="button"
          data-testid={`game-${gameKey}-draw`}
        >
          Draw
        </button>
        <button
          className={`result-report-btn${value === 'player2' ? ' result-report-btn--selected' : ''}`}
          onClick={() => onChange('player2')}
          type="button"
          data-testid={`game-${gameKey}-player2`}
        >
          {player2Name}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update the three `GameRow` call sites to pass `gameKey`**

Find the three `<GameRow ... />` usages (around lines 73, 80, 88) and add the `gameKey` prop:

```tsx
<GameRow
  label="Game 1"
  gameKey="game1"
  player1Name={player1Name}
  player2Name={player2Name}
  value={game1}
  onChange={setGame1}
/>
<GameRow
  label="Game 2"
  gameKey="game2"
  player1Name={player1Name}
  player2Name={player2Name}
  value={game2}
  onChange={setGame2}
/>
{showGame3 && (
  <GameRow
    label="Game 3"
    gameKey="game3"
    player1Name={player1Name}
    player2Name={player2Name}
    value={game3}
    onChange={setGame3}
  />
)}
```

- [ ] **Step 3: Add `data-testid` on the modal wrapper and the Submit button wrapper**

Find the `<Modal>` opening (around line 70) and add:

```tsx
<Modal isOpen onClose={onClose} title={title} showCloseButton>
  <Modal.Body>
    <div className="result-report-games" data-testid="result-report-modal">
```

Find the Submit Button (around line 105) and wrap with a span:

```tsx
<Modal.Actions>
  <Button variant="secondary" onClick={onClose}>Cancel</Button>
  <span data-testid="result-report-submit">
    <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>Submit</Button>
  </span>
</Modal.Actions>
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ResultReportModal" | head`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ResultReportModal.tsx
git commit -m "test: add data-testid markers to ResultReportModal game rows and buttons

E2e tests can now click the player1/draw/player2 button for any game
deterministically by data-testid."
```

---

## Task 6: Create the test file scaffold

**Files:**
- Create: `tests/e2e/competitive-cpm-full.spec.ts`

**Why:** Stand up the file with the test harness pieces (browser launch, 8 contexts, cleanup) and a placeholder `test(...)` body. Lets later tasks add behavior incrementally on a runnable scaffold.

- [ ] **Step 1: Write the scaffold**

Create `tests/e2e/competitive-cpm-full.spec.ts` with:

```typescript
// tests/e2e/competitive-cpm-full.spec.ts
// @ts-nocheck
//
// Full UI-driven e2e test for Competitive Practice Mode (CPM).
// 8 real browser contexts. Every user action — draft creation, joining,
// picking cards, building decks, reporting matches — is a UI click.
// No fetch() calls to app API routes. No DB writes that simulate user
// actions (user creation and cleanup excepted).
//
// Spec: docs/superpowers/specs/2026-04-14-cpm-full-ui-e2e-design.md
//
// Run: npm run test:e2e -- --grep "8-player CPM"
// Override seed: CPM_SEED=12345 npm run test:e2e -- --grep "8-player CPM"
//
// Runtime: 30-90 minutes. This is intentional — the test exercises real
// timers, real socket sync, and real UI transitions across 8 tabs.
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const NUM_PLAYERS = 8
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_cpm_${Date.now()}`
const SEED = Number(process.env.CPM_SEED) || 42

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (long-running integration test)'
)
test.setTimeout(5_400_000) // 90 minutes

// ── Mulberry32 seeded PRNG ──────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test.describe('8-player CPM full UI flow', () => {
  let browser: Browser
  let contexts: BrowserContext[] = []
  let pages: Page[] = []
  let users: any[] = []
  let shareId: string | null = null
  let poolShareIds: (string | null)[] = []
  const rng = mulberry32(SEED)

  // Map seat number (1..8) → page index, populated after seats are read from lobby
  let seatToPageIdx = new Map<number, number>()

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(60)}`)
    console.log('Starting 8-Player CPM Full UI E2E Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`Seed: ${SEED}`)
    console.log(`${'='.repeat(60)}\n`)

    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false' ? true : false,
      slowMo: 50,
    })

    for (let i = 0; i < NUM_PLAYERS; i++) {
      // Player 0 is host — needs is_admin to bypass FOP check + show the Competitive toggle
      const isHost = i === 0
      const userData = await createTestUser(`CpmP${i + 1}`, TEST_ID, {
        isBetaTester: true,
        isAdmin: isHost,
      })
      users.push(userData)

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      })
      contexts.push(context)

      const urlObj = new URL(BASE_URL)
      const cookieConfig: any = {
        name: userData.cookieName,
        value: userData.token,
        httpOnly: true,
        sameSite: 'Lax',
      }
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        cookieConfig.url = BASE_URL
      } else {
        cookieConfig.domain = urlObj.hostname
        cookieConfig.path = '/'
      }
      await context.addCookies([cookieConfig])

      const page = await context.newPage()
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.log(`  [P${i + 1} Error]:`, msg.text().slice(0, 120))
        }
      })
      pages.push(page)
      poolShareIds.push(null)
      console.log(`  ✓ Created: ${userData.user.username} (admin=${isHost})`)
    }

    console.log(`\n✓ All ${NUM_PLAYERS} test users ready\n`)
  })

  test.afterAll(async () => {
    console.log('\nCleaning up...')
    try {
      await cleanupTestUsers(TEST_ID)
    } catch (e: any) {
      console.error('Cleanup error:', e.message)
    }
    await closeDb()
    for (const context of contexts) {
      await context.close()
    }
    if (browser) {
      await browser.close()
    }
  })

  test('8-player CPM: create → draft → build decks → 3 rounds of BO3 → final standings', async () => {
    // Phases will be filled in by subsequent tasks.
    // For now, just sanity-check the harness.
    expect(pages.length).toBe(NUM_PLAYERS)
    expect(users.length).toBe(NUM_PLAYERS)
  })
})
```

- [ ] **Step 2: Run the scaffold to confirm the harness boots**

Run (in a separate terminal start the dev server first: `npm run dev`):

```bash
HEADLESS=true npm run test:e2e -- --grep "8-player CPM"
```

Expected: test passes (the only assertions are `expect(pages.length).toBe(8)` and the same for users). 8 users get created and cleaned up. Browser opens and closes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/competitive-cpm-full.spec.ts
git commit -m "test: scaffold full UI e2e test for CPM

8 browser contexts, seeded PRNG, no test body yet.
Harness boots, users create + clean up. Test phases added in
follow-up commits."
```

---

## Task 7: Phase 2 — Draft creation and join (UI-driven)

**Files:**
- Modify: `tests/e2e/competitive-cpm-full.spec.ts` (test body)

**Why:** Player 1 creates the competitive draft via the UI toggle on `/draft`, then players 2–8 navigate to the share URL and auto-join.

- [ ] **Step 1: Replace the test body with the Phase 2 implementation**

In `tests/e2e/competitive-cpm-full.spec.ts`, replace the `test('8-player CPM: ...', async () => { ... })` body with:

```typescript
test('8-player CPM: create → draft → build decks → 3 rounds of BO3 → final standings', async () => {
  // ── Phase 2: Draft creation and join ────────────────────────────────────
  console.log('\n--- PHASE 2: Draft creation and join ---')

  // Player 1 (host, admin) navigates to /draft and toggles Competitive
  await pages[0].goto(`${BASE_URL}/draft`)
  await pages[0].waitForLoadState('networkidle')

  // Toggle Competitive (only visible to patrons/admins)
  const competitiveToggle = pages[0].locator('button.setting-lock', { hasText: 'Standard' })
  await expect(competitiveToggle).toBeVisible({ timeout: 10000 })
  await competitiveToggle.click()
  await expect(pages[0].locator('button.setting-lock', { hasText: 'Competitive' })).toBeVisible()
  console.log('  ✓ Host toggled Competitive on /draft')

  // Click Create Draft
  await pages[0].click('.create-draft-button, button:has-text("Create Draft")')

  // SetSelection page should now appear
  await pages[0].waitForSelector('.set-selection, .sets-grid', { timeout: 15000 })

  // Pick the first set
  await pages[0].locator('.sets-grid .set-card').first().click()

  // Wait for redirect to /draft/[shareId]
  await pages[0].waitForFunction(() => {
    const url = window.location.pathname
    return url.startsWith('/draft/') && !url.includes('/draft/new')
  }, { timeout: 30000 })

  shareId = pages[0].url().split('/draft/')[1]?.split('?')[0] || null
  expect(shareId).not.toBeNull()
  console.log(`  ✓ Competitive draft created: ${shareId}`)

  // Confirm the COMPETITIVE badge is visible on the host's page
  await expect(pages[0].locator('text=COMPETITIVE').first()).toBeVisible({ timeout: 10000 })

  // Players 2–8 join via share URL
  for (let i = 1; i < NUM_PLAYERS; i++) {
    await pages[i].goto(`${BASE_URL}/draft/${shareId}`)
    await pages[i].waitForSelector('.draft-room, .draft-lobby', { timeout: 15000 })
    console.log(`  ✓ Player ${i + 1} navigated`)
  }

  // Wait for all 8 to be present (poll the host's player count)
  let attempts = 0
  while (attempts < 120) {
    const playerCountText = await pages[0].locator('.player-count').textContent().catch(() => '') || ''
    const match = playerCountText.match(/(\d+)\s*\/\s*(\d+)/)
    if (match && parseInt(match[1]) >= NUM_PLAYERS) {
      console.log(`  ✓ All ${NUM_PLAYERS} players joined`)
      break
    }
    await pages[0].waitForTimeout(500)
    attempts++
  }
  expect(attempts).toBeLessThan(120)

  // Capture seat → page-index map from the host's lobby DOM
  // Each filled seat has data-seat-number + data-username, and the page
  // index for a user is the index in `users` whose username matches.
  for (let i = 0; i < NUM_PLAYERS; i++) {
    const username = users[i].user.username
    const seatEl = pages[0].locator(`[data-username="${username}"]`).first()
    const seatNumberStr = await seatEl.getAttribute('data-seat-number')
    if (!seatNumberStr) throw new Error(`No seat number found for user ${username}`)
    const seatNumber = parseInt(seatNumberStr)
    seatToPageIdx.set(seatNumber, i)
    console.log(`    Seat ${seatNumber} → ${username} (page ${i})`)
  }
  expect(seatToPageIdx.size).toBe(NUM_PLAYERS)
})
```

- [ ] **Step 2: Run the test**

Run: `HEADLESS=true npm run test:e2e -- --grep "8-player CPM"`

Expected: PASS. Logs show competitive toggle clicked, draft created, all 8 joined, seat→page map filled with 8 entries.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/competitive-cpm-full.spec.ts
git commit -m "test: Phase 2 — competitive draft creation and 8-player join via UI

Host toggles Competitive on /draft, creates draft, 7 players join via
share URL. Seat→page map populated from data-seat-number attributes."
```

---

## Task 8: Phase 3 — Competitive draft (UI-driven)

**Files:**
- Modify: `tests/e2e/competitive-cpm-full.spec.ts`

**Why:** Drive all 8 pages through the leader draft and pack draft, clicking a card on each page for each pick. Verify the inter-pack 30-second review period appears.

- [ ] **Step 1: Append helper functions inside the `describe` block, above the test**

Add these helpers inside `test.describe('8-player CPM full UI flow', () => { ... })`, before the `test(...)` block:

```typescript
async function waitForAllPlayersReady(selector: string, threshold = 0.9): Promise<void> {
  const target = Math.ceil(NUM_PLAYERS * threshold)
  let attempts = 0
  while (attempts < 120) {
    const counts = await Promise.all(
      pages.map((page) => page.locator(selector).count().catch(() => 0))
    )
    const ready = counts.filter((c) => c > 0).length
    if (ready >= target) return
    await pages[0].waitForTimeout(500)
    attempts++
  }
  throw new Error(`Timeout waiting for ${selector} on at least ${target}/${NUM_PLAYERS} pages`)
}

async function selectCardForAllPlayers(gridSelector: string): Promise<void> {
  await Promise.all(
    pages.map(async (page) => {
      try {
        const hasSelected = await page.locator(`${gridSelector} .draftable-card.selected`).count() > 0
        if (hasSelected) return
        const cards = await page.locator(`${gridSelector} .draftable-card:not(.selected):not(.dimmed)`).all()
        if (cards.length > 0) {
          await cards[0].click()
          await page.waitForTimeout(100)
        }
      } catch {
        // Player might be transitioning; safe to skip — timer auto-pick is fallback
      }
    })
  )
}
```

- [ ] **Step 2: Append Phase 3 to the test body (after Phase 2 block)**

```typescript
  // ── Phase 3: Competitive draft (leader + 3 packs, UI clicks) ────────────
  console.log('\n--- PHASE 3: Competitive draft ---')

  // Host clicks Start Draft
  const startButton = pages[0].locator('button:has-text("Start Draft")')
  await expect(startButton).toBeEnabled({ timeout: 15000 })
  await startButton.click()
  await pages[0].waitForSelector('.leader-draft-phase', { timeout: 30000 })
  console.log('  ✓ Draft started — leader draft phase')

  // Leader draft: 3 rounds
  for (let round = 1; round <= 3; round++) {
    console.log(`  Leader round ${round}/3:`)
    await waitForAllPlayersReady('.leaders-grid .draftable-card')
    await selectCardForAllPlayers('.leaders-grid')

    if (round < 3) {
      // Wait for all pages to advance to the next leader round (text "Leader Round N+1")
      const nextRoundLabel = `Leader Round ${round + 1}`
      let attempts = 0
      while (attempts < 120) {
        const advanced = await Promise.all(
          pages.map((p) => p.locator(`.draft-round-info`, { hasText: nextRoundLabel }).count().catch(() => 0))
        )
        if (advanced.filter((c) => c > 0).length >= NUM_PLAYERS * 0.9) break
        await pages[0].waitForTimeout(500)
        attempts++
      }
    }
  }

  // Pack draft phase
  await Promise.race([
    pages[0].waitForSelector('.pack-draft-phase', { timeout: 60000 }),
    pages[0].waitForSelector('.review-period', { timeout: 60000 }),
  ])
  console.log('  ✓ Pack draft phase reached')

  for (let pack = 1; pack <= 3; pack++) {
    console.log(`  Pack ${pack}/3:`)

    // If we're in the inter-pack review period, wait it out (also assert it for pack 2 & 3)
    if (pack > 1) {
      // Verify the 30-second review UI is visible on at least the host page
      await expect(pages[0].locator('.review-period h3', { hasText: 'Review Your Cards' }))
        .toBeVisible({ timeout: 60000 })
      console.log(`    ✓ Inter-pack review period visible before pack ${pack}`)
      // Wait for it to finish (review-period element disappears)
      await pages[0].waitForSelector('.review-period', { state: 'detached', timeout: 60000 })
        .catch(() => null)
      await pages[0].waitForSelector('.pack-grid .draftable-card', { timeout: 60000 })
    }

    for (let pick = 1; pick <= 14; pick++) {
      process.stdout.write(`    Pick ${pick}/14...`)
      await waitForAllPlayersReady('.pack-grid .draftable-card')
      await selectCardForAllPlayers('.pack-grid')

      if (!(pack === 3 && pick === 14)) {
        // Wait for new cards to appear (pack passed) OR for review period to start
        let attempts = 0
        while (attempts < 60) {
          const passed = await Promise.all(
            pages.map(async (p) => {
              const cards = await p.locator('.pack-grid .draftable-card:not(.selected)').count().catch(() => 0)
              const inReview = await p.locator('.review-period').count().catch(() => 0)
              const skeleton = await p.locator('.skeleton-card, .passing-message').count().catch(() => 0)
              return cards > 0 || inReview > 0 || skeleton > 0
            })
          )
          if (passed.filter(Boolean).length >= NUM_PLAYERS * 0.75) break
          await pages[0].waitForTimeout(500)
          attempts++
        }
      }
      console.log(' ✓')
    }

    console.log(`  ✓ Pack ${pack} complete`)
  }

  // Wait for draft to finish — host page should redirect to /pool/[poolShareId]
  console.log('  Waiting for draft completion / pool redirect...')
  for (let i = 0; i < NUM_PLAYERS; i++) {
    let attempts = 0
    while (attempts < 120) {
      const url = pages[i].url()
      if (url.includes('/pool/')) {
        const poolShareId = url.split('/pool/')[1]?.split(/[/?]/)[0] || null
        poolShareIds[i] = poolShareId
        console.log(`    P${i + 1} pool: ${poolShareId}`)
        break
      }
      await pages[i].waitForTimeout(1000)
      attempts++
    }
    expect(poolShareIds[i]).not.toBeNull()
  }
```

- [ ] **Step 3: Run the test**

Run: `HEADLESS=true npm run test:e2e -- --grep "8-player CPM"` (this will take a while — leader draft + pack draft).

Expected: PASS. All 8 pages reach `/pool/[poolShareId]`. Inter-pack review period assertion fires before packs 2 and 3. `poolShareIds` filled with 8 entries.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/competitive-cpm-full.spec.ts
git commit -m "test: Phase 3 — competitive leader + pack draft via UI clicks

All 8 pages click their first available card per pick. Inter-pack review
period is asserted visible. Test waits for redirect to pool URL."
```

---

## Task 9: Phase 4 — Deck building + Start Round 1 (UI-driven)

**Files:**
- Modify: `tests/e2e/competitive-cpm-full.spec.ts`

**Why:** Each player navigates the deck builder to the play page (deck-build phase isn't a "submit" button — navigating to play page IS the submit signal per the spec). Then host clicks "Start Round 1" on the matchmaking panel.

- [ ] **Step 1: Append Phase 4 to the test body**

```typescript
  // ── Phase 4: Deck building → navigate to play page → host starts round 1 ─
  console.log('\n--- PHASE 4: Deck building + start matchmaking ---')

  // Navigate each player to their play page (this signals "deck submitted")
  // Per spec: "All players have submitted a deck (navigated to play page)"
  for (let i = 0; i < NUM_PLAYERS; i++) {
    const poolShareId = poolShareIds[i]
    const playUrl = `${BASE_URL}/pool/${poolShareId}/deck/play`
    await pages[i].goto(playUrl)
    await pages[i].waitForLoadState('networkidle')
    console.log(`    P${i + 1} → ${playUrl}`)
  }

  // Wait for the MatchmakingPanel to render on the host's page
  await pages[0].waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 30000 })

  // Confirm matchmakingStatus = deck_building (no rounds yet)
  const initialStatus = await pages[0].locator('[data-testid="matchmaking-panel"]').getAttribute('data-matchmaking-status')
  expect(initialStatus).toBe('deck_building')

  // Host clicks "Start Round 1"
  await pages[0].waitForSelector('[data-testid="start-matches-button-container"]', { timeout: 15000 })
  await pages[0].locator('[data-testid="start-matches-button-container"] button').click()

  // Wait for matchmakingStatus to flip to 'active' on every page
  for (let i = 0; i < NUM_PLAYERS; i++) {
    await expect(async () => {
      const status = await pages[i].locator('[data-testid="matchmaking-panel"]').getAttribute('data-matchmaking-status')
      expect(status).toBe('active')
    }).toPass({ timeout: 30000 })
  }
  console.log('  ✓ Round 1 started, matchmaking active on all 8 pages')
```

- [ ] **Step 2: Run the test**

Run: `HEADLESS=true npm run test:e2e -- --grep "8-player CPM"`

Expected: PASS. All 8 reach the play page, host clicks Start Round 1, all 8 pages observe `data-matchmaking-status="active"`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/competitive-cpm-full.spec.ts
git commit -m "test: Phase 4 — deck-build navigation + host clicks Start Round 1

All 8 pages navigate to play page (signals deck submitted). Host clicks
Start Round 1, all 8 observe matchmaking flip to active."
```

---

## Task 10: Phase 5 — Round-by-round reporting (UI-driven, mutual confirmation)

**Files:**
- Modify: `tests/e2e/competitive-cpm-full.spec.ts`

**Why:** This is the heart of the test. For each of 3 rounds: read pairings from each page, assert pairing rules (Round 1 opposite-seat, Rounds 2–3 no rematches), randomly choose a winner per match using the seeded RNG, and have BOTH players in each match click through the report modal with matching results.

- [ ] **Step 1: Append helpers for pairing + reporting + game patterns**

Add inside the `describe` block, near the other helpers:

```typescript
type GameOutcome = 'player1' | 'player2' | 'draw'
type MatchOutcome = 'player1' | 'player2'  // No match-level draws — see note below
type Pattern = (GameOutcome | null)[]  // length 2 or 3

// NOTE: match-level draws (1-1-1) are intentionally excluded from this test.
// `ResultReportModal.canSubmit` requires `isDecided()` to be true, which means
// someone must have >= 2 game wins. A 1-1-1 draw has neither player at 2 wins
// and the Submit button stays disabled — there is no UI path to submit a
// match-level draw via mutual confirmation today. Per-game draws ARE valid
// as long as one player still reaches 2 game wins (e.g. draw-p1-p1).
//
// If the modal later supports submitting 1-1-1 draws, add 'draw' back to
// MatchOutcome and the corresponding pattern branch here.
function chooseGamePattern(rng: () => number): { outcome: MatchOutcome; pattern: Pattern } {
  // 50% p1, 50% p2
  const outcome: MatchOutcome = rng() < 0.5 ? 'player1' : 'player2'
  const winner = outcome
  const loser: GameOutcome = winner === 'player1' ? 'player2' : 'player1'

  // 60% 2-0, 30% 2-1 (no per-game draws), 10% 2-1 with a per-game draw
  const r = rng()
  if (r < 0.6) {
    // 2-0
    return { outcome, pattern: [winner, winner] }
  }
  if (r < 0.9) {
    // 2-1, no draws
    const orders: Pattern[] = [
      [loser, winner, winner],
      [winner, loser, winner],
      [winner, winner, loser],
    ]
    return { outcome, pattern: orders[Math.floor(rng() * orders.length)] }
  }
  // 2-1 with a per-game draw — winner still gets 2 game wins
  const orders: Pattern[] = [
    ['draw', winner, winner],
    [winner, 'draw', winner],
    [winner, winner, 'draw'],
  ]
  return { outcome, pattern: orders[Math.floor(rng() * orders.length)] }
}

interface UIPairing {
  matchId: string
  player1Id: string
  player2Id: string
  player1Username: string
  player2Username: string
  isBye: boolean
}

async function readPairingsFromPage(page: Page): Promise<UIPairing[]> {
  const cards = await page.locator('[data-testid^="match-card-"]').all()
  const out: UIPairing[] = []
  for (const card of cards) {
    const matchId = await card.getAttribute('data-match-id') || ''
    const isBye = (await card.getAttribute('data-is-bye')) === 'true'
    const p1Id = await card.getAttribute('data-player1-id') || ''
    const p2Id = await card.getAttribute('data-player2-id') || ''
    const names = await card.locator('.match-card-player-name').allTextContents()
    out.push({
      matchId,
      player1Id: p1Id,
      player2Id: p2Id,
      player1Username: names[0] || '',
      player2Username: names[1] || '',
      isBye,
    })
  }
  return out
}

async function reportResultViaUI(page: Page, matchId: string, pattern: Pattern): Promise<void> {
  // Click the Report Result button on the specific match card
  await page.locator(`[data-testid="match-report-button-${matchId}"] button`).click()
  // Wait for the modal
  await page.waitForSelector('[data-testid="result-report-modal"]', { timeout: 10000 })

  // Click G1
  if (pattern[0]) {
    await page.locator(`[data-testid="game-game1-${pattern[0]}"]`).click()
  }
  // Click G2
  if (pattern[1]) {
    await page.locator(`[data-testid="game-game2-${pattern[1]}"]`).click()
  }
  // Click G3 if present (modal only shows G3 row when needed)
  if (pattern[2]) {
    // Wait for game3 row to appear
    await page.waitForSelector('[data-testid="game-row-game3"]', { timeout: 5000 })
    await page.locator(`[data-testid="game-game3-${pattern[2]}"]`).click()
  }

  // Submit
  await page.locator('[data-testid="result-report-submit"] button').click()

  // Wait for modal to close
  await page.waitForSelector('[data-testid="result-report-modal"]', { state: 'detached', timeout: 10000 })
}
```

- [ ] **Step 2: Append Phase 5 to the test body**

```typescript
  // ── Phase 5: Three rounds of matchmaking ────────────────────────────────
  console.log('\n--- PHASE 5: Three rounds of matchmaking ---')

  // Track all pairings across rounds for no-rematch verification
  const allPairings: UIPairing[][] = [] // index = round - 1

  for (let roundNum = 1; roundNum <= 3; roundNum++) {
    console.log(`\n  === Round ${roundNum} ===`)

    // Wait for the current round's tab to be active and matches to render on host page
    await pages[0].waitForSelector(`[data-testid="match-card-"]`, { timeout: 30000 }).catch(() => null)
    await expect(async () => {
      const cur = await pages[0].locator('[data-testid="matchmaking-panel"]').getAttribute('data-current-round')
      expect(parseInt(cur || '0')).toBe(roundNum)
    }).toPass({ timeout: 30000 })

    // Click the round tab on each page to make this round's matches visible
    for (let i = 0; i < NUM_PLAYERS; i++) {
      await pages[i].locator(`[data-testid="matchmaking-tab-round-${roundNum}"]`).click()
      await pages[i].waitForSelector(`[data-testid^="match-card-"]`, { timeout: 15000 })
    }

    // Read pairings from the host's view (single source of truth)
    const pairings = await readPairingsFromPage(pages[0])
    allPairings.push(pairings)
    console.log(`    Round ${roundNum} pairings:`)
    for (const p of pairings) {
      if (p.isBye) {
        console.log(`      ${p.player1Username}: BYE`)
      } else {
        console.log(`      ${p.player1Username} vs ${p.player2Username}`)
      }
    }

    // Round 1: assert opposite-seat pairing (1v5, 2v6, 3v7, 4v8)
    if (roundNum === 1) {
      const expected = [[1, 5], [2, 6], [3, 7], [4, 8]]
      for (const [seatA, seatB] of expected) {
        const userA = users[seatToPageIdx.get(seatA)!]
        const userB = users[seatToPageIdx.get(seatB)!]
        const found = pairings.some((p) =>
          (p.player1Id === userA.user.id && p.player2Id === userB.user.id) ||
          (p.player1Id === userB.user.id && p.player2Id === userA.user.id)
        )
        expect(found, `Round 1 should pair seat ${seatA} with seat ${seatB}`).toBe(true)
      }
      console.log('    ✓ Round 1 opposite-seat pairing verified')
    }

    // Rounds 2 & 3: assert no rematches against any prior round
    if (roundNum > 1) {
      const priorOpponents = new Map<string, Set<string>>()
      for (const prior of allPairings.slice(0, roundNum - 1)) {
        for (const p of prior) {
          if (p.isBye) continue
          if (!priorOpponents.has(p.player1Id)) priorOpponents.set(p.player1Id, new Set())
          if (!priorOpponents.has(p.player2Id)) priorOpponents.set(p.player2Id, new Set())
          priorOpponents.get(p.player1Id)!.add(p.player2Id)
          priorOpponents.get(p.player2Id)!.add(p.player1Id)
        }
      }
      for (const p of pairings) {
        if (p.isBye) continue
        const aPrior = priorOpponents.get(p.player1Id) || new Set()
        expect(aPrior.has(p.player2Id),
          `Round ${roundNum} rematch: ${p.player1Username} already played ${p.player2Username}`).toBe(false)
      }
      console.log(`    ✓ Round ${roundNum} no-rematch verified`)
    }

    // Report each non-bye match — both players click through the modal with matching results
    for (const pairing of pairings) {
      if (pairing.isBye) {
        console.log(`      Skipping bye for ${pairing.player1Username}`)
        continue
      }
      const { outcome, pattern } = chooseGamePattern(rng)
      console.log(`      ${pairing.player1Username} vs ${pairing.player2Username}: pattern=[${pattern.join(',')}] → ${outcome}`)

      // Find the page indices for player1 and player2
      const p1PageIdx = users.findIndex((u) => u.user.id === pairing.player1Id)
      const p2PageIdx = users.findIndex((u) => u.user.id === pairing.player2Id)
      expect(p1PageIdx).toBeGreaterThanOrEqual(0)
      expect(p2PageIdx).toBeGreaterThanOrEqual(0)

      // Both players must be on the round tab to see the match card
      await pages[p1PageIdx].locator(`[data-testid="matchmaking-tab-round-${roundNum}"]`).click()
      await pages[p2PageIdx].locator(`[data-testid="matchmaking-tab-round-${roundNum}"]`).click()

      // Player 1 reports
      await reportResultViaUI(pages[p1PageIdx], pairing.matchId, pattern)
      // Player 2 reports the same pattern (mutual confirmation)
      await reportResultViaUI(pages[p2PageIdx], pairing.matchId, pattern)

      // Wait for the match to be marked as confirmed on the host page
      await expect(async () => {
        const confirmed = await pages[0].locator(`[data-testid="match-card-${pairing.matchId}"]`).getAttribute('data-final-confirmed')
        expect(confirmed).toBe('true')
      }).toPass({ timeout: 15000 })

      // Verify the winner matches the chosen outcome
      const winnerAttr = await pages[0].locator(`[data-testid="match-card-${pairing.matchId}"]`).getAttribute('data-match-winner')
      expect(winnerAttr).toBe(outcome)
    }

    console.log(`    ✓ Round ${roundNum} all matches reported and confirmed`)

    // Auto-advance: wait for the next round to appear (or for matchmakingStatus = complete on round 3)
    if (roundNum < 3) {
      for (let i = 0; i < NUM_PLAYERS; i++) {
        await expect(async () => {
          const cur = await pages[i].locator('[data-testid="matchmaking-panel"]').getAttribute('data-current-round')
          expect(parseInt(cur || '0')).toBe(roundNum + 1)
        }).toPass({ timeout: 30000 })
      }
      console.log(`    ✓ Auto-advanced to round ${roundNum + 1}`)
    } else {
      for (let i = 0; i < NUM_PLAYERS; i++) {
        await expect(async () => {
          const status = await pages[i].locator('[data-testid="matchmaking-panel"]').getAttribute('data-matchmaking-status')
          expect(status).toBe('complete')
        }).toPass({ timeout: 30000 })
      }
      console.log('    ✓ Matchmaking complete after round 3')
    }
  }
```

- [ ] **Step 3: Run the test (long — full draft + 3 rounds)**

Run: `HEADLESS=true npm run test:e2e -- --grep "8-player CPM"`

Expected: PASS. All 3 rounds complete with mutual confirmation, opposite-seat pairing verified for round 1, no rematches in rounds 2–3, every match confirmed and winner matches the chosen outcome, matchmaking auto-advances and ends with `matchmakingStatus=complete`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/competitive-cpm-full.spec.ts
git commit -m "test: Phase 5 — 3 rounds of UI-driven mutual-confirmation reporting

Both players in each match click through the ResultReportModal with
matching results, asserting opposite-seat pairing in round 1, no
rematches in rounds 2-3, and auto-advance after each round."
```

---

## Task 11: Phase 6 — Final standings assertion (UI-driven)

**Files:**
- Modify: `tests/e2e/competitive-cpm-full.spec.ts`

**Why:** After round 3 completes, every page should be able to navigate to the Results tab and show 8 ranked players with W-L records consistent with the recorded match outcomes.

- [ ] **Step 1: Append Phase 6 to the test body**

```typescript
  // ── Phase 6: Final standings ────────────────────────────────────────────
  console.log('\n--- PHASE 6: Final standings ---')

  // Compute expected W/L/D for each player from allPairings + the actual
  // recorded winners on the match cards (read from the host page).
  const expected: Record<string, { wins: number; losses: number; draws: number }> = {}
  for (const u of users) expected[u.user.id] = { wins: 0, losses: 0, draws: 0 }
  for (const round of allPairings) {
    for (const p of round) {
      if (p.isBye) {
        expected[p.player1Id].wins += 1
        continue
      }
      const winner = await pages[0].locator(`[data-testid="match-card-${p.matchId}"]`).getAttribute('data-match-winner')
      if (winner === 'player1') {
        expected[p.player1Id].wins += 1
        expected[p.player2Id].losses += 1
      } else if (winner === 'player2') {
        expected[p.player2Id].wins += 1
        expected[p.player1Id].losses += 1
      } else if (winner === 'draw') {
        expected[p.player1Id].draws += 1
        expected[p.player2Id].draws += 1
      }
    }
  }

  // Each player navigates to the Results tab and verifies standings consistency
  for (let i = 0; i < NUM_PLAYERS; i++) {
    await pages[i].locator('[data-testid="matchmaking-tab-results"]').click()
    // Wait for at least one standings row
    await pages[i].waitForSelector('[data-testid^="standing-row-"]', { timeout: 15000 })

    const rows = await pages[i].locator('[data-testid^="standing-row-"]').all()
    expect(rows.length, `P${i + 1} should see 8 standings rows`).toBe(NUM_PLAYERS)

    // Build observed W/L/D for each player from this page's standings
    const observed: Record<string, { wins: number; losses: number; draws: number; rank: number }> = {}
    for (const row of rows) {
      const playerId = await row.getAttribute('data-player-id') || ''
      const rank = parseInt(await row.getAttribute('data-rank') || '0')
      const wins = parseInt(await row.getAttribute('data-wins') || '0')
      const losses = parseInt(await row.getAttribute('data-losses') || '0')
      const draws = parseInt(await row.getAttribute('data-draws') || '0')
      observed[playerId] = { wins, losses, draws, rank }
    }

    // Verify all 8 players appear with matching W/L/D
    for (const u of users) {
      const obs = observed[u.user.id]
      const exp = expected[u.user.id]
      expect(obs, `P${i + 1}: ${u.user.username} should appear in standings`).toBeDefined()
      expect(obs.wins, `P${i + 1}: ${u.user.username} wins`).toBe(exp.wins)
      expect(obs.losses, `P${i + 1}: ${u.user.username} losses`).toBe(exp.losses)
      expect(obs.draws, `P${i + 1}: ${u.user.username} draws`).toBe(exp.draws)
    }

    // Verify ranks are 1..8, each unique, and sorted by wins desc
    const ranks = Object.values(observed).map((o) => o.rank).sort((a, b) => a - b)
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8])

    const sortedByRank = Object.values(observed).sort((a, b) => a.rank - b.rank)
    for (let r = 0; r < sortedByRank.length - 1; r++) {
      expect(sortedByRank[r].wins,
        `P${i + 1}: rank ${r + 1} wins should be >= rank ${r + 2} wins`)
        .toBeGreaterThanOrEqual(sortedByRank[r + 1].wins)
    }
  }

  console.log('  ✓ All 8 pages show consistent 8-player standings')
  console.log('\n' + '='.repeat(60))
  console.log('✅ 8-PLAYER CPM E2E TEST PASSED')
  console.log('='.repeat(60) + '\n')
```

- [ ] **Step 2: Run the full test end-to-end**

Run: `HEADLESS=true npm run test:e2e -- --grep "8-player CPM"`

Expected: PASS. All 8 pages click the Results tab, see all 8 players ranked 1..8, W/L/D matches the actual recorded outcomes, and ranks are sorted by wins desc.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/competitive-cpm-full.spec.ts
git commit -m "test: Phase 6 — final standings assertion across all 8 pages

Each page clicks Results, observed W/L/D per player matches the actual
recorded match winners, ranks are 1..8 unique and sorted by wins desc."
```

---

## Task 12: Final cleanup — re-run, verify CI signal, build check

**Files:**
- None new

**Why:** After all phases are wired, do the standard pre-merge verification.

- [ ] **Step 1: Run the full test from a clean state**

```bash
HEADLESS=true npm run test:e2e -- --grep "8-player CPM"
```

Expected: PASS. Single test, 30–90 minutes.

- [ ] **Step 2: Run the existing competitive-bo3 test to ensure no regression**

```bash
npm run test:e2e -- --grep "Competitive Bo3"
```

Expected: All existing tests still pass. The added `data-testid` attributes are additive and shouldn't break anything.

- [ ] **Step 3: Run the build (per the project's pre-commit rule)**

```bash
npm run build
```

Expected: clean build. No type errors from the data-attribute additions.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no new lint errors.

- [ ] **Step 5: Final commit if anything was tweaked**

If steps 1–4 surfaced fixes, commit them now with a focused message. Otherwise, this task ends without an additional commit.

---

## Self-Review (run after the plan is written)

**Spec coverage:** Each requirement from `2026-04-14-cpm-full-ui-e2e-design.md` has a task:
- Setup (8 users, 8 contexts) → Tasks 1, 6
- Draft creation + join → Task 7
- Competitive draft picks + inter-pack review → Task 8
- Deck building + Start Round 1 → Task 9
- 3 rounds of mutual reporting + pairing assertions + auto-advance → Task 10
- Final standings → Task 11
- `data-testid` additions to make UI scrape-free → Tasks 2–5

**Placeholder scan:** No "TBD" / "TODO" / "fill in later" left in the plan.

**Type consistency:** `chooseGamePattern` returns `{ outcome, pattern }`; `reportResultViaUI` accepts the `Pattern` type; `readPairingsFromPage` returns `UIPairing[]`. Names are consistent across helpers.

**Type tweak in plan vs spec:** Spec mentioned needing a `data-testid` on the matchmaking-complete indicator. The plan covers this via `data-matchmaking-status="complete"` on the panel root (Task 4), which is what Phase 5/6 actually checks. Equivalent and cleaner.
