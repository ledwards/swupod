// @ts-nocheck
import { defineConfig, devices } from '@playwright/test'

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Seed the stats fixtures before any test runs — see tests/e2e/global-setup.ts
     for why this cannot live in a spec's beforeAll. */
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  /* The GC promo giveaway has its own harness — playwright.promo.config.ts boots
     a server with the claim window forced open, because the feature is only
     claimable inside a date range. This config has no such server, so picking
     the file up here just runs six tests that cannot pass. Run them with
     `npm run test:promo:e2e`. */
  /* import-pool-crop-verify is a diagnostic, not a regression test: it needs
     two real registration-sheet photos on disk and makes a live, paid
     Anthropic extraction call. Point IMPORT_POOL_CROP_PHOTOS at a pair of
     photos and run `npm run test:e2e:crop-verify` when investigating crops. */
  testIgnore: /(gc-promo-packs|import-pool-crop-verify)\.spec\.ts/,
  /* Parallel. Serialising the whole suite was measured and does not help:
     74 failures on 4 workers against 72 on one, for 3x the runtime
     (20min -> 1.3h). The failures that looked scheduling-dependent reproduce
     one spec at a time — they were stale expectations, not interference — so
     the parallel runtime is the better trade. Specs that do share globally
     visible state (the landing board lists whatever open games exist right
     now) declare `test.describe.configure({ mode: 'serial' })` themselves. */
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

    /* An action with no timeout does not fail, it hangs. One stale selector
       inside an 8-player spec sat on a disabled button for 25 minutes against
       that spec's 90-minute budget, producing no output at all. Bounded, the
       same situation fails in seconds with the call log that names it. */
    actionTimeout: 15_000,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'on-first-retry',

    /* Hermetic: every host except the app itself resolves to nothing.
       Pages pull card art from an external CDN, and `page.goto` waits for the
       load event — so on any machine that cannot reach it, those requests hang
       until something upstream gives up. Measured on a production build: 14.4s
       to load the landing page and 14.1s for Terms of Service, a static page,
       against the suite's own 10s budget. Failing the lookup instantly costs
       nothing real (the app already falls back when art will not load) and
       stops the suite depending on a third party being up and fast. */
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
    },
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
    env: {
      /* `npm start` runs the built server, which means NODE_ENV=production, and
         the /api/test/* routes refuse to run in production unless this is set.
         Those routes are how the suite mints users and pods, so without it every
         spec that needs a logged-in fixture fails with a 403 that has nothing to
         do with the behaviour under test. */
      ALLOW_TEST_USERS: '1',
      /* Socket.io only accepts origins built from APP_URL and friends, plus
         localhost — and localhost is added for dev only. `npm start` is
         production, so without this every websocket handshake from the suite
         is refused with a 400 and the app runs with no real-time layer at all,
         quietly falling back to polling. */
      APP_URL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    },
    /* A cold production build is minutes, not seconds — and a CI runner is
       slower than a laptop. Generous on purpose: a build that overruns this
       fails the job for a reason that has nothing to do with any test. */
    timeout: (process.env.E2E_DEV ? 120 : 900) * 1000,
  },
})
