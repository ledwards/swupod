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
  const shareId = `test-badge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.query(
    `INSERT INTO card_pools (share_id, user_id, set_code, pool_type, cards, wins, losses, draws, wayfinder_match_ids, created_at, updated_at)
     VALUES ($1, $2, $3, 'sealed', '[]'::jsonb, 0, 0, 0, '{}', NOW(), NOW())`,
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
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (long-running integration test)'
);
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
    await page.waitForSelector('.play-header', { timeout: 15_000 });

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
    await page.waitForSelector('.play-header', { timeout: 15_000 });

    const badge = page.locator("text=/3W 1L 0D/");
    await expect(badge).toBeVisible({ timeout: 10_000 });
  });

  test("badge renders one link per match result pointing to Wayfinder", async () => {
    const MATCH_ID = "wayfinder-match-xyz";
    const shareId = await createSealedPool(db, user.user.id);
    await seedMatchResult(db, shareId, 1, 0, 0, [MATCH_ID]);

    await page.goto(`${BASE_URL}/pool/${shareId}/deck/play`, { waitUntil: "networkidle" });
    await page.waitForSelector('.play-header', { timeout: 15_000 });

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
