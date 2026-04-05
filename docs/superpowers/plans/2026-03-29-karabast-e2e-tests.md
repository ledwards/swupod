# Karabast Integration E2E Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end test suite covering every happy-path flow of the Karabast integration: modal rendering, intent dispatch, W/L/D badge on PTP, and the match-result write-back API.

**Architecture:** Two test files — one in the wayfinder repo (`tests/e2e-plugin/karabast-ptp.test.ts`) that loads the Chrome extension and uses mocked HTTP routes, and one in swupod (`tests/e2e/karabast-badge.spec.ts`) that hits the live local server and database. The wayfinder tests mock both the PTP API and the Karabast API using `context.route()`, capturing intent events via `addInitScript`. The swupod API test POSTs directly to the running dev server.

**Tech Stack:** Playwright `chromium.launchPersistentContext` (extension loading), `context.route()` (HTTP mocking), `page.evaluate()` (Shadow DOM), `pg.Pool` (direct DB queries for setup/teardown), Next.js dev server.

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/web/tests/e2e-plugin/karabast-ptp.test.ts` (wayfinder) |
| Create | `tests/e2e/karabast-badge.spec.ts` (swupod) |

---

## Task 1: wayfinder — Test file scaffold + extension context helpers

**Files:**
- Create: `apps/web/tests/e2e-plugin/karabast-ptp.test.ts`

- [ ] **Step 1: Create the test file with helpers only (no tests yet)**

```typescript
// apps/web/tests/e2e-plugin/karabast-ptp.test.ts
import { test, expect, chromium, BrowserContext, Page } from "@playwright/test";
import path from "path";

// ── Constants ────────────────────────────────────────────────────────────────

const EXT_PATH = path.resolve(__dirname, "../../apps/extension-chrome/dist");
const PTP_BASE = "http://localhost:3000";
const KARABAST_BASE = "https://karabast.net";
const KARABAST_API = "https://api.karabast.net";

// A minimal PTP play page HTML that the content script will inject into.
// Must include <body> so the script can call document.body.appendChild.
const MOCK_PTP_PLAY_HTML = `<!DOCTYPE html>
<html><head><title>Play - Test Deck</title></head>
<body><h1>Play</h1></body></html>`;

// A minimal karabast.net page that inject-karabast.js will load into.
const MOCK_KARABAST_HTML = `<!DOCTYPE html>
<html><head><title>Karabast</title></head>
<body><div id="app"></div></body></html>`;

// ── Shadow DOM helpers ────────────────────────────────────────────────────────

/** Returns true if any shadow root inside the page contains an element matching sel. */
async function shadowHas(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s: string) => {
    for (const host of document.querySelectorAll("*")) {
      if (host.shadowRoot?.querySelector(s)) return true;
    }
    return false;
  }, sel);
}

/** Clicks a button inside a shadow root whose text content includes label. */
async function shadowClick(page: Page, sel: string): Promise<void> {
  await page.evaluate((s: string) => {
    for (const host of document.querySelectorAll("*")) {
      const el = host.shadowRoot?.querySelector(s) as HTMLElement | null;
      if (el) { el.click(); return; }
    }
    throw new Error(`Shadow element not found: ${s}`);
  }, sel);
}

/** Gets textContent of a shadow element. */
async function shadowText(page: Page, sel: string): Promise<string> {
  return page.evaluate((s: string) => {
    for (const host of document.querySelectorAll("*")) {
      const el = host.shadowRoot?.querySelector(s);
      if (el) return el.textContent ?? "";
    }
    return "";
  }, sel);
}

/** Sets the value of an input inside a shadow root. */
async function shadowFill(page: Page, sel: string, value: string): Promise<void> {
  await page.evaluate(({ s, v }: { s: string; v: string }) => {
    for (const host of document.querySelectorAll("*")) {
      const el = host.shadowRoot?.querySelector(s) as HTMLInputElement | null;
      if (el) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        nativeInputValueSetter?.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
    }
    throw new Error(`Shadow input not found: ${s}`);
  }, { s: sel, v: value });
}

