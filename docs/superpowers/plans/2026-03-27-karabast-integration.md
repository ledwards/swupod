# Karabast Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Wayfinder extension modal on PTP play pages that automates Karabast lobby creation/joining, then link game results bidirectionally between Karabast, Wayfinder, and PTP.

**Architecture:** A new content script (`content-ptp-play.ts`) injects a Shadow DOM modal on PTP play pages. When the user acts on the modal, it stores intent in `chrome.storage.local` and opens Karabast; `content-karabast.ts` reads the intent and dispatches a custom event to `inject-karabast.ts` (MAIN world) which drives the Karabast UI. Match results flow from Wayfinder back to PTP via the existing `PTP_SERVICE_KEY` server-to-server pattern. Much of the Wayfinder-side plumbing already exists — `ptpPoolShareId` is already captured and processed by ingestion; the main additions are the modal UI, the automation, the PTP write endpoints, and UI display.

**Tech Stack:** TypeScript, Next.js App Router (swupod), Chrome MV3 extension (wayfinder), Node.js built-in test runner (swupod tests), PostgreSQL via `queryRow`/`queryRows`/`query` (swupod) and `getDb()` postgres.js tagged template (wayfinder)

**Spec:** `docs/superpowers/specs/2026-03-27-karabast-integration-design.md`

---

## Existing infrastructure (DO NOT re-implement)

In **wayfinder**, these already exist and work:
- `ptpPoolShareId` captured from PTP deck URL fetch interception in `inject-karabast.ts`
- `ptpPoolShareId` included in capture payload in `content-karabast.ts`
- `ingestion.ts` already reads `ptpPoolShareId` and calls `linkMatchToPoolByShareId`
- L1 tables: `ptp_pools`, `ptp_draft_picks`, `ptp_built_decks`
- L2 promotion: `promotePtpDecksToL2` in `apps/web/src/server/ptp.ts`
- `game_pool_links` table and `createGamePoolLink` function
- Auth pattern: `PTP_SERVICE_KEY` Bearer token in `apps/web/src/server/ptp.ts`

In **swupod**, these already exist:
- `requireServiceKey(request)` in `lib/auth.ts` — checks `Authorization: Bearer <PTP_SERVICE_KEY>`
- `jsonResponse`, `errorResponse`, `handleApiError` in `lib/utils.ts`
- `queryRow`, `queryRows`, `query` in `lib/db`
- `SET_CONFIGS`, `getSetConfig`, `isReleased` in `src/utils/setConfigs/index.ts`

---

## Phase 1: Karabast Launch Modal

---

### Task 1: PTP Plugin API endpoint — play page metadata

**Repo:** swupod

**Files:**
- Create: `app/api/plugin/v1/play/[format]/[shareId]/route.ts`
- Create: `app/api/plugin/v1/play/[format]/[shareId]/route.test.ts`

This endpoint is called by `content-ptp-play.ts` on load to determine which Karabast Card Pool to pre-select (Current vs Unlimited). It handles three `format` values: `pool`, `pack-wars`, `pack-blitz`.

- [ ] **Step 1: Write the failing test**

```javascript
// app/api/plugin/v1/play/[format]/[shareId]/route.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getLatestReleasedSetCode } from '@/src/utils/setConfigs/latest'
import { SET_CONFIGS } from '@/src/utils/setConfigs/index'

describe('getLatestReleasedSetCode', () => {
  it('returns a set code string', () => {
    const code = getLatestReleasedSetCode()
    assert.ok(typeof code === 'string')
    assert.ok(code.length > 0)
  })

  it('is one of the known set codes', () => {
    const code = getLatestReleasedSetCode()
    assert.ok(Object.keys(SET_CONFIGS).includes(code),
      `Expected ${code} to be in SET_CONFIGS`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lee/Repos/ledwards/swupod
node --experimental-vm-modules -e "import('./app/api/plugin/v1/play/[format]/[shareId]/route.test.ts')" 2>&1 | head -20
# OR: node app/api/plugin/v1/play/\\[format\\]/\\[shareId\\]/route.test.ts
```
Expected: `Cannot find module` or similar — `latest.ts` doesn't exist yet.

- [ ] **Step 3: Create `src/utils/setConfigs/latest.ts`**

```typescript
// src/utils/setConfigs/latest.ts
import { SET_CONFIGS, isReleased } from './index'

/**
 * Returns the set code with the highest setNumber among all released sets.
 * Used to determine whether to use Karabast Card Pool "Current" or "Unlimited".
 */
export function getLatestReleasedSetCode(): string {
  const released = Object.values(SET_CONFIGS).filter(isReleased)
  if (released.length === 0) {
    // All sets are unreleased — return the highest setNumber anyway
    return Object.values(SET_CONFIGS)
      .sort((a, b) => b.setNumber - a.setNumber)[0].setCode as string
  }
  return released.sort((a, b) => b.setNumber - a.setNumber)[0].setCode as string
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test app/api/plugin/v1/play/\\[format\\]/\\[shareId\\]/route.test.ts
```
Expected: PASS

- [ ] **Step 5: Create the route**

```typescript
// app/api/plugin/v1/play/[format]/[shareId]/route.ts
// @ts-nocheck
// GET /api/plugin/v1/play/[format]/[shareId]
// Public endpoint called by Wayfinder extension on PTP play pages.
// Returns set code and card pool selection hint for the Karabast modal.
// Supported formats: pool, pack-wars, pack-blitz
import { queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { getLatestReleasedSetCode } from '@/src/utils/setConfigs/latest'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ format: string; shareId: string }>
}

const FORMAT_QUERIES: Record<string, { table: string; shareIdCol: string; setCodeCol: string }> = {
  pool: { table: 'card_pools', shareIdCol: 'share_id', setCodeCol: 'set_code' },
  'pack-wars': { table: 'pack_wars', shareIdCol: 'share_id', setCodeCol: 'set_code' },
  'pack-blitz': { table: 'pack_blitz', shareIdCol: 'share_id', setCodeCol: 'set_code' },
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { format, shareId } = await params

    const tableConfig = FORMAT_QUERIES[format]
    if (!tableConfig) {
      return errorResponse(`Unknown format: ${format}`, 400)
    }

    const row = await queryRow(
      `SELECT ${tableConfig.setCodeCol} as set_code
       FROM ${tableConfig.table}
       WHERE ${tableConfig.shareIdCol} = $1`,
      [shareId]
    )

    if (!row) {
      return errorResponse('Not found', 404)
    }

    const setCode = row.set_code as string
    const latestSetCode = getLatestReleasedSetCode()
    // A set code may be a comma-separated range (e.g. "SOR,SHD"). Use the last one.
    const primarySetCode = setCode.includes(',')
      ? setCode.split(',').pop()!.trim()
      : setCode

    return jsonResponse({
      setCode,
      format,
      isLatestSet: primarySetCode === latestSetCode,
      cardPool: primarySetCode === latestSetCode ? 'Current' : 'Unlimited',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
```

