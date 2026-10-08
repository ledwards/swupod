/** Real browser handoff check. Uses an existing signed-in beta user's storage state. */
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const [entryUrl, storageState, gatewayOrigin] = process.argv.slice(2)
if (!entryUrl || !storageState || !gatewayOrigin) {
  throw Error('Usage: tsx scripts/native-play/verify-browser-launch.ts <AI setup URL> <storage-state.json> <public game origin>')
}
const entry = new URL(entryUrl)
assert.equal(entry.pathname, '/limited/ai')
assert.ok(entry.searchParams.get('pool'), 'Choose a saved deck')
assert.ok(entry.searchParams.get('request'), 'Use a prepared game request to avoid creating another opponent')
const gateway = new URL(gatewayOrigin).origin
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ storageState })
  const page = await context.newPage()
  const handoffs: number[] = []
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/play/native/handoff') handoffs.push(response.status())
  })
  await page.goto(entry.href)
  await page.getByRole('button', { name: /^(Play vs AI|Resume game)$/ }).click({ timeout: 60000 })
  await page.waitForURL(url => url.origin === gateway && /^\/table\/[^/]+\/[01]\/$/.test(url.pathname), { timeout: 60000 })
  assert.deepEqual(handoffs, [303], 'Host handoff must redirect, not render or reload the setup page')
  const scope = page.url()
  const sessionResponse = await context.request.get(`${scope}api/session`)
  assert.equal(sessionResponse.status(), 200, 'Scoped game cookie must authenticate')
  const session = await sessionResponse.json()
  assert.equal(session.mode, 'live')
  assert.equal(session.seat, 0)
  const gameResponse = await context.request.get(`${scope}api/game`)
  assert.equal(gameResponse.status(), 200, 'Authenticated gateway must reach the real engine')
  const payload = await gameResponse.json()
  const messages = Array.isArray(payload) ? payload : payload.messages ?? [payload]
  assert.ok(messages.some((message: {type: string}) => message.type === 'view'), 'Engine must supply a game view')
  await expect(page.locator('.table-frame')).toBeVisible({ timeout: 30000 })
  console.log('PASS Play → host authorization → scoped game session → engine view → visible board')
  // Do not print launch credentials or hidden card data. No game decisions are submitted.
} finally {
  await browser.close()
}
