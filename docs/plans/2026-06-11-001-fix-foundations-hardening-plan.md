---
title: Foundations hardening — transactions, socket/JWT auth, client bundle, type ratchet
type: fix
status: done
date: 2026-06-11
---

# Foundations Hardening Plan

## Overview

A 2026-06-11 audit found foundation-level risks in swupod ("Protect the Pod"): the data layer has no transaction support (making the one `FOR UPDATE` in the codebase a no-op and draft advancement non-atomic), Socket.io trusts client-supplied identity over a `cors: { origin: '*' }` server, the JWT layer ships with a literal fallback secret and bakes privileges into 30-day tokens, an ~8 MB `cards.json` is statically imported into client bundles, TypeScript checking is disabled in 567 files with no gate, and startup migrations swallow failures at two layers. This plan fixes each at the definition level, dependency-ordered: the `withTransaction` primitive lands first because draft-advance atomicity, pod cleanup, and the concurrency tests all build on it.

Every finding below was re-verified against the working tree on 2026-06-11; line references are current.

## Problem Frame

The symptoms (occasional half-advanced drafts, double-processed picks under load, impersonatable chat, oversized first paint) all trace to a small set of root causes at the infrastructure layer rather than feature code:

1. **`lib/db.ts` exposes only autocommit statements.** `query` / `queryRows` / `queryRow` each go through `pool.query()` (lib/db.ts:36-69), which checks out a connection per statement. There is no `withTransaction`, no `BEGIN` anywhere in app code (verified by grep). Consequences:
   - `src/utils/draftAdvance.ts:113-115` runs `SELECT * FROM pod_players ... FOR UPDATE` via `queryRows` — the implicit single-statement transaction commits immediately, so the row locks are released before any subsequent write. The lock is a **no-op**.
   - `processAllStagedPicks` (draftAdvance.ts:106-283) plus its advance helpers issue on the order of 2 writes per player + 2-4 pod writes + per-player pack reassignment — ~25 sequential autocommit statements for an 8-player pod. A crash or deploy mid-sequence leaves a half-advanced draft (some players `picked`, some `selected`, `state_version` skewed).
   - The actual concurrency guard is a soft lock: `bot_processing_since` with a 2-second expiry and a 3-attempt retry loop (app/api/draft/[shareId]/select/route.ts:128-183). Any pick-processing pass that takes >2 s lets a second request "expire" the lock and double-process.
   - Abandoned-pod cleanup is 3 non-transactional DELETEs (server.ts:138-140) — a failure between them leaves orphaned `pod_players` or a pod without its `card_pools`.
2. **Identity is asserted, not verified, at two boundaries.** Socket.io accepts `presence:join` with a client-supplied `userId` (server.ts:197-207) and `chat:send` / `lobby-chat:send` with client-supplied `username`/`avatarUrl` (server.ts:250-267, 282-300) that get relayed into Discord; CORS is `origin: '*'` (server.ts:68). On the HTTP side, `lib/auth.ts:5` falls back to the literal `'change-me-in-production'` secret, privileges (`is_admin`, `is_beta_tester`) are baked into a 30-day JWT with no forced revalidation, and the Discord OAuth `state` parameter is generated but **never verified** in the callback.
3. **The client pays for the whole card database.** `src/utils/cardData.ts:11` statically imports `src/data/cards.json` (7,992,150 bytes); two `'use client'` modules import from it (`src/components/LandingPage.tsx:25`, `app/pool/[shareId]/deck/play/page.tsx`), pulling the full dataset into client bundles.
4. **Safety nets are decorative.** 567 files carry `// @ts-nocheck`; there is no `typecheck` script and prod runs `NODE_ENV=production npx tsx server.ts` (type checking off). Startup migrations swallow failures at two layers (server.ts:40-53 resolves on any exit code; `scripts/migrate-on-deploy.ts` always `process.exit(0)` by design).

Fixing the transaction primitive, the auth boundaries, and the gates fixes the whole class — not the individual symptom reports.

## Requirements Trace

| # | Audit finding | Verified? | Plan unit |
|---|---------------|-----------|-----------|
| F1 | P0: no DB transactions; no-op `FOR UPDATE`; non-atomic advance; 2s soft lock | Yes (lib/db.ts; draftAdvance.ts:113-115; select/route.ts:128-183; server.ts:138-140) | U1, U2 |
| F2 | P1: JWT fallback secret; stale privileges in 30d token; OAuth state unverified | Yes, with corrections (auth.ts:5,48-61; signin/discord/route.ts:30-43; callback/discord/route.ts:31-43 — state generated but never validated; voluntary `POST /api/auth/refresh` already exists) | U4 |
| F3 | P1: Socket.io CORS `*`; client-asserted identity in presence + chat | Yes (server.ts:68, 197-207, 250-267, 282-300) | U3 |
| F4 | P0 perf: 8 MB cards.json statically imported client-side; check cards.raw.json | Yes for cards.json (cardData.ts:11; LandingPage.tsx:25 is `'use client'`); **cards.raw.json is NOT imported client-side** — only `scripts/fetchCards.ts` / `scripts/postProcessCards.ts` reference it | U5 |
| F5 | P1: ~532 `@ts-nocheck` files, no typecheck gate, prod runs tsx | Yes — actual count **567** files (`grep -rl`, excluding node_modules/.next); no `typecheck` script in package.json; `start` = `npx tsx server.ts` | U6 |
| F6 | P2: startup migrations spawn-and-swallow | Yes — and it is **two layers**: server.ts:40-53 resolves regardless of exit code, AND migrate-on-deploy.ts deliberately exits 0 even on failure | U7 |
| F7 | P2: N+1 per-round practice_matches query on polled draft GET | Yes (app/api/draft/[shareId]/route.ts:149-163; endpoint polled every 2 s via `useDraftSync` `pollInterval = 2000`); scoped to competitive pods in `matchmaking` phase | U8 |
| F8 | P2: rate limiter trusts first x-forwarded-for hop; in-memory | Yes (lib/rateLimit.ts:30-36; per-process `Map`) | U8 |