> **Note:** `pack_wars` and `pack-blitz` table names need to be verified — check the DB schema or existing routes in `app/api/formats/pack-wars/route.ts` and `app/api/formats/pack-blitz/route.ts` for the actual table names and share ID column. Update `FORMAT_QUERIES` accordingly.

- [ ] **Step 6: Commit**

```bash
git add src/utils/setConfigs/latest.ts app/api/plugin/v1/play/
git commit -m "feat: add plugin v1 play metadata endpoint and getLatestReleasedSetCode utility"
```

---

### Task 2: Extend Wayfinder manifest for PTP play pages

**Repo:** wayfinder

**Files:**
- Modify: `apps/extension-chrome/manifest.json`
- Modify: `packages/extension-shared/src/inject-karabast.ts` — extend fetch detection regex
- Modify: `apps/extension-safari/` — mirror manifest changes (find the equivalent file)

The extension already has `https://www.protectthepod.com/*` in `host_permissions`. We need to add a new content script entry for PTP play pages, and extend `inject-karabast.ts` to detect deck imports from pack-wars and pack-blitz URLs.

- [ ] **Step 1: Add content script entry to `apps/extension-chrome/manifest.json`**

In the `content_scripts` array, add after the existing Karabast entry:

```json
{
  "matches": [
    "https://www.protectthepod.com/pool/*/deck/play*",
    "https://www.protectthepod.com/formats/pack-wars/*/play*",
    "https://www.protectthepod.com/formats/pack-blitz/*/play*",
    "http://localhost:3000/pool/*/deck/play*",
    "http://localhost:3000/formats/pack-wars/*/play*",
    "http://localhost:3000/formats/pack-blitz/*/play*"
  ],
  "js": [
    "content-ptp-play.js"
  ],
  "run_at": "document_idle"
}
```

- [ ] **Step 2: Extend fetch detection in `inject-karabast.ts`**

Find the existing PTP fetch detection block (around line 236):

```typescript
// Detect PTP deck URLs in fetch requests (e.g. protectthepod.com pools)
if (url && /protectthepod\.com.*pools\/([a-zA-Z0-9_-]+)/i.test(url)) {
  const m = url.match(/pools\/([a-zA-Z0-9_-]+)/i);
  if (m) {
    window.dispatchEvent(new CustomEvent("__wf_ptp_deck", {
      detail: { shareId: m[1], url }
    }));
```

Extend it to also detect pack-wars and pack-blitz API endpoints:

```typescript
// Detect PTP deck URLs in fetch requests
// Handles: /api/pools/[shareId]/deck.json, /api/formats/pack-wars/[shareId], /api/formats/pack-blitz/[shareId]
const PTP_DECK_PATTERNS = [
  /protectthepod\.com.*\/pools\/([a-zA-Z0-9_-]+)/i,
  /protectthepod\.com.*\/pack-wars\/([a-zA-Z0-9_-]+)/i,
  /protectthepod\.com.*\/pack-blitz\/([a-zA-Z0-9_-]+)/i,
]
if (url) {
  for (const pattern of PTP_DECK_PATTERNS) {
    const m = url.match(pattern)
    if (m) {
      window.dispatchEvent(new CustomEvent("__wf_ptp_deck", {
        detail: { shareId: m[1], url }
      }))
      break
    }
  }
}
```

Replace the old single-pattern block with this multi-pattern block. Remove the old `if (url && /protectthepod\.com.*pools\/([a-zA-Z0-9_-]+)/i.test(url))` block entirely.

- [ ] **Step 3: Mirror manifest changes to Safari extension**

Find the Safari extension manifest (check `apps/extension-safari/`) and add the same PTP play page content script entry. The format may differ from Chrome MV3 — check the existing Safari manifest structure and follow its pattern.

- [ ] **Step 4: Commit**

```bash
cd /Users/lee/Repos/ledwards/wayfinder
git add apps/extension-chrome/manifest.json apps/extension-safari/ packages/extension-shared/src/inject-karabast.ts
git commit -m "feat: extend extension manifest and fetch detection for PTP play pages"
```

---

### Task 3: PTP intent — storage and dispatch to Karabast

**Repo:** wayfinder

**Files:**
- Create: `packages/extension-shared/src/shared/ptp-intent.ts` — intent type definition
- Modify: `packages/extension-shared/src/content-karabast.ts` — read intent on load, dispatch to MAIN world

When `content-ptp-play.ts` (Task 4) stores a karabast intent in `chrome.storage.local`, `content-karabast.ts` needs to read it on the Karabast page and forward it to `inject-karabast.ts` via a custom window event. Doing this in a separate task before the modal (Task 4) means we can verify the signal chain works before building the full modal.

- [ ] **Step 1: Create `packages/extension-shared/src/shared/ptp-intent.ts`**

```typescript
// packages/extension-shared/src/shared/ptp-intent.ts

export const PTP_INTENT_STORAGE_KEY = 'wf_karabast_intent'
export const PTP_INTENT_EVENT = '__wf_karabast_intent'

export type KarabastPrivacy = 'private' | 'public'
export type KarabastCardPool = 'Current' | 'Unlimited'

export type KarabastIntent = {
  ptpDeckUrl: string       // full PTP play page URL (window.location.href)
  ptpShareId: string       // extracted from URL path
  ptpFormat: string        // 'pool' | 'pack-wars' | 'pack-blitz'
  cardPool: KarabastCardPool
  privacy?: KarabastPrivacy  // present for Create lobby; absent for Join
  joinLobbyUrl?: string    // present for Join Private flow; absent for Create
}
```

- [ ] **Step 2: Extend `content-karabast.ts` to read and forward intent**

At the top of `content-karabast.ts`, import the intent key:

```typescript
import { PTP_INTENT_STORAGE_KEY, PTP_INTENT_EVENT } from './shared/ptp-intent'
```

Near the top of the file (after existing variable declarations, before the first event listener), add:

```typescript
// On Karabast load: read PTP intent from storage, dispatch to MAIN world inject script
;(async () => {
  const stored = await chrome.storage.local.get(PTP_INTENT_STORAGE_KEY)
  const intent = stored[PTP_INTENT_STORAGE_KEY]
  if (intent) {
    await chrome.storage.local.remove(PTP_INTENT_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(PTP_INTENT_EVENT, { detail: intent }))
    console.log('[Wayfinder] Dispatched PTP intent to MAIN world:', intent.ptpFormat)
  }
})()
```

Also: at the place where `ptpPoolShareId` is reset (near `deckUrl = null`), ensure the intent doesn't persist across re-opens. The `chrome.storage.local.remove` above already handles this.

- [ ] **Step 3: Commit**

```bash
git add packages/extension-shared/src/shared/ptp-intent.ts packages/extension-shared/src/content-karabast.ts
git commit -m "feat: add PTP intent type and forward from content script to MAIN world on Karabast load"
```

---

### Task 4: Karabast lobby automation in inject-karabast.ts

**Repo:** wayfinder

**Files:**
- Create: `packages/extension-shared/src/karabast-selectors.ts`
- Modify: `packages/extension-shared/src/inject-karabast.ts`

`inject-karabast.ts` runs in the MAIN world on karabast.net. It needs to listen for `__wf_karabast_intent` and automate the lobby creation UI.

- [ ] **Step 1: Create `packages/extension-shared/src/karabast-selectors.ts`**

These selectors are all Karabast UI element identifiers. If Karabast's UI changes, update this file only.

```typescript
// packages/extension-shared/src/karabast-selectors.ts
// All Karabast DOM selectors used for lobby creation automation.
// Update this file when Karabast UI changes — nowhere else needs to change.

export const SEL = {
  // New game / create lobby button (on the home/lobby list page)
  newGameBtn: 'button[data-testid="new-game-btn"], button:has-text("New Game"), button:has-text("Create Game")',

  // Deck type radio/checkbox: "New Deck" (vs saved deck)
  newDeckOption: 'input[value="newDeck"], label:has-text("New Deck") input',

  // Deck link input field (paste PTP URL here)
  deckLinkInput: 'input[placeholder*="deck"], input[name="deckLink"], input[data-testid="deck-link-input"]',

  // Import deck button
  importDeckBtn: 'button:has-text("Import"), button[data-testid="import-deck"]',

  // Format select (dropdown or radio group)
  formatLimited: 'option[value="limited"], input[value="limited"], label:has-text("Limited") input',

  // Card pool select
  cardPoolCurrent: 'option[value="current"], option[value="Current"], label:has-text("Current") input',
  cardPoolUnlimited: 'option[value="unlimited"], option[value="Unlimited"], label:has-text("Unlimited") input',

  // Privacy select
  privacyPrivate: 'option[value="private"], option[value="Private"], label:has-text("Private") input',
  privacyPublic: 'option[value="public"], option[value="Public"], label:has-text("Public") input',

  // Create Game submit button
  createGameBtn: 'button[type="submit"]:has-text("Create"), button:has-text("Create Game")',

  // Copy Invite Link button (appears after private lobby is created)
  copyInviteBtn: 'button:has-text("Copy Invite Link"), button[data-testid="copy-invite"]',
} as const
```

> **Note:** These are best-guess selectors based on typical Next.js / React form conventions and the knowledge that Karabast uses them. **The implementer MUST verify these selectors against the actual Karabast DOM** by loading karabast.net in a browser and using DevTools to confirm element selectors before running the automation. Update `karabast-selectors.ts` with the correct selectors.

- [ ] **Step 2: Add automation logic to `inject-karabast.ts`**

At the top of `inject-karabast.ts`, import ptp-intent:

```typescript
import type { KarabastIntent } from './shared/ptp-intent'
import { PTP_INTENT_EVENT } from './shared/ptp-intent'
import { SEL } from './karabast-selectors'
```

Add the following helper functions and intent listener, BEFORE the existing `(function()` wrapper or at the module level after the existing code:

```typescript
// ── PTP Intent Automation ─────────────────────────────────────────────────────

/**
 * Wait for a selector to appear in the DOM, up to timeoutMs.
 * Returns null if not found in time.
 */
function waitForEl(selector: string, timeoutMs = 8000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector)
    if (el) { resolve(el); return }
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector)
      if (found) { observer.disconnect(); resolve(found) }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => { observer.disconnect(); resolve(null) }, timeoutMs)
  })
}

/**
 * Dispatch a React-compatible input change event so controlled inputs update.
 */
function setInputValue(el: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set
  nativeInputValueSetter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Try each selector in a comma-separated list, return the first match.
 */
function queryFirst(selectors: string): Element | null {
  for (const s of selectors.split(',').map(s => s.trim())) {
    const el = document.querySelector(s)
    if (el) return el
  }
  return null
}

let ptpIntent: KarabastIntent | null = null

window.addEventListener(PTP_INTENT_EVENT, async (event: Event) => {
  const e = event as CustomEvent<KarabastIntent>
  ptpIntent = e.detail
  console.log('[Wayfinder] Received PTP intent:', ptpIntent)

  if (ptpIntent.joinLobbyUrl) {
    // Join Private Lobby flow — Karabast auto-joins the lobby from the URL.
    // Wait for the deck link input to appear (user is now in the lobby).
    await runJoinLobbyAutomation(ptpIntent)
  } else {
    // Create lobby flow — navigate to home if not already there.
    await runCreateLobbyAutomation(ptpIntent)
  }
})

async function runCreateLobbyAutomation(intent: KarabastIntent): Promise<void> {
  try {
    // 1. Click New Game button
    const newGameEl = await waitForEl(SEL.newGameBtn)
    if (!newGameEl) { console.warn('[Wayfinder] New Game button not found'); return }
    ;(newGameEl as HTMLElement).click()

    // 2. Tick New Deck option
    const newDeckEl = await waitForEl(SEL.newDeckOption, 3000)
    if (newDeckEl) (newDeckEl as HTMLElement).click()

    // 3. Paste deck URL
    const deckInput = await waitForEl(SEL.deckLinkInput, 3000)
    if (deckInput) setInputValue(deckInput as HTMLInputElement, intent.ptpDeckUrl)

    // 4. Click Import (if present)
    const importBtn = queryFirst(SEL.importDeckBtn)
    if (importBtn) (importBtn as HTMLElement).click()

    // 5. Select Format: Limited
    await selectOption(SEL.formatLimited, 3000)

    // 6. Select Card Pool
    const poolSel = intent.cardPool === 'Current' ? SEL.cardPoolCurrent : SEL.cardPoolUnlimited
    await selectOption(poolSel, 3000)

    // 7. Select Privacy
    const privacySel = intent.privacy === 'private' ? SEL.privacyPrivate : SEL.privacyPublic
    await selectOption(privacySel, 3000)

    // 8. Click Create Game
    const createBtn = await waitForEl(SEL.createGameBtn, 3000)
    if (createBtn) (createBtn as HTMLElement).click()

    // 9. For private lobbies: wait for invite link button, copy it
    if (intent.privacy === 'private') {
      const copyBtn = await waitForEl(SEL.copyInviteBtn, 10000)
      if (copyBtn) {
        (copyBtn as HTMLElement).click()
        // Dispatch event to content-karabast to show success banner
        window.dispatchEvent(new CustomEvent('__wf_ptp_lobby_created', {
          detail: { privacy: 'private' }
        }))
      }
    }
  } catch (err) {
    console.error('[Wayfinder] Lobby creation automation error:', err)
  }
}

async function runJoinLobbyAutomation(intent: KarabastIntent): Promise<void> {
  try {
    // Wait for the deck link input in the lobby room
    const deckInput = await waitForEl(SEL.deckLinkInput, 10000)
    if (!deckInput) { console.warn('[Wayfinder] Deck link input not found in lobby'); return }
    setInputValue(deckInput as HTMLInputElement, intent.ptpDeckUrl)
    const importBtn = queryFirst(SEL.importDeckBtn)
    if (importBtn) (importBtn as HTMLElement).click()
  } catch (err) {
    console.error('[Wayfinder] Join lobby automation error:', err)
  }
}

async function selectOption(selector: string, timeoutMs = 3000): Promise<void> {
  const el = await waitForEl(selector, timeoutMs)
  if (el) (el as HTMLElement).click()
}
```

