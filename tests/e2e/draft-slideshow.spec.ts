import { test, expect, Page } from '@playwright/test'
import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createRequire } from 'module'
import { checkLayoutIssues, takeScreenshot } from './helpers.ts'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)
const cardCatalogData = require('../../src/data/cards.json')
dotenv.config({ path: join(__dirname, '../../.env.local') })
dotenv.config({ path: join(__dirname, '../../.env') })

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_slideshow_${Date.now()}`
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
const PLAYER_COUNT = 8
const CARDS_PER_PACK = 14
const CATALOG_CARDS = (cardCatalogData as any).cards || []
const REAL_LEADERS = uniqueCards(CATALOG_CARDS.filter(card => card.isLeader && card.imageUrl))
const REAL_BASES = uniqueCards(CATALOG_CARDS.filter(card => card.isBase && card.imageUrl))
const REAL_DRAFT_CARDS = uniqueCards(CATALOG_CARDS.filter(card => !card.isLeader && !card.isBase && card.imageUrl && card.variantType === 'Normal'))

test.describe.configure({ mode: 'serial' })
test.skip(!connectionString, 'DATABASE_URL or POSTGRES_URL is required for slideshow E2E fixtures')
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'Desktop Chromium only')
test.setTimeout(180_000)

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function uniqueCards(cards) {
  const seen = new Set()
  return cards.filter(card => {
    const key = `${card.name}|${card.subtitle || ''}|${card.set}|${card.number}|${card.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function catalogCardAt(cards, index: number) {
  if (cards.length === 0) {
    throw new Error('Expected bundled card catalog data to include image URLs')
  }
  return cards[index % cards.length]
}

function avatarArtForSeat(seatNumber: number) {
  return catalogCardAt(REAL_DRAFT_CARDS, 120 + seatNumber * 11).imageUrl
}

async function assignArtworkAvatars(db: pg.Pool, users) {
  for (const [index, userResult] of users.entries()) {
    await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarArtForSeat(index + 1), userResult.user.id]
    )
  }
}

function card(instanceId: string, source, overrides = {}) {
  return {
    id: source.id || instanceId,
    instanceId,
    cardId: source.cardId,
    name: source.name,
    subtitle: source.subtitle,
    type: source.type || 'Unit',
    aspects: source.aspects || ['Command'],
    imageUrl: source.imageUrl,
    backImageUrl: source.backImageUrl,
    rarity: source.rarity,
    isLeader: source.isLeader,
    isBase: source.isBase,
    ...overrides,
  }
}

function base(seatNumber: number) {
  return card(`seat-${seatNumber}-base`, catalogCardAt(REAL_BASES, seatNumber - 1), { type: 'Base', isBase: true })
}

function buildAllPacks() {
  return Array.from({ length: PLAYER_COUNT }, (_, seatIndex) =>
    Array.from({ length: 3 }, (_, packIndex) => ({
      cards: Array.from({ length: CARDS_PER_PACK }, (_, cardIndex) =>
        card(
          `seat-${seatIndex + 1}-pack-${packIndex + 1}-card-${cardIndex + 1}`,
          catalogCardAt(REAL_DRAFT_CARDS, seatIndex * 3 * CARDS_PER_PACK + packIndex * CARDS_PER_PACK + cardIndex)
        )
      ),
    }))
  )
}

function simulateDraft(allPacks) {
  const draftedCards = Array.from({ length: PLAYER_COUNT }, () => [])

  for (let packNumber = 1; packNumber <= 3; packNumber++) {
    const passLeft = packNumber !== 2
    const remaining = allPacks.map(seatPacks => [...seatPacks[packNumber - 1].cards])

    for (let pickInPack = 1; pickInPack <= CARDS_PER_PACK; pickInPack++) {
      for (let pickerIndex = 0; pickerIndex < PLAYER_COUNT; pickerIndex++) {
        const sourceIndex = passLeft
          ? (pickerIndex + (pickInPack - 1)) % PLAYER_COUNT
          : ((pickerIndex - (pickInPack - 1)) % PLAYER_COUNT + PLAYER_COUNT) % PLAYER_COUNT
        const picked = remaining[sourceIndex].shift()
        draftedCards[pickerIndex].push({
          ...picked,
          packNumber,
          pickInPack,
          pickNumber: (packNumber - 1) * CARDS_PER_PACK + pickInPack,
        })
      }
    }
  }

  // Seed one null-pick row for the final slide: visible cards remain, but no picked highlight.
  draftedCards[6] = draftedCards[6].filter(card => !(card.packNumber === 3 && card.pickInPack === 14))

  return draftedCards
}

