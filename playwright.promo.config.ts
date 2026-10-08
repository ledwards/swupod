import { defineConfig, devices } from '@playwright/test'

// Dedicated config for the GC promo-packs e2e (npm run test:promo:e2e).
//
// Unlike the default config (which drives `npm run dev` on :3000), this boots the server on a
// separate port with the claim window forced open, so it never collides with a dev server you
// have running on :3000. Playwright owns the server lifecycle — it starts it, waits, and tears
// it down. Requires a local Postgres with migration 078 applied.
const PORT = process.env.PROMO_E2E_PORT || '3099'
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /gc-promo-packs\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: [['list']],
  /* These tests claim a pack, generate a pool and sit through the opening
     animation. The 30s default left one of them waiting 25s for the animation
     inside a 30s budget — unwinnable regardless of the app. */
  timeout: 120 * 1000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    /* Bound actions so a stale selector fails with its call log instead of
       burning the whole test budget in silence. */
    actionTimeout: 15_000,
    /* Hermetic, for the same reason as the default config: card art comes from
       an external CDN, page loads wait on it, and a machine that cannot reach
       it spends the budget waiting instead of testing. */
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bash scripts/promo-e2e-server.sh ${PORT}`,
    url: `${BASE_URL}/`,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})