- [ ] **Step 3: Listen for `__wf_ptp_lobby_created` in content-karabast.ts to show banner**

In `content-karabast.ts`, add near the end of the file (after other event listeners):

```typescript
// Show success banner when private lobby is created via PTP modal
window.addEventListener('__wf_ptp_lobby_created', ((event: CustomEvent) => {
  if (event.detail?.privacy === 'private') {
    showPtpBanner('Private lobby link copied')
  }
}) as EventListener)

function showPtpBanner(message: string) {
  const existing = document.getElementById('__wf_ptp_banner')
  if (existing) existing.remove()
  const banner = document.createElement('div')
  banner.id = '__wf_ptp_banner'
  banner.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #1a2035; color: #e2e8f0; border: 1px solid #3a4a6b;
    border-radius: 8px; padding: 12px 20px; font-family: Barlow, sans-serif;
    font-size: 14px; font-weight: 600; z-index: 99999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  `
  banner.textContent = `⚡ ${message}`
  document.body.appendChild(banner)
  setTimeout(() => banner.remove(), 4000)
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/extension-shared/src/karabast-selectors.ts packages/extension-shared/src/inject-karabast.ts packages/extension-shared/src/content-karabast.ts
git commit -m "feat: add Karabast lobby creation and join automation via PTP intent"
```

---

### Task 5: PTP play page modal — content-ptp-play.ts

**Repo:** wayfinder

**Files:**
- Create: `packages/extension-shared/src/content-ptp-play.ts`

This is the content script that runs on PTP play pages. It injects a Shadow DOM modal.

- [ ] **Step 1: Create `packages/extension-shared/src/content-ptp-play.ts`**

```typescript
// packages/extension-shared/src/content-ptp-play.ts
// Content script injected on PTP play pages by the Wayfinder extension.
// Injects a Shadow DOM modal offering Karabast lobby automation.

import { PTP_INTENT_STORAGE_KEY, KarabastIntent, KarabastCardPool } from './shared/ptp-intent'

const KARABAST_BASE = 'https://karabast.net'
const PTP_API_BASE = 'https://www.protectthepod.com'

// ── URL parsing ───────────────────────────────────────────────────────────────

type PlayPageInfo = {
  format: 'pool' | 'pack-wars' | 'pack-blitz'
  shareId: string
}

function parsePlayPageUrl(url: string): PlayPageInfo | null {
  const poolMatch = url.match(/\/pool\/([a-zA-Z0-9_-]+)\/deck\/play/)
  if (poolMatch) return { format: 'pool', shareId: poolMatch[1] }

  const packWarsMatch = url.match(/\/formats\/pack-wars\/([a-zA-Z0-9_-]+)\/play/)
  if (packWarsMatch) return { format: 'pack-wars', shareId: packWarsMatch[1] }

  const packBlitzMatch = url.match(/\/formats\/pack-blitz\/([a-zA-Z0-9_-]+)\/play/)
  if (packBlitzMatch) return { format: 'pack-blitz', shareId: packBlitzMatch[1] }

  return null
}

// ── PTP API call ──────────────────────────────────────────────────────────────

type PlayMetadata = {
  setCode: string
  format: string
  isLatestSet: boolean
  cardPool: KarabastCardPool
}

async function fetchPlayMetadata(format: string, shareId: string): Promise<PlayMetadata> {
  const res = await fetch(`${PTP_API_BASE}/api/plugin/v1/play/${format}/${shareId}`)
  if (!res.ok) throw new Error(`PTP API error ${res.status}`)
  return res.json()
}

// ── Karabast lobby count ──────────────────────────────────────────────────────

async function fetchPublicLimitedLobbyCount(): Promise<number> {
  try {
    const res = await fetch('https://api.karabast.net/api/available-lobbies')
    if (!res.ok) return 0
    const lobbies: { format?: string }[] = await res.json()
    return lobbies.filter(l => l.format === 'limited').length
  } catch {
    return 0
  }
}

// ── Private lobby URL validation ──────────────────────────────────────────────

const PRIVATE_LOBBY_PATTERN = /^https:\/\/karabast\.net\/\?lobbyId=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidPrivateLobbyUrl(url: string): boolean {
  return PRIVATE_LOBBY_PATTERN.test(url.trim())
}

// ── Shadow DOM modal ──────────────────────────────────────────────────────────

