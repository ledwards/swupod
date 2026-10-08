# CI/CD Quick Start Guide

## TL;DR - What Happens on Every Deploy

✅ **Tests run automatically**  
📊 **QA generates pack statistics**  
🔄 **Database migrations apply**  
📦 **QA results included in deployment**

## For Developers

### Before You Push

```bash
npm run test     # Run unit tests (~30s)
npm run qa       # Run QA tests (~2 min)
npm run lint     # Check code style
```

### The Deploy Pipeline

```
git push
  ↓
Pre-Build Script
  ↓ runs unit tests (belt, utils, draft, fixes)
  ↓ runs QA tests (100 pods × 6 sets)
  ↓ generates results.json
  ↓
Database Migrations
  ↓ applies pending SQL migrations
  ↓ updates migrations table
  ↓
Next.js Build
  ↓ compiles application
  ↓ optimizes assets
  ↓
Post-Build Script
  ↓ copies QA results to /public
  ↓ generates status badge
  ↓ verifies artifacts
  ↓
Deploy Complete! 🚀
```

**Total time:** ~5-7 minutes

## Accessing QA Results

### On Your Site
```
https://www.protectthepod.com/qa-results.json    # Full test results
https://www.protectthepod.com/qa-status.json     # Summary + badge
```

### In Your Code
```javascript
// API route or server component
import { readFileSync } from 'fs'
const qa = JSON.parse(readFileSync('public/qa-results.json', 'utf8'))

// Client-side
const response = await fetch('/qa-results.json')
const qa = await response.json()
```

## What Gets Tested

### Unit Tests (18 tests)
- ✅ Belt logic (Leader, Base, Common, Uncommon, Rare, Foil)
- ✅ Pack generation (16 cards, correct rarities)
- ✅ Draft logic
- ✅ Card fixes

### QA Tests (108 tests = 18 per set)
For each set (SOR, SHD, TWI, JTL, LOF, SEC):
- ✅ Pack structure (16 cards, 1 leader, 1 base, 1 foil)
- ✅ Rarity counts (9 commons, 2-3 uncommons, 1-2 rares)
- ✅ No duplicates within packs
- ✅ Reasonable duplicates across pods
- ✅ Aspect coverage (all 6 aspects in commons)
- ✅ Hyperspace/Showcase variants at expected rates
- ✅ Foil distribution balanced

## If Tests Fail

### Don't Panic!
- Tests run but **won't block deployment**
- You'll see warnings in build logs
- Fix issues in next commit

### Check Logs
```bash
# Vercel dashboard
Deployments → Select build → View logs

# GitHub Actions (if configured)
Actions → Select workflow → View run
```

### Common Failures
| Issue | Cause | Fix |
|-------|-------|-----|
| QA test flaky | Statistical edge case | Re-run or ignore if rare |
| Unit test fails | Code change broke logic | Fix the code |
| Build error | Syntax/import issue | Check error message |
| Migration fails | DB schema conflict | Review migration SQL |

## Configuration Files

```
.github/workflows/ci.yml     # GitHub Actions (optional)
vercel.json                   # Vercel deploy config
package.json                  # Build scripts
scripts/prebuild.js           # Runs tests before build
scripts/postbuild.js          # Generates artifacts after build
scripts/migrate-on-deploy.js  # Applies DB migrations
```

## Customizing

### Skip Tests (Not Recommended)
```bash
# Vercel dashboard → Project Settings → Build & Development Settings
# Override build command:
next build  # skips prebuild tests
```

### Run Only QA Tests
```json
// package.json
"build": "npm run qa && node scripts/migrate-on-deploy.js && next build && node scripts/postbuild.js"
```

### Change Test Thresholds
```javascript
// src/qa/packGeneration.test.js
const POD_SAMPLE_SIZE = 100  // increase for more thorough testing
const TOLERANCE = 0.15       // adjust acceptable variance
```

## GitHub Actions (Optional)

If you added `.github/workflows/ci.yml`:

### What You Get
- ✅ Tests run on every PR
- ✅ Test artifacts saved for 30 days
- ✅ PR comments with test summaries
- ✅ Lint checks

### Viewing Results
1. Go to your repo → **Actions** tab
2. Click on latest workflow run
3. View logs or download artifacts

## Monitoring After Deploy

### Checklist
- [ ] Visit deployed site
- [ ] Check `/qa-results.json` loads
- [ ] Generate a test pod
- [ ] Review Vercel logs for errors

### Red Flags
- 🚨 Site not loading
- 🚨 QA results file missing
- 🚨 Pack generation errors
- 🚨 Database connection issues

## Emergency: Rolling Back

### Via Vercel UI
1. Go to Vercel dashboard
2. **Deployments** → Select previous working deployment
3. Click **"Promote to Production"**
4. Site rolls back instantly

### Via Git
```bash
git revert HEAD
git push
# Triggers new deployment with reverted code
```

## Tips

1. **Run tests locally first** - Catch issues before pushing
2. **Check preview deployments** - Every PR gets its own URL
3. **Monitor first 10 minutes** - Most issues appear quickly
4. **Keep QA results** - Historical data shows trends
5. **Update tests with game** - New sets need test updates

## Resources

- 📋 [Full CI/CD Docs](./CI_CD.md)
- ✅ [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)
- 📊 [QA Status](./QA_STATUS.md)
- 📖 [Main README](../README.md)

## Questions?

**Tests failing but not sure why?**
→ Check test output for specific error messages

**Want to disable tests temporarily?**
→ Not recommended, but edit `package.json` build script

**Need to update test thresholds?**
→ Edit `src/qa/packGeneration.test.js`

**QA results not showing up?**
→ Make sure `npm run qa` completed successfully
