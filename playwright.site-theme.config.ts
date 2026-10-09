import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./tests/e2e',outputDir:'test-results-site-theme',testMatch:'site-theme.spec.ts',workers:1,timeout:90000,use:{baseURL:'http://localhost:3000',screenshot:'only-on-failure'}})