function simulateLeaders() {
  const originalLeaders = Array.from({ length: PLAYER_COUNT }, (_, seatIndex) =>
    [1, 2, 3].map(round =>
      card(
        `seat-${seatIndex + 1}-leader-${round}`,
        catalogCardAt(REAL_LEADERS, seatIndex * 3 + round - 1),
        { type: 'Leader', isLeader: true }
      )
    )
  )
  const remaining = originalLeaders.map(pack => [...pack])
  const draftedLeaders = Array.from({ length: PLAYER_COUNT }, () => [])

  for (let round = 1; round <= 3; round++) {
    for (let pickerIndex = 0; pickerIndex < PLAYER_COUNT; pickerIndex++) {
      const sourceIndex = ((pickerIndex - (round - 1)) % PLAYER_COUNT + PLAYER_COUNT) % PLAYER_COUNT
      const picked = remaining[sourceIndex].shift()
      draftedLeaders[pickerIndex].push({
        ...picked,
        leaderRound: round,
      })
    }
  }

  return draftedLeaders
}

function deckStateForSeat(seatNumber: number, draftedLeaders) {
  const activeLeader = draftedLeaders[seatNumber - 1][0]
  const chosenBase = base(seatNumber)
  return {
    activeLeader: activeLeader.instanceId,
    activeBase: chosenBase.instanceId,
    cardPositions: {
      [activeLeader.instanceId]: { card: activeLeader, section: 'leaders' },
      [chosenBase.instanceId]: { card: chosenBase, section: 'base' },
    },
  }
}

async function setAuthCookie(page: Page, userResult) {
  const urlObj = new URL(BASE_URL)
  const cookieConfig: any = {
    name: userResult.cookieName,
    value: userResult.token,
    httpOnly: true,
    sameSite: 'Lax',
  }
  if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
    cookieConfig.url = BASE_URL
  } else {
    cookieConfig.domain = urlObj.hostname
    cookieConfig.path = '/'
  }
  await page.context().addCookies([cookieConfig])
}

async function clearAuth(page: Page) {
  await page.context().clearCookies()
}

async function expectNoSlideshowOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="draft-slideshow"]') as HTMLElement | null
    const stage = document.querySelector('[data-testid="slideshow-stage"]') as HTMLElement | null
    if (!overlay || !stage) return { missing: true }
    return {
      missing: false,
      overlayVertical: overlay.scrollHeight <= overlay.clientHeight + 1,
      overlayHorizontal: overlay.scrollWidth <= overlay.clientWidth + 1,
      stageVertical: stage.scrollHeight <= stage.clientHeight + 1,
      stageHorizontal: stage.scrollWidth <= stage.clientWidth + 1,
      bodyLocked: document.body.style.overflow === 'hidden' || getComputedStyle(document.body).overflow === 'hidden',
    }
  })

  expect(metrics.missing).toBe(false)
  expect(metrics.overlayVertical).toBe(true)
  expect(metrics.overlayHorizontal).toBe(true)
  expect(metrics.stageVertical).toBe(true)
  expect(metrics.stageHorizontal).toBe(true)
  expect(metrics.bodyLocked).toBe(true)

  const horizontalIssues = await checkLayoutIssues(page)
  expect(horizontalIssues).toEqual([])
}

async function openSlideshow(page: Page, fixture) {
  await page.goto(`${BASE_URL}/draft/${fixture.podShareId}/report/${fixture.pool1ShareId}`)
  await expect(page.locator('.draft-report-header')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Slideshow Mode' }).click()
  await expect(page.getByTestId('draft-slideshow')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('slideshow-player-tab')).toHaveCount(8)
  await expect(page.getByRole('button', { name: 'Exit Slideshow Mode' })).toBeVisible()
  await expect(page.locator('.auth-widget')).toBeHidden()
  await expect(page.locator('body')).toHaveClass(/draft-slideshow-mode-active/)
  const topRightOwner = await page.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth - 40, 40)
    return Boolean(element?.closest('[data-testid="draft-slideshow"]'))
  })
  expect(topRightOwner).toBe(true)
  const bottomLeftOwner = await page.evaluate(() => {
    const element = document.elementFromPoint(40, window.innerHeight - 40)
    return Boolean(element?.closest('[data-testid="draft-slideshow"]'))
  })
  expect(bottomLeftOwner).toBe(true)
}

async function goToFirstCardPick(page: Page) {
  const next = page.getByTestId('slideshow-edge-next')
  await next.click()
  await next.click()
  await next.click()
  await expect(page.getByTestId('slideshow-slide-label')).toHaveText('Pack 1 · Pick 1')
}

async function goToLastSlide(page: Page) {
  const next = page.getByTestId('slideshow-edge-next')
  for (let i = 0; i < 44; i++) {
    await next.click()
  }
  await expect(page.getByTestId('slideshow-slide-label')).toHaveText('Pack 3 · Pick 14')
}