// ── Extension context factory ────────────────────────────────────────────────

async function launchExtensionContext(): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  // Wait for service worker to register
  await ctx.waitForEvent("serviceworker", { timeout: 10_000 }).catch(() => {});
  return ctx;
}

// ── Intent capture helper ────────────────────────────────────────────────────

/**
 * Injects a listener into every page (including new tabs) so that
 * __wf_karabast_intent CustomEvents are captured in window.__wfIntents.
 */
async function installIntentCapture(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(`
    window.__wfIntents = [];
    window.addEventListener('__wf_karabast_intent', function(e) {
      window.__wfIntents.push(e.detail);
    });
  `);
}

export {
  MOCK_PTP_PLAY_HTML,
  MOCK_KARABAST_HTML,
  PTP_BASE,
  KARABAST_BASE,
  KARABAST_API,
  shadowHas,
  shadowClick,
  shadowText,
  shadowFill,
  launchExtensionContext,
  installIntentCapture,
};
```

- [ ] **Step 2: Verify the file is syntactically valid (no tests to run yet)**

```bash
cd /Users/lee/Repos/ledwards/wayfinder/apps/web
npx tsc --noEmit --strict false tests/e2e-plugin/karabast-ptp.test.ts 2>&1 | head -30
```

Expected: no errors (or only "cannot find module @playwright/test" which is fine — it's installed).

- [ ] **Step 3: Commit scaffold**

```bash
cd /Users/lee/Repos/ledwards/wayfinder
git add apps/web/tests/e2e-plugin/karabast-ptp.test.ts
git commit -m "test: add karabast E2E test scaffold with extension helpers"
```

---

## Task 2: wayfinder — Modal render + collapse/expand tests

**Files:**
- Modify: `apps/web/tests/e2e-plugin/karabast-ptp.test.ts`

These tests open a mocked PTP play page (`http://localhost:3000/pool/test-abc/deck/play`), mock the PTP play API to return a `Current` card pool, mock the Karabast available-lobbies API, and assert the Shadow DOM modal renders correctly.

- [ ] **Step 1: Add modal smoke tests**

Replace the `export {}` at the bottom of the file (after the helper exports) with:

```typescript
// ── Tests ─────────────────────────────────────────────────────────────────────

const SHARE_ID = "test-abc-123";
const PLAY_URL = `${PTP_BASE}/pool/${SHARE_ID}/deck/play`;

test.describe("Karabast modal — PTP play page", () => {
  let ctx: BrowserContext;

  test.beforeEach(async () => {
    ctx = await launchExtensionContext();
    await installIntentCapture(ctx);

    // Mock PTP play metadata endpoint
    await ctx.route(
      `${PTP_BASE}/api/plugin/v1/play/pool/${SHARE_ID}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            setCode: "LAW",
            format: "pool",
            isLatestSet: true,
            cardPool: "Current",
          }),
        })
    );

    // Mock Karabast available-lobbies API with 2 limited lobbies
    await ctx.route(`${KARABAST_API}/api/available-lobbies`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { format: "limited", lobbyId: "aaa" },
          { format: "limited", lobbyId: "bbb" },
        ]),
      })
    );

    // Mock the PTP play page itself
    await ctx.route(PLAY_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: MOCK_PTP_PLAY_HTML,
      })
    );
  });

  test.afterEach(async () => {
    await ctx.close();
  });

  test("modal renders on play page with Create Private and Create Public buttons", async () => {
    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    // Wait for Shadow DOM modal to appear (extension injects asynchronously)
    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector(".modal")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    expect(await shadowHas(page, "#create-private-btn")).toBe(true);
    expect(await shadowHas(page, "#create-public-btn")).toBe(true);
    expect(await shadowHas(page, "#join-public-btn")).toBe(true);
    expect(await shadowHas(page, "#lobby-url-input")).toBe(true);
  });

  test("modal shows lobby count from Karabast API", async () => {
    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector(".lobby-count.has-lobbies")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    const text = await shadowText(page, ".lobby-count");
    expect(text).toContain("2");
  });

  test("Join Public button disabled when 0 lobbies", async () => {
    // Override with 0 limited lobbies
    await ctx.route(`${KARABAST_API}/api/available-lobbies`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ format: "constructed", lobbyId: "ccc" }]),
      })
    );

    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector(".modal")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    const disabled = await page.evaluate(() => {
      for (const host of document.querySelectorAll("*")) {
        const btn = host.shadowRoot?.querySelector("#join-public-btn") as HTMLButtonElement | null;
        if (btn) return btn.disabled;
      }
      return null;
    });
    expect(disabled).toBe(true);
  });

  test("close button collapses modal to pill; pill click restores modal", async () => {
    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector(".modal")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    // Click close
    await shadowClick(page, "#close-btn");

    // Modal gone, pill present
    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector(".pill")) return true;
        }
        return false;
      },
      { timeout: 5_000 }
    );
    expect(await shadowHas(page, ".modal")).toBe(false);

    // Click pill to reopen
    await shadowClick(page, "#pill-btn");

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector(".modal")) return true;
        }
        return false;
      },
      { timeout: 5_000 }
    );
    expect(await shadowHas(page, ".modal")).toBe(true);
  });

  test("invalid private lobby URL shows inline error", async () => {
    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector("#lobby-url-input")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    await shadowFill(page, "#lobby-url-input", "not-a-valid-url");
    await shadowClick(page, "#join-private-btn");

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          const el = host.shadowRoot?.querySelector("#url-error") as HTMLElement | null;
          if (el && el.style.display !== "none" && el.textContent) return true;
        }
        return false;
      },
      { timeout: 5_000 }
    );

    const errorText = await shadowText(page, "#url-error");
    expect(errorText).toContain("valid Karabast");
  });
});
```

- [ ] **Step 2: Run the new modal tests**

```bash
cd /Users/lee/Repos/ledwards/wayfinder/apps/web
npx playwright test tests/e2e-plugin/karabast-ptp.test.ts --config playwright.plugin.config.ts --grep "modal"
```

Expected: all 5 tests PASS (extension injects Shadow DOM, routes respond, assertions hold).

- [ ] **Step 3: Commit**

```bash
cd /Users/lee/Repos/ledwards/wayfinder
git add apps/web/tests/e2e-plugin/karabast-ptp.test.ts
git commit -m "test: add karabast modal render and collapse/expand E2E tests"
```

---

## Task 3: wayfinder — Intent dispatch tests (Create Private/Public, Join Private)

**Files:**
- Modify: `apps/web/tests/e2e-plugin/karabast-ptp.test.ts`

These tests verify that clicking "Create Private Lobby", "Create Public Lobby", or "Join Private" causes the extension to write a `KarabastIntent` to `chrome.storage.local` and dispatch `__wf_karabast_intent` on the new karabast.net tab.

- [ ] **Step 1: Add intent dispatch tests**

Append after the closing `});` of the modal describe block:

```typescript
test.describe("Karabast intent dispatch", () => {
  let ctx: BrowserContext;

  test.beforeEach(async () => {
    ctx = await launchExtensionContext();
    await installIntentCapture(ctx);

    await ctx.route(
      `${PTP_BASE}/api/plugin/v1/play/pool/${SHARE_ID}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            setCode: "LAW",
            format: "pool",
            isLatestSet: true,
            cardPool: "Current",
          }),
        })
    );

    await ctx.route(`${KARABAST_API}/api/available-lobbies`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ format: "limited", lobbyId: "aaa" }]),
      })
    );

    await ctx.route(PLAY_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: MOCK_PTP_PLAY_HTML,
      })
    );

    // Mock karabast.net so opening it doesn't fail
    await ctx.route(`${KARABAST_BASE}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: MOCK_KARABAST_HTML,
      })
    );
    await ctx.route(`${KARABAST_BASE}/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: MOCK_KARABAST_HTML,
      })
    );
  });

  test.afterEach(async () => {
    await ctx.close();
  });

  test("Create Private Lobby dispatches intent with privacy=private", async () => {
    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector("#create-private-btn")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    // Listen for new tab
    const [newPage] = await Promise.all([
      ctx.waitForEvent("page"),
      shadowClick(page, "#create-private-btn"),
    ]);

    await newPage.waitForLoadState("domcontentloaded");

    // The inject-karabast.ts script reads chrome.storage.local and dispatches __wf_karabast_intent.
    // Our addInitScript listener captures it.
    const intents = await newPage.waitForFunction(
      () => (window as any).__wfIntents?.length > 0,
      { timeout: 10_000 }
    ).then(() => newPage.evaluate(() => (window as any).__wfIntents));

    expect(intents).toHaveLength(1);
    expect(intents[0].ptpShareId).toBe(SHARE_ID);
    expect(intents[0].ptpFormat).toBe("pool");
    expect(intents[0].cardPool).toBe("Current");
    expect(intents[0].privacy).toBe("private");
  });

  test("Create Public Lobby dispatches intent with privacy=public", async () => {
    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector("#create-public-btn")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    const [newPage] = await Promise.all([
      ctx.waitForEvent("page"),
      shadowClick(page, "#create-public-btn"),
    ]);

    await newPage.waitForLoadState("domcontentloaded");

    const intents = await newPage.waitForFunction(
      () => (window as any).__wfIntents?.length > 0,
      { timeout: 10_000 }
    ).then(() => newPage.evaluate(() => (window as any).__wfIntents));

    expect(intents[0].privacy).toBe("public");
    expect(intents[0].ptpShareId).toBe(SHARE_ID);
    expect(intents[0].cardPool).toBe("Current");
  });

  test("Join Private dispatches intent with joinLobbyUrl set and no privacy", async () => {
    const LOBBY_ID = "12345678-1234-1234-1234-123456789abc";
    const LOBBY_URL = `https://karabast.net/?lobbyId=${LOBBY_ID}`;

    const page = await ctx.newPage();
    await page.goto(PLAY_URL, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        for (const host of document.querySelectorAll("*")) {
          if (host.shadowRoot?.querySelector("#lobby-url-input")) return true;
        }
        return false;
      },
      { timeout: 15_000 }
    );

    await shadowFill(page, "#lobby-url-input", LOBBY_URL);

    const [newPage] = await Promise.all([
      ctx.waitForEvent("page"),
      shadowClick(page, "#join-private-btn"),
    ]);

    await newPage.waitForLoadState("domcontentloaded");

    const intents = await newPage.waitForFunction(
      () => (window as any).__wfIntents?.length > 0,
      { timeout: 10_000 }
    ).then(() => newPage.evaluate(() => (window as any).__wfIntents));

    expect(intents[0].joinLobbyUrl).toBe(LOBBY_URL);
    expect(intents[0].ptpShareId).toBe(SHARE_ID);
    expect(intents[0].privacy).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run intent dispatch tests**

```bash
cd /Users/lee/Repos/ledwards/wayfinder/apps/web
npx playwright test tests/e2e-plugin/karabast-ptp.test.ts --config playwright.plugin.config.ts --grep "intent dispatch"
```

Expected: 3 tests PASS. The `__wfIntents` array on the karabast tab should contain one intent with the correct fields.

- [ ] **Step 3: Commit**

```bash
cd /Users/lee/Repos/ledwards/wayfinder
git add apps/web/tests/e2e-plugin/karabast-ptp.test.ts
git commit -m "test: add karabast intent dispatch E2E tests"
```

---

## Task 4: swupod — W/L/D badge render tests

**Files:**
- Create: `tests/e2e/karabast-badge.spec.ts` (swupod)

These tests require a running dev server (`npm run dev`). They create a real pool in the DB, seed wins/losses/draws and match IDs directly via SQL, then load the play page and assert the badge renders correctly.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/e2e/karabast-badge.spec.ts
// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from "@playwright/test";
import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createTestUser, cleanupTestUsers, closeDb } from "./test-utils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../../.env.local") });
dotenv.config({ path: join(__dirname, "../../.env") });

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const TEST_ID = `e2e_badge_${Date.now()}`;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function getPool(): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString });
  return pool;
}

