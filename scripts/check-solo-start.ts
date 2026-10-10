import { chromium, expect } from '@playwright/test'
import { createTestUser, getPool } from '../tests/e2e/test-utils'
import { createToken } from '../lib/auth'
import { cleanup } from '../tests/happy-path/helpers'
const run = `solo_start_${Date.now()}`
const db = getPool(), user = await createTestUser('Solo start check', run)
const browser = await chromium.launch()
try {
  const row = (await db.query('UPDATE users SET is_alpha_tester=true WHERE id=$1 RETURNING *', [user.user.id])).rows[0]
  const context = await browser.newContext()
  await context.addCookies([{ name: user.cookieName, value: createToken(row), url: 'http://localhost:3000' }])
  const page = await context.newPage()
  await page.goto('http://localhost:3000/draft')
  await page.getByRole('button', { name: 'ASH Ashes of the Empire', exact: true }).click()
  await page.getByRole('button', { name: 'Start Draft', exact: true }).click()
  await expect(page).toHaveURL(/\/draft\/(?!solo)[^/?]+$/, { timeout: 90000 })
  const shareId = new URL(page.url()).pathname.split('/').pop()
  const pod = (await db.query('SELECT id,set_code,status,settings FROM pods WHERE share_id=$1', [shareId])).rows[0]
  expect(pod.set_code).toBe('ASH')
  expect(pod.status).toBe('active')
  expect(pod.settings.isSolo).toBe(true)
  const players = (await db.query('SELECT is_bot FROM pod_players WHERE pod_id=$1', [pod.id])).rows
  expect(players).toHaveLength(8)
  expect(players.filter(p => p.is_bot)).toHaveLength(7)
  console.log('PASS: selected ASH starts an active solo draft with seven bots, without another set picker.')
} finally {
  await browser.close()
  await cleanup(run)
}