const MODAL_CSS = `
  :host {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99998;
    font-family: 'Barlow', 'Barlow Condensed', sans-serif;
  }
  .pill {
    background: #1a2035;
    border: 1px solid #3a4a6b;
    border-radius: 20px;
    padding: 8px 16px;
    color: #e2e8f0;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pill:hover { background: #243050; }
  .modal {
    background: #0b0d0f;
    border: 1px solid #3a4a6b;
    border-radius: 12px;
    width: 300px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }
  .header {
    background: #1a2035;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #3a4a6b;
  }
  .header-title {
    color: #e2e8f0;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 4px;
  }
  .close-btn:hover { color: #e2e8f0; }
  .section {
    padding: 12px 16px;
    border-bottom: 1px solid #1e2a3a;
  }
  .section:last-child { border-bottom: none; }
  .btn {
    width: 100%;
    padding: 9px 14px;
    border-radius: 8px;
    border: 1px solid #3a4a6b;
    background: #1a2035;
    color: #e2e8f0;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 6px;
    text-align: left;
  }
  .btn:last-child { margin-bottom: 0; }
  .btn:hover { background: #243050; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .lobby-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .lobby-count {
    color: #94a3b8;
    font-size: 12px;
    white-space: nowrap;
  }
  .lobby-count.has-lobbies { color: #86efac; }
  .join-row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .join-input {
    flex: 1;
    padding: 7px 10px;
    background: #0b0d0f;
    border: 1px solid #3a4a6b;
    border-radius: 6px;
    color: #e2e8f0;
    font-family: inherit;
    font-size: 12px;
  }
  .join-input.error { border-color: #fca5a5; }
  .join-input::placeholder { color: #475569; }
  .join-btn {
    padding: 7px 12px;
    background: #BED9F4;
    color: #0b0d0f;
    border: none;
    border-radius: 6px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .join-btn:hover { background: #a8c8e8; }
  .error-msg {
    color: #fca5a5;
    font-size: 11px;
    margin-top: 4px;
  }
  .loading { color: #94a3b8; font-size: 12px; }
`

class PtpModal {
  private host: HTMLElement
  private shadow: ShadowRoot
  private pageInfo: PlayPageInfo
  private metadata: PlayMetadata | null = null
  private lobbyCount = 0
  private pollTimer: number | null = null
  private isExpanded = true

  constructor(pageInfo: PlayPageInfo) {
    this.pageInfo = pageInfo
    this.host = document.createElement('div')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    document.body.appendChild(this.host)
  }

  async init() {
    this.render()
    try {
      this.metadata = await fetchPlayMetadata(this.pageInfo.format, this.pageInfo.shareId)
    } catch {
      // metadata failure is non-fatal — we default to Unlimited
      this.metadata = { setCode: '', format: this.pageInfo.format, isLatestSet: false, cardPool: 'Unlimited' }
    }
    this.pollLobbyCount()
    this.render()
  }

  private pollLobbyCount() {
    const poll = async () => {
      this.lobbyCount = await fetchPublicLimitedLobbyCount()
      this.render()
    }
    poll()
    this.pollTimer = window.setInterval(poll, 10_000)
  }

  destroy() {
    if (this.pollTimer !== null) clearInterval(this.pollTimer)
    this.host.remove()
  }

  private render() {
    const cardPool = this.metadata?.cardPool ?? 'Unlimited'
    const shareId = this.pageInfo.shareId
    const format = this.pageInfo.format

    this.shadow.innerHTML = `
      <style>${MODAL_CSS}</style>
      ${this.isExpanded ? this.renderModal(cardPool, shareId, format) : this.renderPill()}
    `
    this.attachHandlers()
  }

  private renderPill() {
    return `<button class="pill" id="pill-btn">⚡ Play on Karabast</button>`
  }

  private renderModal(cardPool: KarabastCardPool, shareId: string, format: string) {
    const countClass = this.lobbyCount > 0 ? 'lobby-count has-lobbies' : 'lobby-count'
    const countText = this.metadata ? `${this.lobbyCount} Public Limited Lobby${this.lobbyCount === 1 ? '' : 'ies'}` : '…'
    return `
      <div class="modal">
        <div class="header">
          <span class="header-title">⚡ Play on Karabast</span>
          <button class="close-btn" id="close-btn">×</button>
        </div>
        <div class="section">
          <button class="btn" id="create-private-btn">🔒 Create Private Lobby</button>
          <button class="btn" id="create-public-btn">🌐 Create Public Lobby</button>
        </div>
        <div class="section">
          <div class="lobby-row">
            <span class="${countClass}">${countText}</span>
            <button class="btn" id="join-public-btn" style="width:auto;margin:0" ${this.lobbyCount === 0 ? 'disabled' : ''}>Join Public</button>
          </div>
        </div>
        <div class="section">
          <div style="color:#94a3b8;font-size:12px;margin-bottom:6px;">Join Private Lobby</div>
          <div class="join-row">
            <input class="join-input" id="lobby-url-input" placeholder="https://karabast.net/?lobbyId=…" />
            <button class="join-btn" id="join-private-btn">Join</button>
          </div>
          <div class="error-msg" id="url-error" style="display:none"></div>
        </div>
      </div>
    `
  }

  private attachHandlers() {
    const { shadow, pageInfo, metadata } = this
    const cardPool = metadata?.cardPool ?? 'Unlimited'
    const deckUrl = window.location.href

    shadow.getElementById('pill-btn')?.addEventListener('click', () => {
      this.isExpanded = true
      this.render()
    })

    shadow.getElementById('close-btn')?.addEventListener('click', () => {
      this.isExpanded = false
      this.render()
    })

    shadow.getElementById('create-private-btn')?.addEventListener('click', () => {
      this.launchKarabast({
        ptpDeckUrl: deckUrl,
        ptpShareId: pageInfo.shareId,
        ptpFormat: pageInfo.format,
        cardPool,
        privacy: 'private',
      })
    })

    shadow.getElementById('create-public-btn')?.addEventListener('click', () => {
      this.launchKarabast({
        ptpDeckUrl: deckUrl,
        ptpShareId: pageInfo.shareId,
        ptpFormat: pageInfo.format,
        cardPool,
        privacy: 'public',
      })
    })

    shadow.getElementById('join-public-btn')?.addEventListener('click', () => {
      window.open(KARABAST_BASE, '_blank')
    })

    shadow.getElementById('join-private-btn')?.addEventListener('click', () => {
      const input = shadow.getElementById('lobby-url-input') as HTMLInputElement
      const errorEl = shadow.getElementById('url-error')!
      const url = input.value.trim()
      if (!isValidPrivateLobbyUrl(url)) {
        input.classList.add('error')
        errorEl.textContent = 'Not a valid Karabast private lobby URL'
        errorEl.style.display = 'block'
        return
      }
      input.classList.remove('error')
      errorEl.style.display = 'none'
      this.launchKarabast({
        ptpDeckUrl: deckUrl,
        ptpShareId: pageInfo.shareId,
        ptpFormat: pageInfo.format,
        cardPool,
        joinLobbyUrl: url,
      })
    })
  }

