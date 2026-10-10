import { chromium, expect } from '@playwright/test'
import { createTestUser, getPool } from '../tests/e2e/test-utils'
import { createToken } from '../lib/auth'
import { cleanup } from '../tests/happy-path/helpers'
const run = `solo_start_${Date.now()}`
const db = getPool(), user = await createTestUser('Solo start check', run)
const browser = await chromium.launch()
try {
  const row = (await db.query('UPDATE users SET is_alpha_tester=true WHERE id=$1 RETURNING *', [user.user.id])).rows[0]
  const context = await browser.newContext({viewport:{width:1600,height:1100}})
  await context.addCookies([{ name: user.cookieName, value: createToken(row), url: 'http://localhost:3000' }])
  const page = await context.newPage()
  await page.goto('http://localhost:3000/draft')
  await page.getByRole('button', { name: 'ASH Ashes of the Empire', exact: true }).click()
  await page.getByRole('button', { name: 'Start Draft', exact: true }).click()
  await expect(page).toHaveURL(/\/draft\/(?!solo)[^/?]+$/, { timeout: 90000 })
  const shareId = new URL(page.url()).pathname.split('/').pop()
  const pod = (await db.query('SELECT id,set_code,status,settings FROM pods WHERE share_id=$1', [shareId])).rows[0]
  expect(pod.set_code).toBe('ASH')
  expect(pod.status).toBe('waiting')
  await expect(page.getByRole('button', { name: 'Deal Packs', exact: true })).toBeVisible({ timeout: 60000 })
  await page.getByRole('button', { name: "I'm Ready", exact: true }).click()
  await page.getByRole('button', { name: 'Deal Packs', exact: true }).click()
  await expect(page.getByText('Open Leaders', { exact: true })).toBeVisible({ timeout: 60000 })
  await page.screenshot({ path: '/tmp/draft-open-leaders.png' })
  await page.getByRole('button', { name: 'Start Draft', exact: true }).click()
  await expect(page.locator('.leader-draft-phase')).toBeVisible()
  await page.locator('.leaders-grid .draftable-card').first().click()
  await expect(page.getByRole('button', { name: 'Confirm Pick', exact: true })).toBeEnabled({ timeout: 15000 })
  await page.mouse.move(0, 0)
  await page.screenshot({ path: '/tmp/draft-pick-confirm.png' })
  for (let round=0; round<3; round++) {
    if (round>0) {
      await expect(page.locator('.leaders-grid .draftable-card:not(.disabled)').first()).toBeVisible({timeout:30000})
      await page.locator('.leaders-grid .draftable-card:not(.disabled)').first().click()
    }
    await page.getByRole('button', {name:'Confirm Pick',exact:true}).click({timeout:30000})
    await expect(page.getByRole('button', {name:'Confirm Pick',exact:true})).toHaveCount(0,{timeout:30000})
  }
  await expect(page.locator('.pack-draft-phase')).toBeVisible({timeout:30000})
  await page.locator('.pack-grid .draftable-card:not(.disabled)').first().click()
  await expect(page.getByRole('button',{name:'Confirm Pick',exact:true})).toBeEnabled({timeout:15000})
  const confirmation=page.locator('.pack-draft-phase .pick-confirmation-content')
  expect((await confirmation.boundingBox())!.width).toBeLessThanOrEqual(560)
  await page.mouse.move(0,0)
  await page.screenshot({path:'/tmp/draft-pack-phase.png'})
  expect(pod.settings.isSolo).toBe(true)
  const players = (await db.query('SELECT is_bot FROM pod_players WHERE pod_id=$1', [pod.id])).rows
  expect(players).toHaveLength(8)
  expect(players.filter(p => p.is_bot)).toHaveLength(7)
  console.log('PASS: selected ASH opens setup with seven bots, then leader preview and selectable/confirmable leaders, without another set picker.')
} finally {
  await browser.close()
  await cleanup(run)
}
