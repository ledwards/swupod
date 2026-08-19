// @ts-nocheck
/**
 * Chat Persistence E2E Tests
 *
 * Tests the Discord-only chat persistence behavior:
 * - Private pods show "private pod" notice in chat panel
 * - Public pods show normal chat with Discord history
 * - "Make Pod Public" button appears for hosts only
 * - Chat panel renders correctly on both desktop and mobile
 */
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { waitForNetworkIdle, shouldIgnoreError, checkLayoutIssues } from './helpers.ts'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_ID = 'chat_persist'

test.describe('Chat Persistence - Sealed Pod', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  let browser: Browser
  let context: BrowserContext
  let page: Page
  let user: any
  let shareId: string

  test.beforeAll(async () => {
    user = await createTestUser('ChatTestHost', TEST_ID, { isBetaTester: true })
    browser = await chromium.launch()
    context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1280, height: 800 },
    })
    await context.addCookies([{
      name: user.cookieName,
      value: user.token,
      url: BASE_URL,
    }])
    page = await context.newPage()

    // Track errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error' && !shouldIgnoreError(msg.text())) {
        errors.push(msg.text())
      }
    })
    ;(page as any).errors = errors
  })

  test.afterAll(async () => {
    // Clean up the pod if we created one
    if (shareId) {
      try {
        await page.request.delete(`${BASE_URL}/api/sealed/${shareId}`, {
          headers: { Cookie: `${user.cookieName}=${user.token}` },
        })
      } catch { /* pod may already be deleted */ }
    }
    await cleanupTestUsers(TEST_ID)
    await closeDb()
    await context?.close()
    await browser?.close()
  })

  test('create a private sealed pod', async () => {
    // Create a private sealed pod via API
    const response = await page.request.post(`${BASE_URL}/api/sealed`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${user.cookieName}=${user.token}`,
      },
      data: {
        setCode: 'SOR',
        maxPlayers: 4,
        isPublic: false,
      },
    })

    // Say what the API objected to — a bare "false" here tells you nothing.
    expect(response.ok(), `POST /api/draft ${response.status()}: ${await response.text()}`).toBeTruthy()
    const data = await response.json()
    shareId = (data.data || data).shareId
    expect(shareId).toBeTruthy()
  })

  test('private pod shows private notice in chat panel', async () => {
    await page.goto(`/sealed/${shareId}`)
    await waitForNetworkIdle(page)

    // Open chat panel (desktop toggle)
    const chatToggle = page.locator('.chat-panel-toggle')
    if (await chatToggle.isVisible()) {
      await chatToggle.click()
      await page.waitForTimeout(500)
    }

    // Check for the private pod notice
    const notice = page.locator('.chat-private-pod-notice')
    await expect(notice).toBeVisible({ timeout: 10_000 })
    await expect(notice).toContainText('Private pods do not store chat history')
  })

  test('host sees Make Pod Public button', async () => {
    const makePublicButton = page.locator('.chat-private-pod-notice button:has-text("Make Pod Public")')
    await expect(makePublicButton).toBeVisible()
  })

  test('chat input still works for live messages on private pod', async () => {
    // Even on private pods, the chat input should be functional for live messages
    const chatInput = page.locator('.chat-input')
    await expect(chatInput).toBeVisible()
    await expect(chatInput).toBeEnabled()
  })

  test('clicking Make Pod Public removes notice', async () => {
    const makePublicButton = page.locator('.chat-private-pod-notice button:has-text("Make Pod Public")')
    await makePublicButton.click()

    // Wait for the settings update to propagate
    await page.waitForTimeout(2000)

    // The private notice should disappear
    const notice = page.locator('.chat-private-pod-notice')
    await expect(notice).not.toBeVisible({ timeout: 10_000 })
  })

  test('no layout issues with chat panel open', async () => {
    const issues = await checkLayoutIssues(page)
    // Filter out chat panel overflow (it's fixed positioned, expected to extend)
    const realIssues = issues.filter(i => !i.includes('chat-panel'))
    expect(realIssues).toHaveLength(0)
  })
})

test.describe('Chat Persistence - Draft Pod', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  let browser: Browser
  let context: BrowserContext
  let page: Page
  let user: any
  let shareId: string

  test.beforeAll(async () => {
    user = await createTestUser('ChatDraftHost', TEST_ID, { isBetaTester: true })
    browser = await chromium.launch()
    context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1280, height: 800 },
    })
    await context.addCookies([{
      name: user.cookieName,
      value: user.token,
      url: BASE_URL,
    }])
    page = await context.newPage()

    page.on('console', msg => {
      if (msg.type() === 'error' && !shouldIgnoreError(msg.text())) {
        ;(page as any).errors = (page as any).errors || []
        ;(page as any).errors.push(msg.text())
      }
    })
  })

  test.afterAll(async () => {
    if (shareId) {
      try {
        await page.request.delete(`${BASE_URL}/api/draft/${shareId}`, {
          headers: { Cookie: `${user.cookieName}=${user.token}` },
        })
      } catch { /* pod may already be deleted */ }
    }
    await cleanupTestUsers(TEST_ID)
    await closeDb()
    await context?.close()
    await browser?.close()
  })

  test('create a private draft pod', async () => {
    const response = await page.request.post(`${BASE_URL}/api/draft`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${user.cookieName}=${user.token}`,
      },
      data: {
        setCode: 'SOR',
        maxPlayers: 4,
        isPublic: false,
      },
    })

    // Say what the API objected to — a bare "false" here tells you nothing.
    expect(response.ok(), `POST /api/draft ${response.status()}: ${await response.text()}`).toBeTruthy()
    const data = await response.json()
    shareId = (data.data || data).shareId
    expect(shareId).toBeTruthy()
  })

  test('draft private pod shows private notice', async () => {
    await page.goto(`/draft/${shareId}`)
    await waitForNetworkIdle(page)

    // Open chat
    const chatToggle = page.locator('.chat-panel-toggle')
    if (await chatToggle.isVisible()) {
      await chatToggle.click()
      await page.waitForTimeout(500)
    }

    const notice = page.locator('.chat-private-pod-notice')
    await expect(notice).toBeVisible({ timeout: 10_000 })
    await expect(notice).toContainText('Private pods do not store chat history')
  })

  test('draft host sees Make Pod Public button', async () => {
    const makePublicButton = page.locator('.chat-private-pod-notice button:has-text("Make Pod Public")')
    await expect(makePublicButton).toBeVisible()
  })
})

