---
paths:
  - "lib/db*"
  - "migrations/**"
  - "server.js"
  - "scripts/migrate*"
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
