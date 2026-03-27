# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## CRITICAL: NEVER PUSH WITHOUT PERMISSION

**NEVER run `git push` unless the user explicitly says "push".**

- "commit" means ONLY commit, NOT push
- "commit and push" or "push" means push
- When in doubt, ASK before pushing
- Pushing triggers production deploy - this is irreversible

**If you push without permission, you have failed.**

---

## Project Overview

Protect the Pod is a Star Wars: Unlimited draft and sealed simulator. It generates booster packs, supports multiplayer drafts with real-time sync via Socket.io, and includes a deck builder.

## Common Commands

```bash
npm run dev              # Start dev server (Next.js + Socket.io via server.js)
npm run build            # Production build
npm run lint             # ESLint

# Testing
npm run test             # All unit tests (204 tests)
npm run test:belts       # Belt system tests only
npm run test:utils       # Pack generation tests
npm run test:data        # Card data validation
npm run test:hooks       # Hook tests only
npm run test:e2e         # Playwright E2E tests
npm run test:auth        # Auth & beta access tests
npm run test:api         # API utility tests
npm run test:law         # LAW set config tests
npm run qa               # Statistical QA (100 packs/set)

# Run a single test file
node src/utils/cardSort.test.js

# E2E tests
npm run test:e2e -- --grep "Sealed Happy Path"  # Quick sanity check
npm run test:e2e -- --grep-invert "8-player"    # Skip slow test

# Card data
npm run fetch-cards      # Refresh cards.json from API (includes LAW)
npm run show-fixes       # Show card data fixes

# Admin
npm run make-admin user@email.com     # Grant admin by email
npm run make-admin -- --discord 123   # Grant admin by Discord ID
```

## App Structure
- `app/` - Next.js App Router pages and API routes
- `app/api/draft/` - Draft CRUD and state management
- `app/api/sealed/` - Sealed pool generation
- `app/api/formats/` - Other format APIs (chaos sealed, pack wars, pack blitz, rotisserie)
- `src/components/` - React components (see `src/components/DeckBuilder/README.md`)
- `src/hooks/` - Custom hooks (see `src/hooks/README.md`)
- `src/contexts/` - React contexts (`DeckBuilderContext`, `AuthContext`)
- `src/belts/` - Belt system for pack generation
- `src/services/` - Pure business logic
- `src/utils/` - Utility functions (20+ files)
- `src/bots/` - Bot behaviors and leader rankings
- `lib/` - Server-side utilities (db, auth)
- `migrations/` - Database migrations
- `scripts/` - Build and admin scripts

## Detailed Rules

Domain-specific rules are in `.claude/rules/`:
- **belt-system.md** — Belt metaphor, pack generation, carbonite packs (scoped to `src/belts/`, `src/utils/boosterPack*`)
- **testing.md** — Spec-first testing, red-green TDD, test locations (scoped to test files)
- **ui-components.md** — Button/Card/Modal usage, design tokens, style guide (scoped to components/CSS)
- **mobile.md** — Hover rules, touch guards, chat collapse (scoped to components/hooks/CSS)
- **architecture.md** — Services/hooks/components pattern, per-set configs (scoped to `src/`)
- **database.md** — PostgreSQL, migrations, Railway, auth (scoped to `lib/`, `migrations/`, `app/api/`)

## Plans & Documentation

**Plans go in `/plans/`.** When complete, move to `/docs/`.

Current: `TOURNAMENT_MODE_PLAN.md`, `CASUAL_MODE_PLAN.md`, `TYPESCRIPT_MIGRATION_PLAN.md`, `REFACTORING_PLAN.md`, `STYLEGUIDE_PLAN.md`

## Important Notes

- **NEVER PUSH OR DEPLOY WITHOUT EXPLICIT DIRECTION** — pushes trigger production deploy
- **Release Notes**: Only edit root `RELEASE_NOTES.md`. The `public/` copy is generated. Each deploy gets its own date section. Keep "How to Update Release Notes" section at the bottom.
- **Generated files in `public/`**: NEVER edit `public/RELEASE_NOTES.md`, `public/qa-results.json`, `public/qa-status.json`, `public/test-results.json`
- **Script guidelines**: Database/slow scripts should print status messages and progress indicators