async function expectLeaderTwoColumnGrid(page: Page) {
  await expect(page.getByTestId('slideshow-stage')).toHaveClass(/draft-slideshow-stage--leader-grid/)
  await expect(page.getByTestId('slideshow-seat-row')).toHaveCount(8)

  const boxes = await page.getByTestId('slideshow-seat-row').evaluateAll(rows =>
    rows.map(row => {
      const rect = row.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    })
  )

  expect(boxes).toHaveLength(8)
  for (const index of [1, 2, 3]) {
    expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThan(4)
    expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y)
  }
  for (const index of [5, 6, 7]) {
    expect(Math.abs(boxes[index].x - boxes[4].x)).toBeLessThan(4)
    expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y)
  }
  expect(boxes[4].x).toBeGreaterThan(boxes[0].x)
  expect(Math.abs(boxes[4].y - boxes[0].y)).toBeLessThan(4)
}

async function expectArtworkBackedTabs(page: Page) {
  await expect(page.locator('.draft-slideshow-all-tab img')).toHaveCount(0)
  await expect(page.locator('.draft-slideshow-player-tab img')).toHaveCount(0)
  await expect(page.locator('.draft-slideshow-all-tab')).toHaveCSS('background-image', /Rule_with_Respect_2ee7f9b662/)
  await expect(page.locator('.draft-slideshow-all-tab')).toHaveCSS('background-position', '50% 82%')
  await expect(page.locator('.draft-slideshow-all-tab')).toHaveCSS('background-size', /195%/)
  const backgrounds = await page.getByTestId('slideshow-player-tab').evaluateAll(tabs =>
    tabs.map(tab => getComputedStyle(tab).backgroundImage)
  )
  expect(backgrounds).toHaveLength(8)
  expect(backgrounds.every(background => background.includes('url('))).toBe(true)
}

async function createFixture(db, users) {
  const allPacks = buildAllPacks()
  const draftedCards = simulateDraft(allPacks)
  const draftedLeaders = simulateLeaders()
  const podShareId = uniqueId('slideshow-pod')

  const podResult = await db.query(
    `INSERT INTO pods (
       share_id, host_id, set_code, set_name, name, status, max_players,
       current_players, pod_type, all_packs, is_log_public, is_public,
       started_at, completed_at, settings, draft_state, state_version, competitive
     )
     VALUES (
       $1, $2, 'SOR', 'Spark of Rebellion', 'Slideshow Fixture Draft', 'complete', 8,
       8, 'draft', $3::jsonb, false, true,
       NOW(), NOW(), '{}'::jsonb, '{}'::jsonb, 1, false
     )
     RETURNING id`,
    [podShareId, users[0].user.id, JSON.stringify(allPacks)]
  )
  const podId = podResult.rows[0].id

  let pool1ShareId = ''
  for (let seatNumber = 1; seatNumber <= PLAYER_COUNT; seatNumber++) {
    const user = users[seatNumber - 1].user
    const isBot = seatNumber === 8
    const isLogPublic = seatNumber === 1 || seatNumber === 3
    const poolShareId = uniqueId(`slideshow-pool-${seatNumber}`)
    if (seatNumber === 1) pool1ShareId = poolShareId

    await db.query(
      `INSERT INTO pod_players (
         pod_id, user_id, seat_number, is_bot, is_log_public,
         drafted_cards, drafted_leaders, pick_status, joined_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'picked', NOW())`,
      [
        podId,
        user.id,
        seatNumber,
        isBot,
        isLogPublic,
        JSON.stringify(draftedCards[seatNumber - 1]),
        JSON.stringify(draftedLeaders[seatNumber - 1]),
      ]
    )

    const cards = [
      ...draftedLeaders[seatNumber - 1],
      ...draftedCards[seatNumber - 1],
      base(seatNumber),
    ]
    const packs = [1, 2, 3].map(packNumber => ({
      name: `Pack ${packNumber}`,
      cards: draftedCards[seatNumber - 1].filter(card => card.packNumber === packNumber),
    }))

    await db.query(
      `INSERT INTO card_pools (
         share_id, pod_id, user_id, set_code, set_name, pool_type, name,
         cards, packs, deck_builder_state, is_public, report_public, hidden,
         created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'SOR', 'Spark of Rebellion', 'draft', $4,
         $5::jsonb, $6::jsonb, $7::jsonb, true, $8, false,
         NOW(), NOW()
       )`,
      [
        poolShareId,
        podId,
        user.id,
        `Player ${seatNumber} Draft Pool`,
        JSON.stringify(cards),
        JSON.stringify(packs),
        JSON.stringify(deckStateForSeat(seatNumber, draftedLeaders)),
        seatNumber === 1,
      ]
    )
  }

  return { podShareId, pool1ShareId }
}

