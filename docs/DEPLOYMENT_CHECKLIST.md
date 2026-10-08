# Deployment Checklist

## Pre-Deployment

### Code Quality
- [ ] All unit tests passing locally (`npm run test`)
- [ ] QA tests passing locally (`npm run qa`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code reviewed and approved
- [ ] No console.logs or debug code

### Testing
- [ ] Manual testing completed
- [ ] Pack generation verified across all sets (SOR, SHD, TWI, JTL, LOF, SEC)
- [ ] Draft functionality tested
- [ ] Stats page working
- [ ] Mobile responsive checked

### Database
- [ ] Migrations tested locally
- [ ] Migration files are idempotent
- [ ] No destructive changes without backup plan
- [ ] Schema changes are backwards-compatible (old code runs during deploy)

### Environment Variables
- [ ] All required env vars set in Railway
- [ ] `POSTGRES_URL` configured (uses `postgres.railway.internal` in production)
- [ ] Any new env vars documented

## During Deployment

### Railway Build & Deploy Flow

1. **Build phase** (`npm run build`)
   - `prebuild`: Creates `migrations/.buildstamp` (busts Docker layer cache)
   - `build`: Next.js production build
   - `postbuild`: Runs QA tests, copies artifacts to public/

2. **Release phase** (`releaseCommand` in railway.toml)
   - Runs `node scripts/migrate.js prod --yes`
   - If migration fails → deploy fails → old container keeps serving traffic
   - If migration succeeds → continues to start phase

3. **Start phase** (`startCommand` in railway.toml)
   - Runs `npm start` (Node server with Socket.io)
   - Health check passes → traffic switches to new container

### Cache Busting

The `prebuild` script creates `migrations/.buildstamp` with the current timestamp on every build. This ensures the Docker layer containing the migrations directory is never served from stale cache.

Without this, Railway's build cache could serve old migration files even after new ones are committed.

### Automated Checks
- [ ] Build completed successfully
- [ ] Migrations applied without errors (check deploy logs)
- [ ] Post-build artifact generation completed
- [ ] Health check passed

## Post-Deployment

### Immediate Verification
- [ ] Site is accessible at production URL
- [ ] No 500 errors on main pages
- [ ] QA results accessible: `/qa-results.json`
- [ ] Database connection working
- [ ] API routes responding correctly

### Functional Testing
- [ ] Generate a sealed pod (6 packs)
- [ ] Verify pack contains:
  - [ ] 16 cards total
  - [ ] 1 leader, 1 base, 1 foil
  - [ ] 9 commons, 2-3 uncommons, 1-2 rares
- [ ] Start a draft
- [ ] Make picks and verify state saves
- [ ] Check stats page loads
- [ ] Test on mobile device

### QA Results Review
- [ ] Check `/qa-results.json` for:
  - [ ] Recent timestamp
  - [ ] All sets tested (6 sets)
  - [ ] Test summary shows pass rate > 95%
  - [ ] No unexpected failures

### Database
- [ ] Verify migrations table updated
- [ ] Check for migration errors in logs
- [ ] Test data queries working
- [ ] Connection pool healthy

### Performance
- [ ] Page load times acceptable (< 3s)
- [ ] Pack generation responsive (< 1s)
- [ ] API endpoints responding quickly
- [ ] No memory leaks in logs

## Rollback Plan

If issues are detected:

1. **Immediate Issues**
   - Use Railway's rollback to previous deployment
   - Go to Railway dashboard → Deployments → Select previous → Rollback

2. **Database Issues**
   - Database migrations are tracked and can be rolled back manually
   - Check `migrations` table for applied migrations
   - Have rollback SQL ready for recent migrations
   - Note: Schema changes need backwards-compatible migrations (old code may still be running during deploy)

3. **Code Issues**
   - Revert the problematic commit
   - Push to trigger new deployment
   - Or use Railway rollback for instant fix

4. **Migration Failures**
   - If `releaseCommand` fails, deploy automatically aborts
   - Old container continues serving traffic
   - Fix migration and push again

## Monitoring (First 24 Hours)

- [ ] Check error rates in Railway logs
- [ ] Monitor server response times
- [ ] Review user feedback/reports
- [ ] Check for database connection issues
- [ ] Verify QA results remain consistent

## Weekly Follow-up

- [ ] Review accumulated error logs
- [ ] Check QA test trends
- [ ] Verify no performance degradation
- [ ] Plan fixes for any new issues

## Emergency Contacts

- **Railway Support**: https://railway.app/help
- **Database Provider**: Railway PostgreSQL
- **Project Owner**: [Your contact info]

## Useful Commands

```bash
# Local testing
npm run test              # All unit tests
npm run qa                # QA pack generation tests
npm run build             # Full production build
npm run lint              # Code quality check

# Deployment
git push origin main      # Triggers production deploy

# Database
npm run migrate:status    # Check migration status
npm run migrate:prod      # Manual production migration (not usually needed)

# Debug (Railway)
# View logs in Railway dashboard → Deployments → View Logs
# Or use Railway CLI: railway logs
```

## Notes

- Deployments typically take 2-5 minutes
- QA tests add ~1-2 minutes to build time
- QA results are regenerated on every build
- Failed migrations WILL block deployment (releaseCommand fails → deploy aborts)
- The `prebuild` script busts Docker cache for migrations directory

## Version History

- **v1.0** - Initial deployment checklist
- **v1.1** - Added QA test verification steps
- **v1.2** - Added post-build artifact checks
- **v1.3** - Updated for Railway (was Vercel), added migration flow docs