## Scope Boundaries

**In scope:** transaction primitive, draft-advance atomicity + advisory locking, Socket.io auth + CORS, JWT/OAuth hardening, card-data client-bundle fix + bundle budget, `@ts-nocheck` ratchet, migrations fail-fast, draft-GET N+1, rate-limit IP trust.

**Out of scope (owned elsewhere):**
- **Card-fix-layer upstreaming to swuapi and set-metadata consolidation** — owned by the cross-repo megaplan in the wayfinder repo (`docs/plans/2026-06-11-002-megaplan-cross-repo-audit-remediation-plan.md`, family-wide canonicalization initiative). This plan keeps `scripts/cardFixes.js` semantics untouched.
- **DeckBuilder.tsx decomposition** — `plans/REFACTORING_PLAN.md`.
- **Big-bang TypeScript migration** — `plans/TYPESCRIPT_MIGRATION_PLAN.md` owns the long arc; U6 here is only the monotonic ratchet + the security-bearing layers (`lib/`, `app/api/`).
- **Stats-page over-fetch consolidation** — separate effort.
- **Redis-backed rate limiting** — explicitly not planned; no Redis in the stack today (U8 documents the per-process limitation instead).

## Context & Research (verified refs)

- **DB layer:** `lib/db.ts` — `pg.Pool` (max 20), exports `query`, `queryRows`, `queryRow`, `testConnection` only. No client checkout API is exposed, so no caller can hold a connection across statements today.
- **Draft advancement:** `src/utils/draftAdvance.ts` — `processAllStagedPicks` (line 106) opens with the no-op `FOR UPDATE` (113-115), then loops per-player UPDATEs + `draft_picks` INSERTs, then calls `advanceLeaderDraftAfterPicks` / `advancePackDraftAfterPicks` which do pack passing (per-player UPDATE in `passPacks`/`passLeaders`), pod `draft_state`/`state_version` writes, and the legacy `checkAndAdvanceLeaderDraft` / `checkAndAdvancePackDraft` paths repeat the same pattern.
- **Soft lock:** `app/api/draft/[shareId]/select/route.ts:128-183` — `UPDATE pods SET bot_processing_since = NOW() WHERE ... (bot_processing_since IS NULL OR bot_processing_since < NOW() - INTERVAL '2 seconds') RETURNING id`, 3 attempts with 150-250 ms sleeps, released in a `finally`. `src/utils/botLogic.ts` (`processBotTurns`) shares this lock.
- **Pod cleanup:** `server.ts:101-151` — `cleanupAbandonedPods` runs every 15 min; deletes `card_pools`, `pod_players`, `pods` as three separate autocommit statements (138-140).
- **Socket.io:** `server.ts:67-69` (`cors: { origin: '*' }`), connection handler 187-337. No `io.use()` middleware exists. The session cookie (`swupod_session`, lib/auth.ts:6) is httpOnly and accompanies the Socket.io polling/upgrade request, so it is available in `socket.handshake.headers.cookie`.
- **Auth:** `lib/auth.ts:5` secret fallback chain `JWT_SECRET → NEXTAUTH_SECRET → 'change-me-in-production'`; `createToken` (48-61) embeds `is_admin`/`is_beta_tester`, `expiresIn: '30d'`. `POST /api/auth/refresh` (app/api/auth/refresh/route.ts) already re-reads the user row and re-issues the cookie — but it is voluntary; nothing forces it on privilege change.
- **OAuth:** `app/api/auth/signin/discord/route.ts:30-43` builds `state` = base64 of `{ random: Math.random()..., returnTo }`; `app/api/auth/callback/discord/route.ts:31-43` only **decodes** state for `returnTo` and never compares it to anything stored — no cookie binding, no verification. Bonus issue found during verification: `returnTo` from attacker-supplied state is concatenated into the redirect (`${APP_URL}${returnTo}`) unvalidated.
- **Card data:** `src/data/cards.json` = 7,992,150 bytes; `src/data/cards.raw.json` = 8,128,087 bytes (scripts-only, no client import — verified). `src/utils/cardData.ts:11` does `import cardDataRaw from '../data/cards.json' with { type: 'json' }`. Client importers: `src/components/LandingPage.tsx:25` (`getCardsBySet`), `app/pool/[shareId]/deck/play/page.tsx` (`'use client'`). ~50+ server-side importers (API routes, belts, bots) are fine and stay as-is.
- **TypeScript:** 567 files match `@ts-nocheck` (ts/tsx, excluding node_modules/.next). package.json has `lint` but no `typecheck`; `start` is `NODE_ENV=production npx tsx server.ts`.
- **Migrations:** `server.ts:34-53` spawns `npx tsx scripts/migrate-on-deploy.ts` and `resolve()`s on any close code or spawn error; `scripts/migrate-on-deploy.ts` ends with "Always exit 0 so the server can start" — both layers must change for fail-fast.
- **Draft GET N+1:** `app/api/draft/[shareId]/route.ts:144-163` — `practice_rounds` fetched, then one `practice_matches` query per round inside the loop. Polled every 2 s by `src/hooks/useDraftSync.ts` (`pollInterval = 2000`). Only fires when `pod.competitive === true && draftState.phase === 'matchmaking'`.
- **Rate limit:** `lib/rateLimit.ts:30-36` — `x-forwarded-for` first hop, in-memory `Map`, 60 req/min.
- **Test posture (reuse it):** 124 unit test files run via Node's built-in runner (`npx tsx --test`, `node:test` imports confirmed in lib/auth.test.ts); 30 Playwright specs in `tests/e2e/` (audit said 31 — actual count is 30). `lib/auth.test.ts` and `app/api/auth/refresh/route.test.ts` already exist and should be extended, not duplicated. Spec-first/red-green convention per `.claude/rules/testing.md`.
- **Plan conventions:** dated plans in `docs/plans/` (this file follows `2026-06-09-001-feat-personal-stats-plan.md` et al.); informal plans in `plans/`.

