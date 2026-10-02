import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'beta-entry.spec.ts',
  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:3018',
    viewport: { width: 1440, height: 1000 },
  },
  workers: 1,
  reporter: 'list',
})