test.describe('Draft Report Slideshow Mode', () => {
  let db: pg.Pool
  let users: any[]
  let stranger: any
  let fixture: { podShareId: string; pool1ShareId: string }

  test.beforeAll(async () => {
    db = new pg.Pool({ connectionString })
    users = []
    for (let i = 1; i <= PLAYER_COUNT; i++) {
      users.push(await createTestUser(`SlideP${i}`, TEST_ID, { isBetaTester: true }))
    }
    stranger = await createTestUser('SlideStranger', TEST_ID, { isBetaTester: true })
    await assignArtworkAvatars(db, users)
    fixture = await createFixture(db, users)
  })

  test.afterAll(async () => {
    if (db) await db.end()
    await cleanupTestUsers(TEST_ID)
    await closeDb()
  })

  test('fits all seats and supports tabs/navigation across desktop viewports', async ({ page }) => {
    await setAuthCookie(page, users[0])

    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport)
      await openSlideshow(page, fixture)
      await expect(page.getByTestId('slideshow-slide-label')).toHaveText('Leaders · Pick 1')
      await expectArtworkBackedTabs(page)
      await expectLeaderTwoColumnGrid(page)
      await expectNoSlideshowOverflow(page)

      await goToFirstCardPick(page)
      await expect(page.getByTestId('slideshow-stage')).not.toHaveClass(/draft-slideshow-stage--leader-grid/)
      await expect(page.getByTestId('slideshow-seat-row')).toHaveCount(8)
      for (const row of await page.getByTestId('slideshow-seat-row').all()) {
        await expect(row.locator('.canvas-card.selected')).toHaveCount(1)
      }
      await expectNoSlideshowOverflow(page)

      await page.getByTestId('slideshow-player-tab').filter({ hasText: 'SlideP1' }).click()
      await expect(page.getByTestId('slideshow-seat-row')).toHaveCount(0)
      await expect(page.locator('.draft-slideshow-stage--single .canvas-card')).toHaveCount(14)
      const width = await page.locator('.draft-slideshow-stage--single .canvas-card').first().evaluate(el => el.getBoundingClientRect().width)
      expect(width).toBeGreaterThan(120)

      await page.getByTestId('slideshow-edge-next').click()
      await expect(page.getByTestId('slideshow-slide-label')).toHaveText('Pack 1 · Pick 2')
      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('slideshow-slide-label')).toHaveText('Pack 1 · Pick 3')
      await expectNoSlideshowOverflow(page)

      await page.keyboard.press('Escape')
      await expect(page.getByTestId('draft-slideshow')).toHaveCount(0)
    }
  })

  test('caps and centers a single final card and hard-stops at the last slide', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await setAuthCookie(page, users[0])
    await openSlideshow(page, fixture)
    await page.getByTestId('slideshow-player-tab').filter({ hasText: 'SlideP1' }).click()

    await goToLastSlide(page)
    const cards = page.locator('.draft-slideshow-stage--single .canvas-card')
    await expect(cards).toHaveCount(1)
    const cardBox = await cards.first().boundingBox()
    const stageBox = await page.getByTestId('slideshow-stage').boundingBox()
    expect(cardBox!.width).toBeLessThanOrEqual(735)
    expect(Math.abs((cardBox!.x + cardBox!.width / 2) - (stageBox!.x + stageBox!.width / 2))).toBeLessThan(10)
    expect(Math.abs((cardBox!.y + cardBox!.height / 2) - (stageBox!.y + stageBox!.height / 2))).toBeLessThan(10)
    await expect(page.getByTestId('slideshow-edge-next')).toBeDisabled()
    await expectNoSlideshowOverflow(page)
    await takeScreenshot(page, 'draft-slideshow-single-final-card')
  })

  test('locks private teammate seats for non-participants without rendering their cards', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await clearAuth(page)
    await setAuthCookie(page, stranger)
    await openSlideshow(page, fixture)
    await goToFirstCardPick(page)

    const privateTab = page.getByTestId('slideshow-player-tab').filter({ hasText: 'SlideP2' })
    await expect(privateTab).toBeDisabled()
    await expect(privateTab).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('slideshow-seat-row')).toHaveCount(3)
    await expect(page.locator('[data-testid="slideshow-seat-row"][data-seat-number="2"]')).toHaveCount(0)
    await expectNoSlideshowOverflow(page)
  })

  test('hides the Slideshow Mode toggle below the desktop threshold', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 })
    await setAuthCookie(page, users[0])
    await page.goto(`${BASE_URL}/draft/${fixture.podShareId}/report/${fixture.pool1ShareId}`)
    await expect(page.locator('.draft-report-header')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Slideshow Mode' })).toHaveCount(0)
  })
})