## Key Technical Decisions

1. **`withTransaction(fn)` over an ORM or query-builder rewrite.** Smallest primitive that fixes the class: checkout a client from the existing pool, `BEGIN`/`COMMIT`/`ROLLBACK`, pass a scoped `query`/`queryRow`/`queryRows` bound to that client so existing call signatures inside transactional code are unchanged.
2. **`pg_advisory_xact_lock(pod_id_key)` replaces the `bot_processing_since` soft lock** for pick processing. Transaction-scoped advisory locks release automatically on commit/rollback/crash — no expiry tuning, no stale-lock cleanup, no double-processing window. The pod's integer lock key derives from its id (hashtext of the uuid, or the pods serial id if one exists — execution-time detail). `bot_processing_since` column is retired from the locking role (kept or dropped is an execution-time call; the plan removes all readers).
3. **Keep the second concurrent submitter's behavior: wait, then no-op.** With the advisory lock, a second simultaneous "all selected" trigger blocks until the first commits, re-reads `pick_status`, finds no `selected` players, and returns false — the existing `hasPicksToProcess` re-check (draftAdvance.ts:119-123) already implements this; it just needs to actually run under a real lock.
4. **Socket identity = server-derived only.** `io.use()` middleware parses the `swupod_session` cookie from `socket.handshake.headers.cookie`, verifies via the existing `verifyToken`, and stamps `socket.data.user`. `presence:join` payload userId is ignored in favor of `socket.data.user.id`; `chat:send` username/avatarUrl come from `socket.data.user`. Anonymous sockets remain allowed for read-only rooms (join-draft, presence:subscribe) — chat and presence-as-user require auth. CORS restricted to `APP_URL` (+ `NEXT_PUBLIC_APP_URL`, localhost in dev).
5. **JWT privilege staleness: token-version claim, not shorter tokens.** Add `auth_version` (int, default 1) to `users`; bake it into the JWT; `requireAdmin`/`requireBetaAccess` (the privileged gates only) compare token claim to the DB value (one indexed PK lookup) and 401 on mismatch; admin-grant/revoke paths (`scripts/makeAdmin.ts`, any admin grant endpoint) increment it. Ordinary `requireAuth` stays DB-free to avoid a query on every request. The existing `/api/auth/refresh` becomes the recovery path after a 401.
6. **OAuth state: signed, cookie-bound nonce.** Set a short-lived (10 min) httpOnly cookie containing a `crypto.randomBytes` nonce before redirecting; embed the same nonce in `state`; callback verifies match before token exchange. Also validate `returnTo` (must start with `/`, no `//`) to close the open-redirect found during verification.
7. **Card data: API route + client fetch, server imports untouched.** All ~50 server-side `cardData` importers keep the static import (it's fine in Node). The two client modules switch to fetching `/api/cards?set=CODE` (new route serving the already-fixed data from the server-side module, with `Cache-Control: public, max-age=3600, stale-while-revalidate`) via a small client-side loader hook with in-memory cache. Per-set chunks via querystring, not per-set static files — keeps the fix-at-runtime system (`applyCardFixes`) as the single source of corrected data and avoids generating derived artifacts.
8. **Type ratchet, not migration.** A committed baseline count + CI script that fails if `@ts-nocheck` count rises; cleanup starts with `lib/` and `app/api/` because those are the security-bearing layers this plan touches anyway (db.ts, auth.ts, the draft routes lose their `@ts-nocheck` as part of U1-U4).
9. **Migrations fail-fast in production with `ALLOW_STALE_SCHEMA=1` escape hatch.** Both layers change: migrate-on-deploy exits non-zero on failure when `NODE_ENV=production` and the hatch is unset; server.ts propagates the exit. Dev keeps the lenient behavior.

## Open Questions

1. **Lock key derivation:** does `pods.id` have an integer surrogate, or is it uuid-only? If uuid-only, use `pg_advisory_xact_lock(hashtext(id::text))` — collision risk across pods is acceptable (worst case: brief serialization of two unrelated pods). Resolve at implementation.
2. **Anonymous chat:** are there legitimate unauthenticated chat users today (guest drafters)? If yes, U3 needs a guest-identity policy (server-assigned "Guest-xxxx" names) rather than a hard auth requirement. Check how the client obtains `username` before implementing.
3. **`bot_processing_since` residual uses:** `processBotTurns` in `src/utils/botLogic.ts` and possibly the timeout path use the same soft lock — U2 must inventory all readers/writers before retiring it (grep at implementation time).
4. **Bundle budget number:** pick after measuring the post-fix first-load JS (likely budget ~500 KB gzip for the largest route); the guard's value is the ratchet, not the specific number.

## Implementation Units

- [x] U1. **`withTransaction` primitive in lib/db.ts**
  - **Goal:** Real transaction support so locks hold and multi-statement writes are atomic.
  - **Requirements:** F1 (foundation for U2).
  - **Dependencies:** none — everything else builds on this.
  - **Files:** `lib/db.ts`, `lib/db.test.ts` (new).
  - **Approach:** Add `withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>` — `pool.connect()`, `BEGIN`, invoke `fn` with a `TxClient` exposing `query`/`queryRow`/`queryRows` bound to the checked-out client (same signatures as the module-level functions), `COMMIT` on success, `ROLLBACK` + rethrow on error, `client.release()` in `finally` (release with the error arg if rollback itself failed, so the pool discards the connection). Remove `// @ts-nocheck` from db.ts while there (it's nearly typed already).
  - **Patterns:** mirrors node-postgres' documented transaction recipe; keep the existing error-log-and-rethrow style from `query()`.
  - **Test scenarios (node:test, against the dev DB like existing API tests):** (a) two writes inside `withTransaction` with a thrown error between them → neither row persists; (b) `FOR UPDATE` inside `withTransaction` blocks a second concurrent `withTransaction` on the same row until commit (assert ordering via timestamps); (c) connection released on both success and failure (pool count returns to idle); (d) nested usage rejected or documented (no savepoint support — assert it throws or document single-level).
  - **Verification:** `npm run test` green; new db tests pass against `wayfinder`-style local postgres (whatever POSTGRES_URL dev DB the suite already uses).

- [x] U2. **Atomic draft advancement with `pg_advisory_xact_lock`**
  - **Goal:** Exactly-once pick processing; crash-mid-advance leaves the draft in the pre-advance state, not half-advanced.
  - **Requirements:** F1.
  - **Dependencies:** U1.
  - **Files:** `src/utils/draftAdvance.ts`, `app/api/draft/[shareId]/select/route.ts`, `src/utils/botLogic.ts` (shared soft-lock user), `src/utils/draftTimeout.ts` (if it advances state — inventory at implementation), `server.ts` (cleanup wrap), tests: `src/utils/draftAdvance.test.ts` (extend), new `app/api/draft/draft-advance-concurrency.test.ts`.
  - **Approach:** (1) `processAllStagedPicks` takes a `tx` and runs entirely inside `withTransaction`; first statement is `SELECT pg_advisory_xact_lock(hashtext($podId))`, then the existing `FOR UPDATE` row read (now meaningful), then the existing all-selected re-checks, then all per-player and pod writes through `tx`. Fire-and-forget side effects (`attributePickedCard`, `buildBotDecks`, Discord) stay **outside** the transaction (after commit) — they are non-transactional by design and must not hold the txn open. (2) The select route's `bot_processing_since` retry loop is deleted; the route calls the transactional `processAllStagedPicks` directly — the advisory lock provides mutual exclusion, and the second caller's `hasPicksToProcess` re-check makes it a no-op. (3) `processBotTurns` switches to the same advisory-lock pattern. (4) `cleanupAbandonedPods`' 3 DELETEs (server.ts:138-140) wrap in one `withTransaction` per pod. (5) Legacy `checkAndAdvanceLeaderDraft`/`checkAndAdvancePackDraft` get the same wrapping if still reachable (verify call sites; if dead, note for deletion in a follow-up, don't expand scope).
  - **Patterns:** transaction-scoped advisory locks (auto-release on commit/rollback/disconnect); keep `state_version` increment as the last write in the txn so pollers never observe an intermediate version.
  - **Test scenarios (specific, per the audit's ask):**
    - *Simultaneous pick submissions:* seed a 2-player pod with both players `selected`; fire two concurrent `processAllStagedPicks` calls (Promise.all); assert exactly one returns true, `draft_picks` has exactly N rows (one per player, no duplicates), `state_version` advanced exactly once.
    - *Lock contention ordering:* hold the advisory lock in a manual transaction, invoke the route-level processing, assert it blocks (does not error) and completes after release with correct state.
    - *Crash-mid-advance recovery:* inject a thrown error after the first player's UPDATE inside the txn (test seam or mocked `tx.query` failure on statement k); assert ROLLBACK left **all** players `selected`, `selected_card_id` intact, `state_version` unchanged — then a retried call succeeds cleanly end-to-end.
    - *Slow processing no longer double-fires:* artificial 3 s delay inside processing while a second submission arrives → second waits/no-ops (regression test for the 2 s soft-lock expiry bug).
    - *Cleanup atomicity:* fail the `pods` DELETE → `card_pools`/`pod_players` rows still present (rolled back).
    - *E2E:* existing `tests/e2e/multiplayer-draft.spec.ts` must stay green (the behavioral contract).
  - **Verification:** concurrency tests pass repeatedly (`for i in 1..20` loop locally — flake = bug); `npm run test:e2e -- --grep "draft"` green.

- [x] U3. **Socket.io authentication + CORS lockdown**
  - **Goal:** Socket identity derived server-side; no cross-origin socket access; chat impersonation (relayed into Discord) impossible.
  - **Requirements:** F3.
  - **Dependencies:** U1 not required; can proceed in parallel with U2. Uses existing `verifyToken` from lib/auth.ts.
  - **Files:** `server.ts`, `lib/auth.ts` (export a cookie-header → session helper reusing `parseCookies`/`verifyToken`), client socket setup (locate the `io(...)` client call — likely `src/lib/socket*.ts` or a hook; inventory at implementation), new `server.socket-auth.test.ts` or Playwright coverage.
  - **Approach:** (1) `io.use((socket, next))` middleware: parse `socket.handshake.headers.cookie`, verify the `swupod_session` JWT, set `socket.data.user = session | null`. Do **not** hard-reject anonymous sockets (read-only rooms must keep working) — gate per-event instead. (2) `presence:join`: ignore the client payload; require `socket.data.user`, use its `id`. (3) `chat:send` / `lobby-chat:send`: require `socket.data.user`; build the message from `socket.data.user.username` / `avatar_url`, drop the client-supplied fields (resolve Open Question 2 first — if guests chat today, assign server-side `Guest-${socket.id.slice(0,4)}`). (4) CORS: `cors: { origin: [APP_URL, NEXT_PUBLIC_APP_URL, ...devOrigins].filter(Boolean), credentials: true }`. (5) Delist-timer keying continues on the server-derived userId.
  - **Patterns:** Socket.io middleware auth via handshake cookie (standard recipe); identity-from-session mirrors `getSession` in API routes — same verification path, one definition.
  - **Test scenarios:** unauthenticated socket can `presence:subscribe` + `join-draft` but `chat:send` is dropped; authenticated socket's chat message carries the JWT username even when the payload claims another name (impersonation test); `presence:join` with a forged userId counts under the real userId; cross-origin handshake (wrong Origin header) rejected; existing draft E2E (which exercises sockets) stays green.
  - **Verification:** Playwright multiplayer draft spec green; manual: two browsers, confirm presence count and chat identity; confirm Discord relay shows server-derived name.

- [x] U4. **JWT & OAuth hardening**
  - **Goal:** No deployable fallback secret; privilege revocation takes effect without waiting 30 days; OAuth callback CSRF-proof; returnTo open-redirect closed.
  - **Requirements:** F2.
  - **Dependencies:** none (parallel-safe); U3 consumes the same `verifyToken`, so land U4's secret change first if sequencing matters.
  - **Files:** `lib/auth.ts`, `lib/auth.test.ts` (extend), `app/api/auth/signin/discord/route.ts`, `app/api/auth/callback/discord/route.ts`, `scripts/makeAdmin.ts` (+ any admin-grant endpoint — the 2026-06-03 admin-grant-page plan implies one; inventory at implementation), new migration in `migrations/` adding `users.auth_version INT NOT NULL DEFAULT 1`, `app/api/auth/refresh/route.ts` (include auth_version in reissued token).
  - **Approach:** (1) **Secret hard-fail:** at module init in lib/auth.ts, if `NODE_ENV === 'production'` and neither `JWT_SECRET` nor `NEXTAUTH_SECRET` is set, `throw` (process exits at boot — same fail-fast philosophy as U7). Dev keeps a fallback but logs a loud warning. (2) **Privilege freshness:** add `auth_version` claim to `createToken`; `requireAdmin`/`requireBetaAccess` do one `SELECT auth_version FROM users WHERE id = $1` and 401 on mismatch (or missing claim — old tokens fail closed on privileged routes only); `makeAdmin` and grant/revoke paths `SET auth_version = auth_version + 1`. `requireAuth` unchanged (no per-request DB hit). (3) **OAuth nonce:** signin sets `swupod_oauth_state` httpOnly SameSite=Lax cookie = `crypto.randomBytes(16).toString('hex')`, 10 min Max-Age; `state` embeds `{ nonce, returnTo }`; callback requires cookie==state.nonce before the token exchange, clears the cookie, and rejects otherwise. Replace `Math.random` with `crypto.randomBytes`. (4) **returnTo validation:** accept only strings matching `^\/(?!\/)` (single leading slash), else `/`.
  - **Patterns:** token-version invalidation (industry-standard session-version claim); double-submit cookie for OAuth state.
  - **Test scenarios (extend lib/auth.test.ts + app/api/auth tests, node:test):** prod-mode module load without secret throws; admin token minted at version 1 fails `requireAdmin` after version bump, then succeeds after `/api/auth/refresh`; token without `auth_version` claim rejected by privileged gates, accepted by `requireAuth`; callback with mismatched/missing state cookie → redirect with error, no token exchange attempted (mock fetch and assert not called); `returnTo: "//evil.com"` and `"https://evil.com"` both normalize to `/`.
  - **Verification:** `npm run test:auth` green; manual OAuth round-trip in dev.

- [x] U5. **Card data out of the client bundle + bundle budget guard**
  - **Goal:** Client bundles no longer embed the 8 MB cards.json; regression structurally blocked.
  - **Requirements:** F4.
  - **Dependencies:** none.
  - **Files:** new `app/api/cards/route.ts`; new client loader `src/utils/cardDataClient.ts` (fetch + in-memory cache, per-set); `src/components/LandingPage.tsx`; `app/pool/[shareId]/deck/play/page.tsx`; new `scripts/check-bundle-size.ts`; `.github/workflows/ci.yml` (add the check); `package.json` (script entry). `src/utils/cardData.ts` itself unchanged for server consumers.
  - **Approach:** (1) API route `GET /api/cards?set=SOR` (and `?set=all` if a consumer truly needs everything) returning the **fixed** data via the existing server-side `getCardsBySet`/`getAllCards` — single corrected source preserved; `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`. (2) Client loader with module-level cache so repeat mounts don't refetch; loading state honored by consumers (skeleton, not empty-state flash). (3) Rewrite the two client importers to use the loader; audit for any other `'use client'` module that transitively reaches `cardData.ts` (run `next build` and inspect the largest chunks — the transitive graph through belts/bots may pull it into more client code than the direct grep shows; fix each at the import site). (4) **Bundle guard:** post-`next build`, parse `.next` build-manifest / app-build-manifest, compute first-load JS per route, fail CI if any route exceeds the committed budget (set after measuring post-fix; see Open Question 4) — also fail hard if any client chunk exceeds, say, 2 MB (catches the specific "somebody re-imported cards.json" regression regardless of budget tuning). Confirmed during verification: `cards.raw.json` has **no** client importers — no action needed beyond the guard preventing future ones.
  - **Patterns:** server-as-source-of-corrected-data (mirrors the fix-at-runtime system); guard-with-the-fix per repo philosophy.
  - **Test scenarios:** unit test the API route (set filter, unknown set → 404/empty, fixed fields present e.g. a known card's corrected flag); Playwright: landing page and play page render cards (covers loader integration); bundle script self-test: run against current build → passes; simulate violation (temp import) → fails.
  - **Verification:** `next build` route table shows the affected routes' first-load JS dropped by multiple MB (record before/after numbers in the PR); CI bundle check green; landing + play pages visually verified.

- [x] U6. **`@ts-nocheck` ratchet + typecheck the security-bearing layers**
  - **Goal:** TypeScript debt can only shrink; `lib/` and `app/api/` actually typecheck.
  - **Requirements:** F5.
  - **Dependencies:** U1-U4 (those units remove `@ts-nocheck` from the files they touch — land the ratchet after, so the baseline starts low).
  - **Files:** new `scripts/check-ts-nocheck.ts`; new committed baseline `.ts-nocheck-baseline` (single integer + optional per-dir breakdown); `package.json` (`typecheck` script: `tsc --noEmit`, plus `check:ts-ratchet`); `.github/workflows/ci.yml`; then iterative `@ts-nocheck` removal in `lib/*.ts` and `app/api/**/route.ts` files not already covered by U1-U4.
  - **Approach:** (1) Ratchet script counts `@ts-nocheck` occurrences across ts/tsx (excluding node_modules/.next/tests fixtures), compares to baseline: count > baseline → fail with the offending new files listed; count < baseline → fail with "lower the baseline" message (forces the win to be committed); equal → pass. Baseline starts at the post-U1-U4 count (today: 567 before any removal). (2) Add `tsc --noEmit` to CI — it only checks files without `@ts-nocheck`, so it's immediately green and gets stricter as headers come off. (3) Targeted cleanup pass: remaining `lib/` files, then `app/api/auth/**` and `app/api/draft/**`. **Explicitly not** a big-bang migration — `plans/TYPESCRIPT_MIGRATION_PLAN.md` owns the long arc; this unit just makes drift impossible and de-risks the layers this plan modified.
  - **Patterns:** monotonic-ratchet CI guard (same shape as wayfinder's `check:loading-states`); never weaken a check to pass it.
  - **Test scenarios:** ratchet script unit tests — count==baseline passes, +1 fails naming the file, -1 fails demanding baseline update; `tsc --noEmit` green in CI.
  - **Verification:** CI runs both checks; intentionally adding `@ts-nocheck` to a scratch file fails the ratchet locally.

- [x] U7. **Startup migrations fail-fast in production**
  - **Goal:** Prod never serves traffic against a knowingly-stale schema; failures stop the deploy (Railway restarts/rolls back) instead of being logged and ignored.
  - **Requirements:** F6.
  - **Dependencies:** none.
  - **Files:** `server.ts` (runMigrations, lines 24-54), `scripts/migrate-on-deploy.ts` (both swallow layers), README/docs note for the escape hatch.
  - **Approach:** (1) migrate-on-deploy: on any migration failure, when `NODE_ENV === 'production'` and `ALLOW_STALE_SCHEMA !== '1'`, `process.exit(1)` instead of the current unconditional `exit(0)` (keep the build-time skip logic — that path is legitimate). (2) server.ts `runMigrations`: reject/`process.exit(code)` when the child exits non-zero in production without the hatch; keep dev lenient (warn and continue, preserving today's local-dev ergonomics where POSTGRES_URL may be unset). (3) The hatch is the documented break-glass for "migration is wedged but the running schema is actually fine."
  - **Patterns:** fail-fast at boot (same philosophy as U4's secret check); env escape hatch like Railway deploy guards.
  - **Test scenarios:** unit-test the decision function (extract `shouldFailFast(exitCode, env)` so it's testable without spawning): prod+failure+no-hatch → fail, prod+failure+hatch → continue, dev+failure → continue; manual: run with a deliberately broken migration locally with NODE_ENV=production → process exits non-zero.
  - **Verification:** Railway deploy of a known-good build boots normally; the decision-function tests pin the matrix.

- [x] U8. **Small perf/robustness cleanups: draft-GET N+1 + rate-limit IP trust**
  - **Goal:** Remove the per-round query loop from the 2 s-polled draft GET; rate limiter keys on the real client IP behind Railway's proxy.
  - **Requirements:** F7, F8.
  - **Dependencies:** none.
  - **Files:** `app/api/draft/[shareId]/route.ts` (149-163), `lib/rateLimit.ts`, `lib/rateLimit.test.ts` (new or extend), possibly a route test for the matchmaking payload.
  - **Approach:** (1) Replace the loop with a single query: `SELECT pm.*, pr.round_number, pr.status AS round_status, u1..., u2... FROM practice_rounds pr LEFT JOIN practice_matches pm ON pm.round_id = pr.id LEFT JOIN users u1/u2 ... WHERE pr.pod_id = $1 ORDER BY pr.round_number, pm.created_at`, then group rows into the existing `roundsWithMatches` shape in JS (rounds with zero matches must still appear — LEFT JOIN from rounds guarantees it). Payload shape unchanged. (2) Rate limit: derive client IP from the **last** untrusted hop boundary — behind Railway there is exactly one trusted proxy, so take the last entry of `x-forwarded-for` (the one appended by the trusted proxy) rather than the first (client-controlled); make the trusted-hop count an env (`TRUST_PROXY_HOPS`, default 1; 0 in bare dev). Document in a header comment that the store is per-process and resets on deploy/restart — accepted limitation, no Redis (none in the stack).
  - **Patterns:** single-query + group-in-JS (standard N+1 fix); rightmost-XFF trust for a known proxy depth.
  - **Test scenarios:** route test with 3 rounds × 2 matches + 1 empty round → identical JSON to the old shape (snapshot or deep-equal against expected), one `practice_matches`-touching query (assert via a query-counting test seam or pg statement log in test); rate-limit unit tests: spoofed leading XFF entries don't fragment the key, limit still trips at 61 requests from one real IP, `TRUST_PROXY_HOPS=0` uses direct value.
  - **Verification:** competitive-draft matchmaking page renders identically (Playwright if a spec covers it, else manual); `npm run test` green.

## System-Wide Impact

- **Behavioral contract preserved:** poll responses, socket event names, and chat message shapes are unchanged; clients need no coordinated deploy except the Socket.io CORS change (same-origin clients unaffected) and U5's loader (server + client ship together in one deploy — Railway GitOps makes this atomic).
- **Old JWTs:** after U4, tokens lacking `auth_version` still work for ordinary auth but fail privileged gates until refreshed — admins re-login or hit `/api/auth/refresh` once. Communicate in release notes.
- **DB connection pressure:** transactions hold a connection for the duration of pick processing (previously per-statement). Pool max is 20; an 8-player pod's advance is single-flight per pod under the advisory lock, so worst case is concurrent-pods × 1 connection — fine at current scale, but U2 should keep side effects out of the txn to keep hold times short.
- **Migrations fail-fast** changes deploy semantics: a bad migration now blocks rollout (desired) — Railway will show a crash-looping deploy instead of a silently degraded one.
- **Bundle/ratchet guards** add two CI steps; both are fast (<10 s) and fail with actionable messages.
- **Discord relay** now reflects verified identities — any tooling that parsed impersonated names is unaffected structurally, just more truthful.

## Risks & Dependencies

- **Advisory-lock key collisions** (`hashtext` on uuid): two pods sharing a key briefly serialize — correctness preserved, throughput impact negligible. (Open Question 1.)
- **Hidden soft-lock consumers:** `bot_processing_since` may be read by timeout/recovery paths beyond botLogic — U2's first step is a full grep inventory; missing one means a path silently loses its (broken) guard, so the concurrency tests must cover bot-driven advancement too.
- **Guest chat regression risk** (Open Question 2): if anonymous users chat today, U3 must ship the guest-identity policy in the same change or chat breaks for them.
- **Transitive client imports of cardData** (U5): the grep found 2 direct client importers, but Next's bundler follows the whole graph — belts/bots imported by any client component would still pull cards.json. The bundle guard is the backstop; the `next build` size table is the proof.
- **tsx in production** (F5 context): this plan deliberately does not move prod off `tsx` — the ratchet + CI `tsc --noEmit` provide the checking that the runtime skips. Moving to a compiled start is TYPESCRIPT_MIGRATION_PLAN territory.
- **Test DB requirements:** U1/U2 concurrency tests need a real Postgres (no mocking transactions) — reuse whatever POSTGRES_URL the existing route tests use; if current unit tests are DB-free, these become the first DB-backed suite and may need a CI service container.
- **Cross-repo dependency:** none for this plan; card-fix upstreaming explicitly deferred to the wayfinder megaplan (see Scope Boundaries).

## Sources & References

- Audit: 2026-06-11 foundations audit (findings F1-F8, restated and verified in Requirements Trace).
- Code (all verified 2026-06-11): `lib/db.ts:36-69`; `src/utils/draftAdvance.ts:113-115, 106-283`; `app/api/draft/[shareId]/select/route.ts:128-183`; `server.ts:34-53, 67-69, 101-151 (deletes 138-140), 187-337`; `lib/auth.ts:5, 48-61`; `app/api/auth/signin/discord/route.ts:30-43`; `app/api/auth/callback/discord/route.ts:31-43`; `app/api/auth/refresh/route.ts`; `src/utils/cardData.ts:11`; `src/components/LandingPage.tsx:25`; `app/pool/[shareId]/deck/play/page.tsx`; `lib/rateLimit.ts:30-36`; `app/api/draft/[shareId]/route.ts:144-163`; `src/hooks/useDraftSync.ts:107`; `scripts/migrate-on-deploy.ts` (tail); `package.json` scripts.
- Repo facts: 567 `@ts-nocheck` files; `src/data/cards.json` = 7,992,150 B; `src/data/cards.raw.json` = 8,128,087 B (scripts-only); 124 unit test files (node:test via `tsx --test`); 30 Playwright specs in `tests/e2e/`.
- Related plans: `plans/TYPESCRIPT_MIGRATION_PLAN.md` (long-arc typing); `plans/REFACTORING_PLAN.md` (DeckBuilder); wayfinder `docs/plans/2026-06-11-002-megaplan-cross-repo-audit-remediation-plan.md` (card-fix upstreaming / set-metadata consolidation); `docs/plans/2026-06-03-001-feat-admin-grant-page-plan.md` (admin-grant surface relevant to U4's auth_version bumps).
- External patterns: node-postgres pooled-transaction recipe; PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`); Socket.io middleware auth via handshake cookies; session-version JWT invalidation; double-submit-cookie OAuth state.

---

**Status note (2026-06-11, wayfinder audit megaplan G1/G2 sweep):** all 8 units executed and
committed 2026-06-11 — U1 `ce3e3b9`, U2 `becaa26`, U3 `980752f`, U4 `53842a7`, U5 `2e8f793`,
U6 `ba4f1a5`, U7 `1217b57`, U8 `993829b`. Marked `status: done` the same day the work shipped —
per the megaplan rule that every plan touched by a commit gets its status updated in the same pass.

**2026-07-07 reconciliation (arch refresh audit):** re-verified unit-by-unit against the current
tree — `status: done` stands. All 8 units held, and the new Swiss Practice subsystem *adopted*
the U1/U2 primitives (`src/services/matchmaking/liveGames.ts:567,729,948,1209`). Two asterisks,
now owned by `docs/plans/2026-07-07-001-fix-arch-refresh-plan.md`:
1. **U5:** the "temporary" `/deckbuilder/build` bundle exemption (7.5 MB,
   `scripts/check-bundle-size.ts:35-50`) is still live; the parallel DeckBuilder refactor it was
   waiting on never happened (the file grew 2,847 → 2,962 lines) and `cards.json` grew to 9.5 MB.
   → refresh-plan unit N1.
2. **U6:** the ratchet held mechanically (baseline = live count) but was deliberately bumped
   upward four times (551 → 576 net, +25 new `@ts-nocheck` files: `b66636bf`, `fbfcb378`,
   `6ac76cfa`, `5d4e41ca`). The guard stops accidental drift, not routine `--update` bumps.
   → refresh-plan unit N2.
