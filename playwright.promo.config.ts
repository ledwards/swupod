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
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bash scripts/promo-e2e-server.sh ${PORT}`,
    url: `${BASE_URL}/`,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})
