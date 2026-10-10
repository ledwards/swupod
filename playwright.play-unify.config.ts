import {defineConfig} from '@playwright/test'
export default defineConfig({testDir: './tests/e2e', outputDir: 'test-results-play-unify', testMatch: /play-unify\.spec\.ts/, workers: 2, timeout: 120000, use: {baseURL: process.env.PTP_BASE_URL ?? 'http://localhost:3000', screenshot: 'only-on-failure'}})
