import {defineConfig} from '@playwright/test'

// API doubles only: no global database seed or production writes.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'draft-table.spec.ts',
  workers: 1,
  timeout: 45000,
  use: {baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000', screenshot: 'only-on-failure'},
})