  private async launchKarabast(intent: KarabastIntent) {
    await chrome.storage.local.set({ [PTP_INTENT_STORAGE_KEY]: intent })
    const target = intent.joinLobbyUrl ?? KARABAST_BASE
    window.open(target, '_blank')
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const pageInfo = parsePlayPageUrl(window.location.href)
if (pageInfo) {
  const modal = new PtpModal(pageInfo)
  modal.init()
}
```

- [ ] **Step 2: Add `content-ptp-play.ts` to the extension-shared build**

Check `packages/extension-shared/package.json` or the build config (likely `rollup.config.ts` or `esbuild` config) to see how other content scripts are bundled. Add `content-ptp-play.ts` as an entry point following the existing pattern.

> Look for how `content-karabast.ts` is declared as an entry point and mirror that for `content-ptp-play.ts`.

- [ ] **Step 3: Manual smoke test**

1. Build the extension: `pnpm --filter @wayfinder/extension-chrome build` (or equivalent)
2. Load unpacked extension in Chrome
3. Navigate to a PTP play page (e.g., `https://www.protectthepod.com/pool/[any-shareId]/deck/play`)
4. Verify the modal appears in the bottom-right corner
5. Verify the "×" collapses to a pill, clicking the pill re-expands
6. Verify the Public Limited Lobby count appears (may be 0 — that's fine)
7. Enter an invalid URL in Join Private and verify error appears

- [ ] **Step 4: Commit**

```bash
git add packages/extension-shared/src/content-ptp-play.ts packages/extension-shared/
git commit -m "feat: add PTP play page modal content script with Karabast launch UI"
```

---

## Phase 2: Match Result Linking

---

### Task 6: PTP DB migration — add match results to card_pools

**Repo:** swupod

**Files:**
- Create: `migrations/046_add_match_results_to_pools.sql`

- [ ] **Step 1: Create migration**

```sql
-- migrations/046_add_match_results_to_pools.sql
ALTER TABLE card_pools
  ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS draws INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wayfinder_match_ids TEXT[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Run migration locally**

```bash
npm run dev
# Migration runs automatically on server start.
# Check server console for "Running migration 046_add_match_results_to_pools.sql"
```

- [ ] **Step 3: Verify migration**

```bash
# In psql or your DB client:
\d card_pools
# Verify: wins, losses, draws, wayfinder_match_ids columns exist
```

- [ ] **Step 4: Commit**

```bash
git add migrations/046_add_match_results_to_pools.sql
git commit -m "feat: add wins/losses/draws/wayfinder_match_ids columns to card_pools"
```

---

### Task 7: PTP match result write endpoint

**Repo:** swupod

**Files:**
- Create: `app/api/plugin/v1/match/result/route.ts`
- Create: `app/api/plugin/v1/match/result/route.test.ts`

Wayfinder server calls this endpoint after a match is captured and linked. Auth: `Authorization: Bearer <PTP_SERVICE_KEY>` — uses existing `requireServiceKey`.

- [ ] **Step 1: Write the failing test**

```javascript
// app/api/plugin/v1/match/result/route.test.ts
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

// This test requires a real DB connection.
// Run with: node --test app/api/plugin/v1/match/result/route.test.ts
// Ensure TEST_DATABASE_URL is set in your environment.

describe('POST /api/plugin/v1/match/result', () => {
  it('requires Authorization header', async () => {
    const { POST } = await import('./route.ts')
    const req = new Request('http://localhost/api/plugin/v1/match/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolShareId: 'test', result: 'win', matchId: 'wf-123' }),
    })
    const res = await POST(req)
    assert.equal(res.status, 401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test app/api/plugin/v1/match/result/route.test.ts
```
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Create route**

```typescript
// app/api/plugin/v1/match/result/route.ts
// @ts-nocheck
// POST /api/plugin/v1/match/result
// Server-to-server: Wayfinder calls this to record a match result on a PTP pool.
// Auth: Authorization: Bearer <PTP_SERVICE_KEY>
import { query, queryRow } from '@/lib/db'
import { requireServiceKey } from '@/lib/auth'
import { jsonResponse, errorResponse, parseBody, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireServiceKey(request)

    const body = await parseBody(request)
    const { poolShareId, result, matchId } = body

    if (!poolShareId || !result || !matchId) {
      return errorResponse('poolShareId, result, and matchId are required', 400)
    }
    if (!['win', 'loss', 'draw'].includes(result)) {
      return errorResponse('result must be win, loss, or draw', 400)
    }

    const pool = await queryRow(
      'SELECT id FROM card_pools WHERE share_id = $1',
      [poolShareId]
    )
    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    const winDelta = result === 'win' ? 1 : 0
    const lossDelta = result === 'loss' ? 1 : 0
    const drawDelta = result === 'draw' ? 1 : 0

    await query(
      `UPDATE card_pools
       SET wins = wins + $1,
           losses = losses + $2,
           draws = draws + $3,
           wayfinder_match_ids = array_append(wayfinder_match_ids, $4),
           updated_at = NOW()
       WHERE share_id = $5`,
      [winDelta, lossDelta, drawDelta, matchId, poolShareId]
    )

    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401)
    }
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run test to verify auth check passes**

```bash
node --test app/api/plugin/v1/match/result/route.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/plugin/v1/match/result/
git commit -m "feat: add plugin v1 match result endpoint for Wayfinder integration"
```

---

### Task 8: Wayfinder sends match result to PTP after ingestion

**Repo:** wayfinder

**Files:**
- Modify: `apps/web/src/server/ptp.ts` — add `sendMatchResultToPtp` function
- Modify: `apps/web/src/server/ingestion.ts` — call it after successful pool link

The existing ingestion already calls `linkMatchToPoolByShareId`. We extend it: when that link succeeds AND we have a match result, call the new PTP endpoint.

- [ ] **Step 1: Add `sendMatchResultToPtp` to `apps/web/src/server/ptp.ts`**

At the bottom of `apps/web/src/server/ptp.ts`, add:

```typescript
// ── Match Result Write-back ──────────────────────────────────────────────────

/**
 * Send a match result (win/loss/draw) back to PTP for a pool.
 * Called after a Karabast game is captured and linked to a PTP pool.
 * Silently returns false on any error — this is best-effort.
 */
export async function sendMatchResultToPtp(
  poolShareId: string,
  result: 'win' | 'loss' | 'draw' | null,
  matchId: string
): Promise<boolean> {
  if (!PTP_SERVICE_KEY) {
    console.warn('[ptp] PTP_SERVICE_KEY not configured, skipping match result write-back')
    return false
  }
  if (!result) return false

  try {
    const url = `${PTP_BASE_URL}/api/plugin/v1/match/result`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PTP_SERVICE_KEY}`,
      },
      body: JSON.stringify({ poolShareId, result, matchId }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ptp] Match result write-back failed ${res.status}: ${text}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[ptp] Match result write-back error:', err)
    return false
  }
}
```

- [ ] **Step 2: Import and call in `ingestion.ts`**

At the top of `apps/web/src/server/ingestion.ts`, update the ptp import to include `sendMatchResultToPtp`:

```typescript
import { linkMatchToPoolByShareId, matchKarabastToL2Decklist, sendMatchResultToPtp } from "./ptp";
```

Find the existing PTP pool linking block (around line 391–402):

```typescript
// PTP pool linking: if plugin captured a PTP pool share ID, link match to pool
const ptpPoolShareId = input.payload.ptpPoolShareId as string | undefined;
if (ptpPoolShareId) {
  try {
    const linked = await linkMatchToPoolByShareId(gameId, ptpPoolShareId, "plugin");
    if (linked) {
      console.log("[ingestion] Linked match", gameId, "to PTP pool via plugin:", ptpPoolShareId);
    }
  } catch (poolErr) {
    console.error("[ingestion] PTP pool linking failed for", gameId, poolErr);
  }
}
```

Replace it with:

```typescript
// PTP pool linking: if plugin captured a PTP pool share ID, link match to pool
const ptpPoolShareId = input.payload.ptpPoolShareId as string | undefined;
if (ptpPoolShareId) {
  try {
    const linked = await linkMatchToPoolByShareId(gameId, ptpPoolShareId, "plugin");
    if (linked) {
      console.log("[ingestion] Linked match", gameId, "to PTP pool via plugin:", ptpPoolShareId);
      // Write match result back to PTP (best-effort, non-blocking)
      const ptpResult = result === "win" ? "win"
        : result === "loss" ? "loss"
        : result === "draw" ? "draw"
        : null;
      if (ptpResult) {
        sendMatchResultToPtp(ptpPoolShareId, ptpResult, gameId).catch((err) => {
          console.error("[ingestion] PTP match result write-back error:", gameId, err);
        });
      }
    }
  } catch (poolErr) {
    console.error("[ingestion] PTP pool linking failed for", gameId, poolErr);
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/lee/Repos/ledwards/wayfinder
git add apps/web/src/server/ptp.ts apps/web/src/server/ingestion.ts
git commit -m "feat: send match result write-back to PTP after game-pool link"
```

---

### Task 9: PTP UI — W/L/D badge on play pages

**Repo:** swupod

**Files:**
- Modify: `app/pool/[shareId]/deck/play/page.tsx`
- Modify: `app/formats/pack-wars/[shareId]/play/page.tsx` (if exists)
- Modify: `app/formats/pack-blitz/[shareId]/play/page.tsx` (if exists)

Add a W/L/D record display to play pages when the pool has match results. Each match ID links to Wayfinder.

- [ ] **Step 1: Read `app/pool/[shareId]/deck/play/page.tsx`**

Before editing, read the file to understand its current structure:

```bash
# In Claude Code: use Read tool on app/pool/[shareId]/deck/play/page.tsx
```

- [ ] **Step 2: Add W/L/D data fetching to the pool play page**

In the page's `generateMetadata` or data fetching section, extend the pool query to include the new columns:

```typescript
// In the existing pool fetch (add wins, losses, draws, wayfinder_match_ids to SELECT):
const pool = await queryRow(
  `SELECT share_id, set_code, deck_builder_state, wins, losses, draws, wayfinder_match_ids
   FROM card_pools WHERE share_id = $1`,
  [shareId]
)
```

- [ ] **Step 3: Add the W/L/D badge component inline**

Add a `WldBadge` helper at the top of the file (not a separate component file — it's used once):

```tsx
function WldBadge({
  wins, losses, draws, matchIds
}: {
  wins: number; losses: number; draws: number; matchIds: string[]
}) {
  if (wins === 0 && losses === 0 && draws === 0) return null
  const wayfinder = process.env.NEXT_PUBLIC_WAYFINDER_URL ?? 'https://plugin.wayfinder.news'
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700, fontSize: '14px' }}>
        {wins}W {losses}L {draws}D
      </span>
      {matchIds.map((id, i) => (
        <a
          key={id}
          href={`${wayfinder}/matches/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '12px', color: '#93c5fd' }}
        >
          Match {i + 1}
        </a>
      ))}
    </div>
  )
}
```

In the JSX, render `<WldBadge>` near the deck title/header. The exact location depends on the page layout — place it where it's visible but not intrusive (e.g., below the deck name).

- [ ] **Step 4: Add `NEXT_PUBLIC_WAYFINDER_URL` to `.env.local` (dev)**

```bash
# .env.local (do not commit — add to .env.example if one exists)
NEXT_PUBLIC_WAYFINDER_URL=https://plugin.wayfinder.news
```

- [ ] **Step 5: Repeat for pack-wars and pack-blitz play pages**

Read each file and add the same W/L/D badge, fetching from the appropriate table.

- [ ] **Step 6: Commit**

```bash
git add app/pool/ app/formats/ .env.example
git commit -m "feat: show W/L/D record with Wayfinder match links on play pages"
```

---

### Task 10: Wayfinder match detail page — PTP section

**Repo:** wayfinder

**Files:**
- Modify: `apps/web/app/plugin-site/matches/[id]/page.tsx`

When a game has a linked PTP pool (via `game_pool_links`), show a PTP section with links to the pool, deckbuilder, and draft log.

- [ ] **Step 1: Read the current match detail page**

Read `apps/web/app/plugin-site/matches/[id]/page.tsx` to understand its structure before editing.

- [ ] **Step 2: Add PTP pool query**

After the existing `rows` query (which fetches the game), add:

```typescript
// Look up linked PTP pool(s) for this game
const ptpRows = await sql`
  SELECT pp.ptp_share_id, pp.ptp_pod_share_id, pp.set_code, pp.name
  FROM game_pool_links gpl
  JOIN matches m ON m.uuid = gpl.match_id
  JOIN ptp_pools pp ON pp.id = gpl.pool_id
  WHERE m.match_id = ${gameId}
  ORDER BY gpl.confidence DESC
  LIMIT 1
`
const ptpPool = ptpRows[0] ?? null
```

- [ ] **Step 3: Add PTP section to the JSX**

Add this below the existing match detail content:

```tsx
{ptpPool && (
  <section style={{ marginTop: '24px' }}>
    <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', fontSize: '13px', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: '10px' }}>
      Protect the Pod
    </h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <a href={`https://www.protectthepod.com/pool/${ptpPool.ptp_share_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd', fontSize: '13px' }}>
        Pool {ptpPool.name ? `— ${ptpPool.name}` : ''}
      </a>
      <a href={`https://www.protectthepod.com/pool/${ptpPool.ptp_share_id}/deck`} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd', fontSize: '13px' }}>
        Deckbuilder
      </a>
      {ptpPool.ptp_pod_share_id && (
        <a href={`https://www.protectthepod.com/draft/${ptpPool.ptp_pod_share_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd', fontSize: '13px' }}>
          Draft Log
        </a>
      )}
    </div>
  </section>
)}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/lee/Repos/ledwards/wayfinder
git add apps/web/app/plugin-site/matches/
git commit -m "feat: add PTP pool links to match detail page when game is linked"
```

---

## Phase 3: Pool Ingestion Trigger

---

### Task 11: On-demand PTP pool sync when match references unknown pool

**Repo:** wayfinder

**Files:**
- Modify: `apps/web/src/server/ingestion.ts`

When ingestion receives a `ptpPoolShareId` that isn't yet in `ptp_pools`, trigger a sync for that user's PTP data. This ensures the pool is ingested the first time a match references it, rather than waiting for the next scheduled team sync.

The existing `syncPtpForMember` function handles L1 and L2 ingestion — we just need to call it when `linkMatchToPoolByShareId` returns false.

- [ ] **Step 1: Import `syncPtpForMember` in `ingestion.ts`**

Update the ptp import at the top of `ingestion.ts`:

```typescript
import { linkMatchToPoolByShareId, matchKarabastToL2Decklist, sendMatchResultToPtp, syncPtpForMember } from "./ptp";
```

- [ ] **Step 2: Extend the PTP pool linking block**

Replace the PTP pool linking block (updated in Task 8) with the version that tries a sync on miss:

```typescript
// PTP pool linking: if plugin captured a PTP pool share ID, link match to pool
const ptpPoolShareId = input.payload.ptpPoolShareId as string | undefined;
if (ptpPoolShareId) {
  try {
    let linked = await linkMatchToPoolByShareId(gameId, ptpPoolShareId, "plugin");
    if (!linked && input.capturedByMembershipId && input.teamId) {
      // Pool not yet synced — look up Discord ID and trigger a PTP sync
      const memberRow = await sql`
        SELECT u.discord_id FROM memberships m
        JOIN users u ON u.user_id = m.user_id
        WHERE m.membership_id = ${input.capturedByMembershipId}
        LIMIT 1
      `;
      const discordId = (memberRow[0]?.discord_id as string) ?? null;
      if (discordId) {
        console.log("[ingestion] PTP pool not cached, triggering sync for membership:", input.capturedByMembershipId);
        await syncPtpForMember(input.teamId, input.capturedByMembershipId, discordId);
        // Retry link after sync
        linked = await linkMatchToPoolByShareId(gameId, ptpPoolShareId, "plugin");
      }
    }
    if (linked) {
      console.log("[ingestion] Linked match", gameId, "to PTP pool via plugin:", ptpPoolShareId);
      const ptpResult = result === "win" ? "win"
        : result === "loss" ? "loss"
        : result === "draw" ? "draw"
        : null;
      if (ptpResult) {
        sendMatchResultToPtp(ptpPoolShareId, ptpResult, gameId).catch((err) => {
          console.error("[ingestion] PTP match result write-back error:", gameId, err);
        });
      }
    }
  } catch (poolErr) {
    console.error("[ingestion] PTP pool linking failed for", gameId, poolErr);
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/lee/Repos/ledwards/wayfinder
git add apps/web/src/server/ingestion.ts
git commit -m "feat: trigger on-demand PTP pool sync when match references unknown pool"
```

---

### Task 12: Update spec with implementation notes

Both repos now have a reference to `NEXT_PUBLIC_WAYFINDER_URL` (swupod) and `PTP_BASE_URL` / `PTP_SERVICE_KEY` (wayfinder). Document the required env vars.

- [ ] **Step 1: Add env vars to swupod**

Verify `.env.example` or `README` lists:
- `NEXT_PUBLIC_WAYFINDER_URL` — Wayfinder plugin subdomain (e.g., `https://plugin.wayfinder.news`)

- [ ] **Step 2: Verify wayfinder env vars**

Confirm `apps/web/.env.example` (or equivalent) lists:
- `PTP_API_URL` — PTP base URL (e.g., `https://www.protectthepod.com`)
- `PTP_SERVICE_KEY` — shared secret for server-to-server calls

- [ ] **Step 3: Smoke test end-to-end (manual)**

1. In a dev browser with the Wayfinder extension loaded (pointing at localhost)
2. Navigate to a PTP play page
3. Verify the modal appears
4. Click "Create Private Lobby" — verify karabast.net opens in a new tab
5. Verify the lobby creation form is pre-filled (check console logs from inject-karabast)
6. Complete a game on Karabast
7. Check Wayfinder DB: verify `game_pool_links` has a row linking the game to the PTP pool
8. Check PTP DB: verify `card_pools.wins`/`losses`/`draws` incremented
9. Check the PTP play page: verify W/L/D badge appears
10. Check the Wayfinder match detail page: verify PTP section with links appears

- [ ] **Step 4: Commit updated spec if any implementation details changed**

```bash
# In swupod:
git add docs/superpowers/specs/2026-03-27-karabast-integration-design.md
git commit -m "docs: update spec with implementation notes (env vars, selector file, table names)"
```

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] Karabast selectors in `karabast-selectors.ts` have been verified against the live Karabast DOM (Task 4, Step 1 note)
- [ ] `pack_wars` and `pack-blitz` table names in Task 1 `FORMAT_QUERIES` have been verified against the DB schema
- [ ] The manifest changes are also reflected in the Safari extension
- [ ] `NEXT_PUBLIC_WAYFINDER_URL` is set in swupod production env (Railway)
- [ ] `PTP_SERVICE_KEY` is set in both swupod and wayfinder production envs (Railway) — same value
- [ ] `PTP_API_URL` is set in wayfinder production env
