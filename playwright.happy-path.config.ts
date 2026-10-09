import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/happy-path',
  testMatch: '*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    ['./tests/happy-path/reporter.ts'],
    ['json', { outputFile: 'test-results-happy-path/results.json' }],
  ],
  outputDir: 'test-results-happy-path/artifacts',
  use: {
    baseURL: 'http://localhost:3025',
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/happy-path/stack.mjs',
    url: 'http://localhost:3025',
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    reuseExistingServer: process.env.HAPPY_PATH_REUSE === '1',
  },
})
