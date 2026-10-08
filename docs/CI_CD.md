# CI/CD and Testing Documentation

This document describes the automated testing and deployment pipeline for the SWU Pod application.

## Overview

Every deployment automatically runs:
1. **Unit tests** - Test individual components and utilities
2. **QA tests** - Validate pack generation quality across all sets
3. **Migrations** - Apply database schema changes
4. **Build** - Compile Next.js application
5. **Artifact generation** - Create QA results file for serving

## Build Pipeline

### Local Development

```bash
# Run tests manually
npm run test          # Run all unit tests
npm run qa            # Run QA tests (generates results.json)
npm run lint          # Check code style

# Build for production
npm run build         # Runs prebuild → migrate → build → postbuild
```

### Automated Pipeline (Vercel)

When you push to main/master or open a PR:

1. **Pre-build** (`scripts/prebuild.js`)
   - Runs all unit tests (belt tests, utils, draft logic, card fixes)
   - Runs QA tests on pack generation (100 pods per set)
   - Generates `src/qa/results.json` with test results
   - Continues even if tests fail (logs warnings)

2. **Migration** (`scripts/migrate-on-deploy.js`)
   - Connects to production database
   - Applies pending SQL migrations
   - Tracks applied migrations in `migrations` table

3. **Build** (`next build`)
   - Compiles Next.js application
   - Optimizes for production
   - Generates static and server-side rendered pages

4. **Post-build** (`scripts/postbuild.js`)
   - Copies QA results to `public/qa-results.json`
   - Verifies all required artifacts exist
   - Ensures QA results are accessible via `/qa-results.json`

## GitHub Actions (Optional)

If using GitHub, the CI workflow (`.github/workflows/ci.yml`) provides:

- **Automated testing** on every push and PR
- **Test result artifacts** uploaded and preserved for 30 days
- **PR comments** with test summaries
- **Lint checks** to maintain code quality

### Workflow Triggers

- Push to `main`, `master`, or `develop` branches
- Pull requests to these branches
- Manual dispatch via GitHub Actions UI

### Viewing Results

1. **In GitHub**: Go to Actions tab → Select workflow run → View logs
2. **In Vercel**: Check deployment logs for test results
3. **QA Results**: Access `/qa-results.json` on deployed site

## QA Test Results

The QA results file (`src/qa/results.json`) contains:

```json
{
  "runAt": "2024-01-26T12:00:00.000Z",
  "summary": {
    "total": 108,
    "passed": 107,
    "failed": 1
  },
  "tests": [
    {
      "suite": "SOR",
      "name": "all packs have 16 cards",
      "status": "passed",
      "executionTime": 0.5
    }
  ]
}
```

### Accessing QA Results

**On the server:**
```javascript
// Via API route
const response = await fetch('/qa-results.json')
const qaResults = await response.json()

// Or read from file system
import { readFileSync } from 'fs'
const qaResults = JSON.parse(readFileSync('public/qa-results.json', 'utf8'))
```

**During build:**
```javascript
// Read directly from source
import qaResults from '../src/qa/results.json' assert { type: 'json' }
```

## Test Types

### Unit Tests (`npm run test`)

- **Belt Tests** (`src/belts/*.test.js`)
  - Leader, Base, Common, Uncommon, Rare/Legendary
  - Foil, Hyperfoil, Hyperspace variants
  - Showcase leaders
  
- **Utility Tests** (`src/utils/*.test.js`)
  - Pack generation (`boosterPack.test.js`)
  - Draft logic (`draftLogic.test.js`)
  - Card fixes (`cardFixes.test.js`)

- **Data Tests** (`src/data/*.test.js`)
  - Card data validation
  - Card count verification

### QA Tests (`npm run qa`)

Generates 100 sealed pods (600 packs) per set and validates:

- **Pack Structure**
  - 16 cards per pack
  - 1 leader, 1 base, 1 foil
  - 9 commons, 2-3 uncommons, 1-2 rares

- **Rarity Distribution**
  - Correct card counts by rarity
  - Upgrade mechanics working properly
  - No invalid card combinations

- **Duplicate Prevention**
  - No duplicate cards in single packs
  - Reasonable duplicate rates across pods
  - Statistical outlier detection

- **Special Mechanics**
  - Hyperspace variants appearing correctly
  - Showcase leaders at expected rates
  - Foil distribution balanced

- **Aspect Coverage**
  - All 6 aspects present in commons
  - Belt alternation working properly

## Deployment Environments

### Production (main branch)
- Full database migrations
- QA results included
- All tests run
- Deployed to: `swupod.vercel.app`

### Preview (PR branches)
- Full database migrations (uses preview DB)
- QA results included
- All tests run
- Unique URL per PR

## Troubleshooting

### Tests Failing

**Check test output:**
```bash
npm run test 2>&1 | tee test-output.txt
npm run qa 2>&1 | tee qa-output.txt
```

**Common issues:**
- Card data changed → Update fixtures/expected values
- Random test failures → QA tests are probabilistic (re-run)
- Migration conflicts → Check database state

### QA Results Not Available

**Verify file exists:**
```bash
ls -la src/qa/results.json
ls -la public/qa-results.json
```

**Regenerate manually:**
```bash
npm run qa
node scripts/postbuild.js
```

### Build Failures

**Check Vercel logs:**
1. Go to Vercel dashboard
2. Select deployment
3. View "Building" logs
4. Look for script errors

**Local debugging:**
```bash
# Run build steps individually
node scripts/prebuild.js
node scripts/migrate-on-deploy.js  # Only if POSTGRES_URL set
npm run build
```

## Configuration Files

- `package.json` - Build scripts and dependencies
- `vercel.json` - Vercel deployment configuration
- `.github/workflows/ci.yml` - GitHub Actions workflow
- `scripts/prebuild.js` - Pre-build test runner
- `scripts/postbuild.js` - Post-build artifact manager
- `scripts/migrate-on-deploy.js` - Database migration runner

## Best Practices

1. **Always run tests locally before pushing:**
   ```bash
   npm run test && npm run qa
   ```

2. **Review QA results after changes to pack generation**

3. **Check CI results before merging PRs**

4. **Keep migrations idempotent** (can run multiple times safely)

5. **Don't skip tests** - They catch real bugs!

## Monitoring

### After Each Deployment

- [ ] Check Vercel deployment status
- [ ] Verify QA results are accessible: `https://www.protectthepod.com/qa-results.json`
- [ ] Review test summary in deployment logs
- [ ] Test a few pack generations manually
- [ ] Check database migrations applied correctly

### Weekly

- [ ] Review GitHub Actions artifacts
- [ ] Check for failing tests trend
- [ ] Monitor QA test statistics
- [ ] Clean up old preview deployments

## Future Improvements

- Add E2E tests with Playwright (already configured)
- Set up automated performance benchmarks
- Add test coverage reporting
- Create visual regression tests for pack UI
- Set up alerts for consistent test failures

## Questions?

- See main [README.md](../README.md) for general documentation
- Check [STATS_IMPLEMENTATION.md](../STATS_IMPLEMENTATION.md) for stats feature details
- Review test files for specific test documentation
