// @ts-nocheck
import { defineConfig, devices } from '@playwright/test'

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Parallel, but know what that costs. regression.spec, lobby-open-games.spec
     and multiplayer.spec produce 24 failures together on 4 workers and 0 on one:
     several specs assert on globally visible state, and the landing board lists
     whatever open games exist right now.

     Serialising the WHOLE suite does not fix it though — measured 74 failures on
     4 workers against 72 on one, for 3x the runtime (20min -> 1.3h). Every spec
     file passes alone and the suite fails either way, so the dominant cause is
     state accumulating across a run, not how tests are scheduled. Not worth the
     runtime until that is found. */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use - dot for compact CLI output, html for detailed report, json for summary script */
  reporter: [
    ['dot'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers
   * Local dev: Only Chromium (fast feedback)
   * CI: All browsers (comprehensive coverage)
   */
  projects: process.env.CI ? [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ] : [
    // Local development: just Chromium for speed
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    /* Production build, not `npm run dev`. Dev compiles routes on demand, so the
       first hit on a page costs seconds — one spec measured 19.2s against its own
       10s budget — and the dev overlay adds DOM that count assertions trip over.
       Switching to a built server took the suite from 37 passing to 68 before any
       other change. E2E_DEV=1 restores the dev server for quick local iteration.

       `next build` refuses to run without JWT_SECRET, so set one (any value) when
       running this suite. */
    command: process.env.E2E_DEV ? 'npm run dev' : 'npm run build && npm start',
    // Honor TEST_BASE_URL so a suite pointed at another port (e.g. a worktree
    // dev server) reuses that server instead of booting a second one on :3000.
    url: process.env.TEST_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    /* A cold production build is minutes, not seconds — and a CI runner is
       slower than a laptop. Generous on purpose: a build that overruns this
       fails the job for a reason that has nothing to do with any test. */
    timeout: (process.env.E2E_DEV ? 120 : 900) * 1000,
  },
})
