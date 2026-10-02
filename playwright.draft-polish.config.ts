import {defineConfig} from '@playwright/test'

export default defineConfig({
 testDir:'./tests/e2e',
 testMatch:'draft-polish.spec.ts',
 workers:1,
 timeout:45000,
 use:{baseURL:process.env.TEST_BASE_URL || 'http://localhost:3000', screenshot:'only-on-failure'},
})