test.describe('Chat Panel - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  let user: any

  test.beforeAll(async () => {
    user = await createTestUser('ChatMobileUser', TEST_ID, { isBetaTester: true })
  })

  test.afterAll(async () => {
    await cleanupTestUsers(TEST_ID)
    await closeDb()
  })

  test('mobile shows floating chat button', async ({ page, context }) => {
    await context.addCookies([{
      name: user.cookieName,
      value: user.token,
      url: BASE_URL,
    }])

    // Create a pod first
    const response = await page.request.post(`${BASE_URL}/api/sealed`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${user.cookieName}=${user.token}`,
      },
      data: { setCode: 'SOR', maxPlayers: 4, isPublic: false },
    })
    const data = await response.json()
    const shareId = (data.data || data).shareId

    await page.goto(`/sealed/${shareId}`)
    await waitForNetworkIdle(page)

    // On mobile, the chat FAB should be visible
    const fab = page.locator('.chat-fab')
    await expect(fab).toBeVisible({ timeout: 10_000 })

    // Click FAB to open chat overlay
    await fab.click()
    await page.waitForTimeout(500)

    // Chat overlay should show with private notice
    const overlay = page.locator('.chat-overlay')
    await expect(overlay).toBeVisible()

    const notice = page.locator('.chat-private-pod-notice')
    await expect(notice).toBeVisible()

    // Clean up pod
    await page.request.delete(`${BASE_URL}/api/sealed/${shareId}`, {
      headers: { Cookie: `${user.cookieName}=${user.token}` },
    }).catch(() => {})
  })
})
