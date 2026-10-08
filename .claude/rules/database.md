---
paths:
  - "lib/db*"
  - "migrations/**"
  - "server.js"
  - "scripts/migrate*"
  - "scripts/copy*"
  - "scripts/clone*"
  - "scripts/lib/db*"
  - "app/api/**"
---

# Database & Infrastructure Rules

## PostgreSQL
- Access via `lib/db.js`
- `queryRows()` for SELECT, `queryRow()` for single row, `query()` for INSERT/UPDATE

## Migrations
- Live in `migrations/`
- Run automatically at **server startup** (not build time) via `server.js`
- Each migration tracked in `migrations` table to prevent re-runs
- Migrations must be idempotent
- Deploy script uses `tsx` so migrations can import TypeScript

## Railway (Production)
```bash
railway run -e production npm run migrate:prod status   # Check status
railway run -e production npm run migrate:prod           # Run pending
railway run -e production <command>                      # Any command
```

## Authentication
- Discord OAuth via `lib/auth.js`
- JWT tokens in cookies
- User context via `src/contexts/AuthContext`
- Login endpoint: `/api/auth/signin/discord?return_to=...`
- User roles: `is_admin` and `is_beta_tester`

## Player Data
- **NEVER commit player usernames/data to the repo**
- Add/remove via direct SQL against Railway databases

## Prod → Dev Copy Scripts (ALWAYS USE THE SHARED ENGINE)

Getting real data locally:
```bash
npm run copy-pool -- <shareId>          # one pool family (root + all builds)
npm run copy-pool -- --set LAW          # newest pools for a set that have a built deck
npm run copy-user-to-dev -- <username>  # one user's whole graph
npm run db:verify                       # health-check dev; --fix repairs sequences
```

**Any new script that copies rows between databases MUST use `scripts/lib/dbCopy.ts`
and `scripts/lib/dbEnv.ts`.** Do NOT hand-roll row copying — every one of these is
a bug that shipped in a hand-rolled version:

- **Hand-collecting referenced ids.** Use `copyClosure()`; it walks the FK graph from
  the target's catalog and pulls in every referenced parent transitively. Hand-collected
  id lists silently miss columns (`draft_picks.user_id`, `built_decks.user_id`,
  `practice_matches.round_id`) and those rows vanish into a per-row error handler.
- **`ON CONFLICT (id) DO NOTHING`.** It does NOT absorb the many non-`id` unique
  constraints (`built_decks.card_pool_id`, `pool_views(user_id, pool_id)`, the
  `casual_matches` partial index). Use bare `ON CONFLICT DO NOTHING`.
- **Forgetting sequences.** `card_generations` and `draft_picks` have SERIAL ids;
  copying explicit ids does not advance the sequence, so the app's next local insert
  collides. `copyClosure()` re-syncs them.
- **Assuming a table exists.** Guard seed fetches against the target's schema so a
  not-yet-migrated table degrades to "nothing to copy" instead of aborting the run.
- **Hardcoding source/target.** Use `resolveConnections()` — it enforces the
  same-database guard that stops a copy becoming a write to prod.

Every copy and every restore ends with an integrity verification; `clone-prod-to-local`,
`clone-prod-to-dev.sh`, and `restore-dev-db.sh` all invoke `verifyDevDb.ts --fix`
automatically, because those restore with triggers disabled and continue past errors.

`--fix` is additive only (sequence resync). Anything needing a DELETE is reported
with scoped SQL and never executed.

Note: git worktrees do not inherit `.env` / `.env.local`. Run these from the main
checkout, or symlink the env files in.
