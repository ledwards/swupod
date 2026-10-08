import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./tests/e2e',testMatch:'solo-sideboard.spec.ts',timeout:60000,workers:1,
 use:{baseURL:process.env.TEST_BASE_URL??'http://127.0.0.1:4484',browserName:'chromium',actionTimeout:15000},reporter:'list'})
