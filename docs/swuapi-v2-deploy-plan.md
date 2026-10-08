# swuapi v2 Deploy Plan

## Context

swupod has been fully migrated to the swuapi v2 API (snake_case fields, UUID primary card IDs, cursor-paginated `/export/cards`, Bearer auth). All code is committed to `main` but **not yet pushed**.

swuapi v2 is on branch `feature/swuapi-foundation` in the swuapi repo — it needs to be deployed to production before Phase 1 of this plan.

---

## Pre-Conditions (verify before starting)

- [ ] Confirm swupod `main` is NOT yet pushed: `git log --oneline origin/main..HEAD` should show 11 commits
- [ ] Confirm production swuapi is still v1: `curl -s -o /dev/null -w "%{http_code}" https://api.swuapi.com/export/cards` should return `404`
- [ ] Confirm swuapi v2 is deployed to production before Phase 1 (see below)

---

## Step 0: Push swupod to production

```bash
git push origin main
```

This is safe to do now. swupod's prebuild (`npm run fetch-cards`) has a `|| echo` fallback so it won't fail if swuapi v2 isn't live yet. The `Authorization` header is simply ignored by swuapi v1.

**This triggers a production redeploy of swupod.**

---

## Step 1: Deploy swuapi v2 to production

This happens in the **swuapi repo**, not swupod.

1. Merge or deploy `feature/swuapi-foundation` to production on Railway
2. Verify it's live:
   ```bash
   curl -s https://api.swuapi.com/health
   curl -s -o /dev/null -w "%{http_code}" https://api.swuapi.com/export/cards
   ```
   - `/health` should return `200` with `status: "healthy"`
   - `/export/cards` should return `200` (auth not enforced yet — this is intentional)

**Do NOT set `SWUAPI_REQUIRE_AUTH` yet.** The two-phase rollout means swuapi v2 launches with auth optional so swupod can be configured first.

---

## Phase 1: Soft Launch — configure swupod with API key

Run from the **swupod repo directory**.

### 1a. Create an API key on the swuapi host

On the swuapi server (Railway shell or local swuapi):

```bash
node scripts/create-api-key.js swupod-production
```

Copy the `swuapi_...` key it prints.

### 1b. Run the Phase 1 deploy script

```bash
./scripts/deploy-swuapi-v2.sh
```

The script will:
1. Verify Railway CLI is authenticated
2. Check you're on `main`
3. Hit `/health` and `/export/cards` to confirm swuapi v2 is live
4. Prompt for the API key and test it against `/export/cards`
5. Set `SWUAPI_API_KEY` in swupod's Railway production environment
6. Ask whether to push `main` (say yes to trigger swupod redeploy with the key active)

### 1c. Verify the key is being used

After swupod redeploys, check the swuapi DB:

```sql
SELECT consumer_name, last_used_at FROM api_keys ORDER BY last_used_at DESC LIMIT 5;
```

`last_used_at` for `swupod-production` should be recent (within the last few minutes). This confirms swupod is successfully authenticating.

Also verify the production site is working normally (draft creation, sealed, deck builder).

---

## Phase 2: Enforce Auth

Once Phase 1 is confirmed working, lock down swuapi so unauthenticated requests get 401.

```bash
./scripts/deploy-swuapi-v2.sh --enforce
```

The script will print the exact Railway command to run in the swuapi project directory:

```bash
cd /path/to/swuapi && railway variables set SWUAPI_REQUIRE_AUTH=true -e production
```

Railway restarts swuapi. All requests without a valid key now get 401.

**Verify enforcement:**
```bash
curl -s -o /dev/null -w "%{http_code}" https://api.swuapi.com/export/cards
# Should return 401

curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer <key>" \
  https://api.swuapi.com/export/cards
# Should return 200
```

---

## Rollback (if anything goes wrong)

### Fast rollback — instant, no deploy needed

If enforcement went live and is causing issues:

```bash
./scripts/rollback-swuapi-v2.sh --fast
```

Prints the command to unset `SWUAPI_REQUIRE_AUTH` in swuapi. Railway restarts; unauthenticated requests pass again.

### Full rollback — revert everything

To completely undo the migration (revert swupod code, remove key from Railway):

```bash
./scripts/rollback-swuapi-v2.sh --full
```

This:
1. Removes `SWUAPI_API_KEY` from swupod's Railway env
2. Reverts the 8 swuapi v2 migration commits on `main`
3. Pushes (triggers swupod redeploy to pre-v2 code)

Also manually unset `SWUAPI_REQUIRE_AUTH` in swuapi if it was set:
```bash
cd /path/to/swuapi && railway variables delete SWUAPI_REQUIRE_AUTH -e production
```

---

## Commit Reference

The 11 commits on `main` pending push (newest first):

```
e7254a9 chore: update CLAUDE.md
9216467 feat: migrate swupod to swuapi v2 (deploy/rollback scripts, migrate-on-deploy fix)
7a3603f fix: use replaceAll for cardId separator normalization in deckImageApi
8e46c9b fix: use replaceAll to normalize all underscores in collector_number
27b4032 feat: migrate ApiCard to snake_case fields and use uuid as primary card ID
7465b87 fix: throw on fetch errors, add max-page guard, exit non-zero on unhandled rejection
b598620 feat: migrate card fetch from /export/all to cursor-paginated /export/cards
6b8cd2b refactor: rename SWUAPI_BASE_URL to SWUAPI_URL for consistency
2f9e740 feat: document SWUAPI_API_KEY in .env.example
ac9888f feat: add SWUAPI_URL/SWUAPI_API_KEY env vars and auth headers for swuapi v2
17b280d chore: add .worktrees/ to .gitignore
```

The rollback script (`--full`) references the 8 migration commits by SHA (ac9888f through 7a3603f). These are hardcoded and verified in the script.

---

## Files Changed (for reference)

| File | Change |
|------|--------|
| `scripts/fetchCards.ts` | Cursor pagination, snake_case fields, UUID as ID, auth header, error handling |
| `lib/deckImageApi.ts` | Auth header, `replaceAll` fix for cardId normalization |
| `.env.example` | Documents `SWUAPI_URL` and `SWUAPI_API_KEY` |
| `scripts/migrate-on-deploy.ts` | Run SQL statements individually (fixes `CREATE INDEX CONCURRENTLY`) |
| `scripts/deploy-swuapi-v2.sh` | Two-phase deploy script (Phase 1 + `--enforce`) |
| `scripts/rollback-swuapi-v2.sh` | `--fast` and `--full` rollback modes |
| `.gitignore` | Added `.worktrees/` |
| `/Users/lee/Repos/ledwards/swuapi/.worktrees/swuapi-foundation/src/api/server.js` | Auth gated on `SWUAPI_REQUIRE_AUTH` env var |
