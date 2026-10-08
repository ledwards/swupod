# E2E Integration Tests

This directory contains Playwright end-to-end tests for the Protect the Pod application.

## Setup

1. Install dependencies (if not already done):
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

3. Point the suite at a database. Most specs seed a user or a pod through
   `test-utils.ts`, so without this they all fail at the first query:
   ```bash
   # .env.local (gitignored), or exported in your shell
   DATABASE_URL=postgresql://user@localhost:5432/swupod
   ```
   Run `npm run migrate:dev` against it first so the schema exists.

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests with debug logging
```bash
npm run test:e2e -- --debug
```
By default, e2e tests suppress console output for cleaner test results. Use the `--debug` flag to see detailed logging during test execution.

### Run tests with UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see the browser)
```bash
npm run test:e2e:headed
```

### Run only desktop Chrome tests
```bash
npm run test:e2e:chromium
```

### Run only mobile tests
```bash
npm run test:e2e:mobile
```

### Run regression tests only
```bash
npm run test:e2e:regression
```

### View test report
```bash
npm run test:e2e:report
```

## Test Files

### Run on All Browsers (Desktop + Mobile)
- `landing.spec.js` - Tests for the landing page and basic navigation
- `sealed-flow.spec.js` - Tests for the sealed pool creation and viewing flow
- `deck-builder.spec.js` - Tests for the deck builder functionality
- `draft-flow.spec.js` - Tests for the draft page (note: full draft flow requires auth)
- `regression.spec.js` - Comprehensive regression tests for common issues

### Desktop Chromium Only (Skipped on Mobile)
These long-running integration tests are skipped on mobile browsers and non-Chromium browsers:
- `draft-with-bots.spec.js` - 1 human + 7 bots draft (10 min)
- `two-player-draft.spec.js` - 2 player draft flow (5 min)
- `multiplayer-draft.spec.js` - Full 8 player draft (15 min)
- `sealed-happy-path.spec.js` - Complete sealed flow (3 min)

These tests use `test.skip()` to gracefully skip on unsupported configurations and will show as "Skipped" (not failed) in test reports.

## Test Configuration

Tests are configured in `playwright.config.js` at the project root. By default, tests run against:
- Desktop Chrome
- Desktop Firefox
- Desktop Safari (WebKit)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

## Writing New Tests

1. Create a new `.spec.js` file in this directory
2. Import helpers from `helpers.js` for common utilities
3. Use the standard Playwright test API
4. Use debug logging utilities from `debug-utils.js` for conditional logging

Example:
```javascript
import { test, expect } from '@playwright/test'
import { checkLayoutIssues, waitForNetworkIdle } from './helpers.js'
import { debugLog, testLog } from './debug-utils.js'

test.describe('My Feature', () => {
  test('should work correctly', async ({ page }) => {
    debugLog('Starting test...') // Only shows with --debug
    testLog('High-level progress') // Always shows
    
    await page.goto('/my-page')
    await waitForNetworkIdle(page)

    // Check for layout issues
    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)

    // Your assertions here
  })
})
```

### Debug Logging Utilities

Import from `debug-utils.js`:
- `debugLog()` - Only logs when `--debug` flag is used
- `debugError()` - Only logs errors when `--debug` flag is used
- `testLog()` - Always logs (for important progress indicators)

## CI/CD Integration

Tests can be run in CI by setting the `CI=true` environment variable. This will:
- Disable video/trace collection for passing tests
- Use a single worker for stability
- Retry failed tests twice

## Troubleshooting

### Tests fail to connect to localhost:3000
Make sure your dev server is running:
```bash
npm run dev
```

Or let Playwright start it automatically (configured in `playwright.config.js`).

### Browser installation issues
```bash
npx playwright install --with-deps
```

### Timeouts on slow machines
Increase timeouts in the test or configuration:
```javascript
test.setTimeout(60000) // 60 seconds
```
