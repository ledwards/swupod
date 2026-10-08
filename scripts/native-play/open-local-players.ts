/** Open two independent, authenticated browsers against the isolated local fixture. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { parse } from 'dotenv'

const directory = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? '/tmp/ptp-native-fullstack')
const headless = process.argv.includes('--check')
const env = parse(await readFile(`${directory}/fixture.env`, 'utf8'))
const fixture = JSON.parse(await readFile(`${directory}/accounts.json`, 'utf8'))
const host = env.PTP_PUBLIC_ORIGIN!, gateway = env.PURRGIL_PUBLIC_ORIGIN!
for (const value of [host, gateway, env.DATABASE_URL!]) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname)) throw new Error('Only loopback fixture targets are allowed')
}
if (!new URL(env.DATABASE_URL!).pathname.startsWith('/ptp_native_fixture_')) throw new Error('An isolated fixture database is required')
for (const url of [host + '/api/play/native/decks', gateway + '/ready']) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (response.status >= 500) throw new Error(`Local service is not ready at ${new URL(url).origin}`)
}
// Separate browser processes keep host and gateway cookies isolated. These are
// temporary profiles: neither the user's normal browser nor its logins change.
const browsers = []
try {
  for (const [seat, account] of fixture.accounts.entries()) {
    const browser = await chromium.launch({ headless, args: [`--window-position=${seat * 80},${seat * 60}`, '--window-size=1400,950'] })
    browsers.push(browser)
    const context = await browser.newContext({ viewport: null })
    await context.addCookies([account.cookie])
    const page = await context.newPage()
    await page.goto(`${host}/play?pool=${encodeURIComponent(account.poolShareId)}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Find game', exact: true }).waitFor({ timeout: 30000 })
    console.log(`Player ${seat + 1}: ${host}/play (signed in as ${account.username})`)
  }
  if (headless) {
    console.log('Both local player windows authenticated and reached the native lobby.')
  } else {
    console.log('Click Find game in both windows to pair them. Keep this process running; Ctrl-C closes the test browsers.')
    await new Promise<void>(resolve => {
      let remaining = browsers.length
      for (const browser of browsers) browser.on('disconnected', () => { if (--remaining === 0) resolve() })
      process.once('SIGINT', resolve)
      process.once('SIGTERM', resolve)
    })
  }
} finally {
  await Promise.all(browsers.map(browser => browser.close()))
}
