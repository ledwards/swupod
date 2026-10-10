import { chromium, expect } from '@playwright/test'
import { createTestUser, getPool, closeDb } from '../tests/e2e/test-utils'
import { createToken } from '../lib/auth'
import { randomUUID } from 'node:crypto'

const origin = process.env.POD_CHECK_ORIGIN || 'http://localhost:3000'
const db = getPool()
const user = await createTestUser('Pod delete check', 'unfinished_check')
const browser = await chromium.launch()
const ids: string[] = []
try {
  const row = (await db.query('UPDATE users SET is_alpha_tester=true WHERE id=$1 RETURNING *', [user.user.id])).rows[0]
  // The unfinished pod is older than 20 completed drafts: history pagination must not hide it.
  for (let i = 0; i < 22; i++) {
    const id = randomUUID()
    ids.push(id)
    await db.query(`INSERT INTO pods(id, share_id, host_id, set_code, set_name, pod_type, status, current_players, max_players, created_at)
      VALUES($1,$2,$3,'HMW',$4,'draft',$5,1,8,NOW() - ($6 || ' days')::interval)`,
      [id, `check-${id}`, user.user.id, i === 0 ? 'Disposable unfinished pod' : 'Completed fixture', i === 0 ? 'active' : 'complete', i === 0 ? '10' : '0'])
    await db.query('INSERT INTO pod_players(pod_id,user_id,seat_number,is_bot) VALUES($1,$2,1,false)', [id,user.user.id])
  }
  const context = await browser.newContext()
  await context.addCookies([{ name: user.cookieName, value: createToken(row), url: origin }])
  const page = await context.newPage()
  await page.goto(`${origin}/draft`)
  const section = page.getByRole('region', { name: 'Unfinished pods', exact: true })
  await expect(section.getByText('Disposable unfinished pod', { exact: false })).toBeVisible({ timeout: 60000 })
  await expect(section.getByText('Completed fixture', { exact: false })).toHaveCount(0)
  await section.getByRole('button', { name: 'Delete draft', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await page.route('**/api/draft/check-*', async route => {
    if (route.request().method() === 'DELETE') await route.fulfill({ status: 503, json: { error: 'Temporary deletion failure' } })
    else await route.continue()
  })
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Temporary deletion failure')
  await expect(section.getByText('Disposable unfinished pod', { exact: false })).toBeVisible()
  await page.unroute('**/api/draft/check-*')
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(dialog).toHaveCount(0, { timeout: 30000 })
  await page.reload()
  await expect(section.getByText('Nothing waiting on you.')).toBeVisible({ timeout: 30000 })
  if ((await db.query('SELECT id FROM pods WHERE id=$1', [ids[0]])).rowCount !== 0) throw new Error('Deleted pod persisted')
  await page.screenshot({ path: '/tmp/unfinished-pods-verified.png' })
  console.log('PASS: old unfinished pod included; completed pods excluded; deletion failure shown; retry deletes; reload stays deleted.')
} finally {
  await browser.close()
  await db.query('DELETE FROM pod_players WHERE pod_id=ANY($1::uuid[])', [ids])
  await db.query('DELETE FROM pods WHERE id=ANY($1::uuid[])', [ids])
  await db.query('DELETE FROM users WHERE id=$1', [user.user.id])
  await closeDb()
}