async function createSealedPool(db: pg.Pool, userId: string, setCode = "LAW"): Promise<string> {
  const shareId = `test-badge-${Date.now()}`;
  await db.query(
    `INSERT INTO card_pools (share_id, user_id, set_code, pool_type, cards, deck_cards, wins, losses, draws, wayfinder_match_ids, created_at, updated_at)
     VALUES ($1, $2, $3, 'sealed', '[]'::jsonb, '[]'::jsonb, 0, 0, 0, '{}', NOW(), NOW())`,
    [shareId, userId, setCode]
  );
  return shareId;
}

async function seedMatchResult(
  db: pg.Pool,
  shareId: string,
  wins: number,
  losses: number,
  draws: number,
  matchIds: string[]
): Promise<void> {
  await db.query(
    `UPDATE card_pools
     SET wins = $1, losses = $2, draws = $3, wayfinder_match_ids = $4
     WHERE share_id = $5`,
    [wins, losses, draws, matchIds, shareId]
  );
}

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.describe("W/L/D badge on PTP play page", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let user: any;
  let db: pg.Pool;

  test.beforeAll(async () => {
    db = await getPool();
    user = await createTestUser("BadgePlayer", TEST_ID);

    browser = await chromium.launch({ headless: false, slowMo: 50 });
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    const urlObj = new URL(BASE_URL);
    const cookieConfig: any = {
      name: user.cookieName,
      value: user.token,
      httpOnly: true,
      sameSite: "Lax",
    };
    if (urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1") {
      cookieConfig.url = BASE_URL;
    } else {
      cookieConfig.domain = urlObj.hostname;
      cookieConfig.path = "/";
    }
    await context.addCookies([cookieConfig]);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await cleanupTestUsers(TEST_ID);
    await db.end();
    await closeDb();
    await context?.close();
    await browser?.close();
  });

  test("badge hidden when pool has 0 wins / 0 losses / 0 draws", async () => {
    const shareId = await createSealedPool(db, user.user.id);

    await page.goto(`${BASE_URL}/pool/${shareId}/deck/play`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // WldBadge returns null when all zeros — no badge element should be present
    const badgeVisible = await page
      .locator("text=/\\dW \\dL \\dD/")
      .isVisible()
      .catch(() => false);
    expect(badgeVisible).toBe(false);
  });

  test("badge shows W/L/D record when pool has match results", async () => {
    const shareId = await createSealedPool(db, user.user.id);
    await seedMatchResult(db, shareId, 3, 1, 0, ["match-aaa", "match-bbb", "match-ccc", "match-ddd"]);

    await page.goto(`${BASE_URL}/pool/${shareId}/deck/play`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const badge = page.locator("text=/3W 1L 0D/");
    await expect(badge).toBeVisible({ timeout: 10_000 });
  });

  test("badge renders one link per match result pointing to Wayfinder", async () => {
    const MATCH_ID = "wayfinder-match-xyz";
    const shareId = await createSealedPool(db, user.user.id);
    await seedMatchResult(db, shareId, 1, 0, 0, [MATCH_ID]);

    await page.goto(`${BASE_URL}/pool/${shareId}/deck/play`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // One "Match 1" link should be present
    const matchLink = page.locator(`a:has-text("Match 1")`);
    await expect(matchLink).toBeVisible({ timeout: 10_000 });

    // Link href must contain the match ID
    const href = await matchLink.getAttribute("href");
    expect(href).toContain(MATCH_ID);

    // Link opens in new tab
    const target = await matchLink.getAttribute("target");
    expect(target).toBe("_blank");
  });
});
```

- [ ] **Step 2: Run tests to confirm they FAIL (pool table missing wins columns means seedMatchResult errors, OR badge element not found)**

```bash
cd /Users/lee/Repos/ledwards/swupod
npx playwright test tests/e2e/karabast-badge.spec.ts --grep "badge" 2>&1 | tail -30
```

Expected: FAIL (the migration must be applied first, or column not found error). This confirms TDD red step.

- [ ] **Step 3: Apply the migration if not already applied**

```bash
cd /Users/lee/Repos/ledwards/swupod
npm run dev &
sleep 5
# Migration runs automatically on server start via server.js
# Verify the columns exist:
node -e "
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
pool.query('SELECT wins, losses, draws, wayfinder_match_ids FROM card_pools LIMIT 1').then(r => { console.log('columns OK'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
"
```

Expected: `columns OK`

- [ ] **Step 4: Run tests to verify they PASS**

```bash
cd /Users/lee/Repos/ledwards/swupod
npx playwright test tests/e2e/karabast-badge.spec.ts --grep "badge"
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lee/Repos/ledwards/swupod
git add tests/e2e/karabast-badge.spec.ts
git commit -m "test: add W/L/D badge E2E tests for Karabast integration"
```

---

## Task 5: swupod — Match result API integration test

**Files:**
- Modify: `tests/e2e/karabast-badge.spec.ts` (swupod)

These tests POST directly to the `/api/plugin/v1/match/result` endpoint and verify the database is updated. They also test the 401 auth guard.

- [ ] **Step 1: Add API integration tests to the same file**

Append after the closing `});` of the badge describe block:

```typescript
test.describe("POST /api/plugin/v1/match/result", () => {
  let db: pg.Pool;
  let userId: string;

  test.beforeAll(async () => {
    db = await getPool();
    // Re-use user from outer describe if available; otherwise create a minimal user
    // We create fresh users per test to avoid interference
  });

  test.afterAll(async () => {
    await db.end();
  });

  test("rejects request with no Authorization header (401)", async () => {
    const res = await fetch(`${BASE_URL}/api/plugin/v1/match/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poolShareId: "any", result: "win", matchId: "m1" }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects request with wrong Authorization header (401)", async () => {
    const res = await fetch(`${BASE_URL}/api/plugin/v1/match/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-secret",
      },
      body: JSON.stringify({ poolShareId: "any", result: "win", matchId: "m1" }),
    });
    expect(res.status).toBe(401);
  });

  test("records a win result and appends matchId to wayfinder_match_ids", async () => {
    const serviceKey = process.env.PTP_SERVICE_KEY;
    if (!serviceKey) {
      test.skip(true, "PTP_SERVICE_KEY not set in .env.local — skipping auth-dependent test");
      return;
    }

    // Create a real pool in the DB to update
    const localDb = await getPool();
    const badgeUser = await createTestUser("MatchResultPlayer", TEST_ID);
    const shareId = await createSealedPool(localDb, badgeUser.user.id);

    const MATCH_ID = `test-match-${Date.now()}`;
    const res = await fetch(`${BASE_URL}/api/plugin/v1/match/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ poolShareId: shareId, result: "win", matchId: MATCH_ID }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Verify DB was updated
    const row = await localDb.query(
      "SELECT wins, losses, draws, wayfinder_match_ids FROM card_pools WHERE share_id = $1",
      [shareId]
    );
    expect(row.rows[0].wins).toBe(1);
    expect(row.rows[0].losses).toBe(0);
    expect(row.rows[0].draws).toBe(0);
    expect(row.rows[0].wayfinder_match_ids).toContain(MATCH_ID);

    await localDb.end();
  });

  test("records a loss result correctly", async () => {
    const serviceKey = process.env.PTP_SERVICE_KEY;
    if (!serviceKey) {
      test.skip(true, "PTP_SERVICE_KEY not set — skipping");
      return;
    }

    const localDb = await getPool();
    const lossUser = await createTestUser("LossPlayer", TEST_ID);
    const shareId = await createSealedPool(localDb, lossUser.user.id);
    const MATCH_ID = `test-loss-${Date.now()}`;

    const res = await fetch(`${BASE_URL}/api/plugin/v1/match/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ poolShareId: shareId, result: "loss", matchId: MATCH_ID }),
    });

    expect(res.status).toBe(200);

    const row = await localDb.query(
      "SELECT wins, losses, draws FROM card_pools WHERE share_id = $1",
      [shareId]
    );
    expect(row.rows[0].wins).toBe(0);
    expect(row.rows[0].losses).toBe(1);
    expect(row.rows[0].draws).toBe(0);
    await localDb.end();
  });

  test("returns 404 for unknown poolShareId", async () => {
    const serviceKey = process.env.PTP_SERVICE_KEY;
    if (!serviceKey) {
      test.skip(true, "PTP_SERVICE_KEY not set — skipping");
      return;
    }

    const res = await fetch(`${BASE_URL}/api/plugin/v1/match/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ poolShareId: "nonexistent-share-id", result: "win", matchId: "m-nope" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the API tests**

```bash
cd /Users/lee/Repos/ledwards/swupod
npx playwright test tests/e2e/karabast-badge.spec.ts --grep "match/result"
```

Expected: The 401 tests pass unconditionally. The win/loss/404 tests pass if `PTP_SERVICE_KEY` is set in `.env.local`, skip otherwise.

- [ ] **Step 3: Run the full badge spec to confirm nothing regressed**

```bash
cd /Users/lee/Repos/ledwards/swupod
npx playwright test tests/e2e/karabast-badge.spec.ts
```

Expected: all tests PASS (or skip with message if `PTP_SERVICE_KEY` not set).

- [ ] **Step 4: Commit**

```bash
cd /Users/lee/Repos/ledwards/swupod
git add tests/e2e/karabast-badge.spec.ts
git commit -m "test: add match result API integration tests for Karabast integration"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|------------|
| Modal renders on PTP play pages | Task 2 — modal smoke test |
| Modal shows Create Private / Public buttons | Task 2 — render test |
| Lobby count polled from Karabast API | Task 2 — lobby count test |
| Join Public disabled when 0 lobbies | Task 2 — 0-lobbies test |
| Close collapses to pill; pill re-opens | Task 2 — collapse/expand test |
| Invalid private URL shows error | Task 2 — error message test |
| Create Private stores intent with `privacy=private` | Task 3 — intent test |
| Create Public stores intent with `privacy=public` | Task 3 — intent test |
| Join Private stores intent with `joinLobbyUrl` | Task 3 — intent test |
| Intent includes `ptpShareId`, `ptpFormat`, `cardPool` | Task 3 — all three intent tests |
| W/L/D badge hidden at 0s | Task 4 — hidden test |
| W/L/D badge shows record | Task 4 — badge display test |
| Badge links point to Wayfinder match records | Task 4 — match link test |
| POST /match/result rejects wrong auth (401) | Task 5 — 401 tests |
| POST /match/result records win to DB | Task 5 — win test |
| POST /match/result records loss to DB | Task 5 — loss test |
| POST /match/result returns 404 for unknown pool | Task 5 — 404 test |

**Notes:**
- Wayfinder match detail page PTP section (bidirectional links on Wayfinder side) requires a running Wayfinder server and a seeded `game_pool_links` row. This is integration-heavy across two repos and is covered by the design spec — adding it to a future plan after the Wayfinder ingestion pipeline is fully wired. The match result write-back (PTP side) is fully covered here.
- The `createSealedPool` helper assumes `deck_cards` and `cards` columns accept `'[]'::jsonb`. Adjust to `'{}'::jsonb` or `NULL` if the schema differs — check the actual column type with `\d card_pools` if tests fail with a type error.
