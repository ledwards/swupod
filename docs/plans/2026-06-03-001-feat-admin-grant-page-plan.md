---
title: "feat: Admin grant page — direct-add patron or beta tester by Discord handle"
type: feat
status: active
date: 2026-06-03
---

# feat: Admin grant page — direct-add patron or beta tester by Discord handle

## Overview

Add `/admin` — an admin-only page with a single capability: direct-add a user to patron status or beta status. The admin searches by Discord handle (for users who have signed in to swupod) or supplies a Discord **user ID** (the 17–19 digit snowflake) to pre-provision someone who hasn't. The page 404s for everyone else. The grant action covers both: existing-user upsert or pre-provisioning a fresh row with the chosen flag already set (matching the manual INSERT pattern Lee used today for `everly1990`). Initial scope is exactly these two actions — nothing else on the page.

**Terminology used consistently below:** "Discord handle" = the human-readable username (what we store in `users.username`). "Discord ID" / "snowflake" = the numeric ID Discord assigns (what we store in `users.discord_id`). Search-by-handle works for existing users. Pre-provisioning requires the snowflake.

---

## Problem Frame

Lee occasionally needs to grant patron or beta access directly — for friends, customer-support recoveries, or paying patrons who haven't signed in to swupod yet. Today the only path is a manual `psql` against Railway prod, mediated by Claude (see today's everly1990 case). That's fine when Claude is involved but is the wrong default: it requires Lee to either remember the right SQL or to flag down an agent. A scoped admin page makes the operation safe, fast, and self-serve.

Two distinct entitlements, treated independently (per `migrations/063_add_is_patron_to_users.sql:19-20`: "We do NOT auto-enroll patrons in beta"):
- **Patron** — sets `users.is_patron = TRUE`. Unlocks pack-import, Friends-of-the-Pod gated features.
- **Beta** — sets `users.is_beta_tester = TRUE`. Unlocks beta-gated UI surfaces.

Pre-provisioning case: admin enters a Discord snowflake ID for a user who has never signed into swupod. System inserts a fresh `users` row with the chosen flag set. When that user later signs in via Discord OAuth, the callback's `UPDATE users ... WHERE discord_id = $4` branch ([app/api/auth/callback/discord/route.ts:117-133](app/api/auth/callback/discord/route.ts)) overwrites `username`/`email`/`avatar_url` with real values and **preserves the flag** (the UPDATE doesn't touch `is_patron`/`is_beta_tester`).

---

## Requirements Trace

- R1. `/admin` page returns 404 (not 403) for non-admins and unauthenticated visitors. No flash of admin UI before redirect.
- R2. `/admin` page renders an autocomplete input that suggests existing users by Discord handle (case-insensitive prefix match on `username`) as the admin types.
- R3. Admin can select a suggested user, choose a flag (Patron or Beta), and click Add to set that flag to TRUE on the user's row. Idempotent — re-clicking does not error.
- R4. Pre-provisioning by Discord snowflake (the numeric ID):
  - If the input is all-digit (17–25 digits) AND there's no existing user with that `discord_id`, the dropdown offers a single "Pre-provision Discord ID X (no swupod account yet)" option. Selecting it and clicking Add inserts a fresh `users` row with `discord_id = X`, `username = X` (placeholder, overwritten on first OAuth sign-in), `email = NULL`, `avatar_url = NULL`, and the chosen flag = TRUE.
  - If the input is non-numeric AND there are no matches, the dropdown shows an explicit empty-state message: "No matches. To pre-provision a new user, enter their Discord user ID (a long number — see Discord's Copy User ID with Developer Mode on)." No pre-provision row is offered.
  - If the input is all-digit AND there's an existing match, the existing user row is shown — no pre-provision row appears for that snowflake.
- R5. All admin API routes (`/api/admin/users/search`, `/api/admin/grant`) return 404 for non-admins to match the page's stealth posture. Mirroring the page's 404 keeps the surface uniformly invisible.
- R6. Each grant action emits a structured `console.log` line so the action is grep-able in Railway logs. No new audit-log table.
- R7. The "Add to Patron" action sets ONLY `is_patron = TRUE` (it does not also set `is_beta_tester`). The "Add to Beta" action sets ONLY `is_beta_tester = TRUE` (it does not also set `is_patron`). Per migration 063's stated policy.

---

## Scope Boundaries

- **Out**: revoking flags (FALSE-setting). The Patreon webhook auto-revokes `is_patron` (and clears `is_beta_tester`) by email match. For admin-initiated revoke (e.g., remove the wrong friend, kick someone from beta), continue to use `psql` against Railway prod — documented in `docs/ADMIN.md`. Rationale: grant is the common operation; revoke is rare and contained. If the `psql` round-trip becomes painful in practice, revoke is a one-route follow-up.
- **Out**: granting `is_admin`. Continues via `scripts/makeAdmin.ts` CLI.
- **Out**: any audit-log table or queryable history. Structured `console.log` is the established convention (`scripts/sync-patrons-cron.ts:236-255`).
- **Out**: refreshing the target user's JWT after a grant. `is_patron` is always re-queried from DB (never in JWT); `is_beta_tester` is in the JWT and will be stale until the target user refreshes/signs out. Acceptable for an admin tool. Noted in System-Wide Impact.
- **Out**: bulk add, CSV import, scheduled grants, expiring grants.
- **Out**: any page chrome beyond the grant panel itself. No nav, no metrics, no other admin tools on this page — explicitly minimal.

---

## Context & Research

### Relevant Code and Patterns

- [lib/auth.ts:202](lib/auth.ts) — `requireAdmin(request)` throws on non-admin; pair with try/catch + custom 404 mapping for the stealth requirement.
- [lib/auth.ts:14-26](lib/auth.ts) — `Session` shape: `id, email, username, avatar_url, is_admin, is_beta_tester`. Note `is_patron` is deliberately NOT in the session — always re-query.
- [lib/db.ts](lib/db.ts) — `query`, `queryRow`, `queryRows` helpers.
- [lib/utils.ts](lib/utils.ts) — `jsonResponse`, `errorResponse(message, status)`, `handleApiError`.
- [app/api/admin/sync-patrons/route.ts](app/api/admin/sync-patrons/route.ts) — existing admin route shape (try/catch around `requireAdmin`, structured console.log).
- [app/api/auth/callback/discord/route.ts:100-133](app/api/auth/callback/discord/route.ts) — canonical user INSERT/UPDATE shape. The OAuth UPDATE branch overwrites `username/email/avatar_url` but preserves `is_patron/is_beta_tester` — this is what makes pre-provisioning composable with eventual real sign-in.
- [app/api/draft/[shareId]/dev/add-bots/route.ts:79-85](app/api/draft/[shareId]/dev/add-bots/route.ts) — existing `INSERT INTO users ... ON CONFLICT (discord_id) DO UPDATE SET ...` precedent. Idempotent upsert pattern to mirror.
- [app/api/webhooks/patreon/route.ts:124-142](app/api/webhooks/patreon/route.ts) — `LOWER(email) = LOWER($1)` flag-set shape. Granular precedent for "set ONLY is_patron, leave is_beta_tester alone."
- [app/api/beta/enroll/route.ts:22](app/api/beta/enroll/route.ts) — `// Admins bypass patron check` precedent: an admin can grant beta without the target being a patron first.
- [scripts/makeAdmin.ts](scripts/makeAdmin.ts) — direct DB write pattern from a script context. The admin page is the same idea moved into a UI.
- [app/sets/[setCode]/page.tsx](app/sets/[setCode]/page.tsx) — `notFound()` precedent in a server component.
- [app/not-found.tsx](app/not-found.tsx) — what renders when `notFound()` fires.
- [src/components/SearchInput.tsx](src/components/SearchInput.tsx) — debounced text input (300ms default), `value`/`onChange` controlled. Reuse for the type-ahead input layer; build the suggestions list as a new co-located piece.
- [src/components/Button.tsx](src/components/Button.tsx) — canonical Button; use `variant="toggle" glowColor="blue"` for the Patron/Beta segment and `variant="primary"` for the Add CTA. Per `.claude/rules/ui-components.md` and `MEMORY.md` `feedback_use_button_component_for_toggles`.
- [app/beta/page.tsx](app/beta/page.tsx) — closest existing page pattern for "page that talks to a user-state API + renders a small form." Mirror the fetch shape (bare `fetch` with `credentials: 'include'`, read `{ data }` envelope).
- [migrations/001_initial_schema.sql:6](migrations/001_initial_schema.sql) — `discord_id TEXT UNIQUE`. The UNIQUE constraint is what makes `ON CONFLICT (discord_id)` work and why pre-provisioning MUST use a real snowflake (not a handle).
- [migrations/063_add_is_patron_to_users.sql:19-20](migrations/063_add_is_patron_to_users.sql) — "We do NOT auto-enroll patrons in beta" policy. R7 enforces this.

### Institutional Learnings

- **JWT staleness after permission flip** ([docs/BETA_ACCESS.md:155-162](docs/BETA_ACCESS.md)) — granting beta to a currently-logged-in user does not flip their JWT until they hit `/api/auth/refresh` or sign out. `is_patron` is unaffected (never in JWT). Noted in System-Wide Impact.
- **Three-state patron model** ([docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md](docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md)) — `isPatron` starts `null` during load. Not directly relevant here (the admin page doesn't render patron-gated content); just keep in mind if we ever surface "this user is/isn't currently a patron" in feedback.
- **Spec-test convention** ([app/api/auth/refresh/route.test.ts](app/api/auth/refresh/route.test.ts), [scripts/makeAdmin.test.ts](scripts/makeAdmin.test.ts)) — test routes by asserting SQL substrings, response shapes, and status codes via Node's built-in runner (`node:test`). No real DB, no Jest.
- **No real Discord handles in tests** — per `MEMORY.md` `feedback_no_player_data_in_repo`. Use synthetic values (`'TestUser'`, `'111111111111111111'`).
- **Structured-log audit trail** ([scripts/sync-patrons-cron.ts:236-255](scripts/sync-patrons-cron.ts)) — `console.log('admin-grant: …', { … })` pattern. Railway log search greps the prefix. No DB-side audit table.
- **`is_patron` not in JWT** ([app/api/beta/enroll/route.ts:13-19](app/api/beta/enroll/route.ts), comment "is_patron is NOT in the JWT — must hit the DB") — the grant route doesn't need to touch the admin's JWT or the target's JWT for the patron flag.

### External References

None — this is purely an internal admin tool following established patterns.

---

## Key Technical Decisions

- **404 stealth on both page and API routes, with a debug-visibility log line**: page calls `notFound()` for non-admins (renders `app/not-found.tsx`); routes return `errorResponse('Not found', 404)` for unauth/non-admin. Rationale: Lee asked for 404 stealth. To avoid the "I silently lost admin and can't tell why" failure mode, the page emits `console.warn('admin-page-blocked', { sessionId, hasSession, isAdmin })` on the blocked path BEFORE calling `notFound()`. Railway log grep on `admin-page-blocked` surfaces it for debugging without leaking anything to the client. This is in v1, not v2.
- **Inline admin check in API routes (do NOT use `requireAdmin`)**: `requireAdmin` throws `Error('Admin access required')` which `handleApiError` ([lib/utils.ts:75-77](lib/utils.ts)) maps to **403** — incompatible with R5's 404-stealth requirement. The routes must inline the check: `const session = getSession(request); if (!session?.is_admin) return errorResponse('Not found', 404)`. Simpler than nested try/catch + remap.
- **Direct `users` row write (not `patreon_pending`)**: the manual SQL used for everly1990 today inserted directly into `users`. The admin tool automates that, not the email-keyed `patreon_pending` deferred path. Rationale: `patreon_pending` only fires on a later sign-in; Lee's intent here is immediate effect ("direct add").
- **SELECT-then-UPSERT (not `xmax = 0` trick)**: U2's grant SQL does a `SELECT id FROM users WHERE discord_id = $1` first to know whether the next statement is a pre-provisioning insert or an existing-user update. Why not the `xmax = 0` RETURNING trick: under concurrent inserts (e.g., OAuth callback racing with grant), `xmax` can be non-zero on rows that are conceptually "new from this client's perspective," producing wrong `preProvisioned` values in BOTH the audit log AND the success-feedback UI. The SELECT-first approach costs one extra round trip and is correct under all concurrency patterns. The actual write is still `INSERT ... ON CONFLICT (discord_id) DO UPDATE SET <flag> = TRUE` (idempotent), and `preProvisioned` is the boolean from the SELECT (existed-before? false : true).
- **`INSERT ... ON CONFLICT (discord_id) DO UPDATE SET <flag> = TRUE`** as the actual write: mirrors `app/api/draft/[shareId]/dev/add-bots/route.ts:79-85`. Idempotent. The `<flag>` column name is server-controlled — see flag-allowlist mechanic below.
- **Flag allowlist mechanic (SQL-injection guard)**: the `flag` field arrives in the POST body and gets interpolated into the SQL string. The mechanic must be: `(1)` `typeof flag === 'string'` guard, `(2)` `const safeFlag = ALLOWED_FLAGS.find(f => f === flag)` (re-extract the matched value from the allowlist constant; never use the raw input), `(3)` interpolate `${safeFlag}`. This neutralizes object-with-`toString`, array, and case-twist vectors. `ALLOWED_FLAGS = ['is_patron', 'is_beta_tester'] as const`.
- **`discordId` validation: `/^\d{17,25}$/`** — Discord snowflakes are 17–19 digits; allow up to 25 for future growth. Reject empty, non-digit, or >25-char inputs with 400. Prevents resource exhaustion via giant strings and keeps junk rows out of the users table.
- **Pre-provisioning requires a Discord snowflake, not a handle**: the `users.discord_id` UNIQUE constraint means a placeholder handle in `discord_id` would collide with the real snowflake at OAuth time, creating two rows for one person. Forcing a snowflake means the eventual OAuth callback's `UPDATE WHERE discord_id = $4` ([app/api/auth/callback/discord/route.ts:117-133](app/api/auth/callback/discord/route.ts)) merges into the pre-provisioned row cleanly.
- **One flag per click — but optimize the two-grant workflow**: Toggle picks ONE; clicking Add sets ONLY that flag (R7). To grant both flags to a friend, the admin clicks Add twice. UX optimization: after a successful grant, **reset the search input and return focus to it, but PRESERVE the toggle state**. This means "grant beta to next person" is one keystroke + one click, not a re-toggle. The two-click overhead is for granting both flags to the same person, which is a less common path than granting the same flag to many people.
- **Server component page + client child component**: `app/admin/page.tsx` is an `async` server component (Next 16 `cookies()` from `next/headers` returns `Promise<ReadonlyRequestCookies>`). It reads the `swupod_session` cookie value via `cookieStore.get('swupod_session')?.value` and passes it directly to `verifyToken` from `lib/auth.ts`. If the token is missing or `!session.is_admin`, emit the `admin-page-blocked` log line and call `notFound()`. If admin, render `<AdminGrantPanel />`. No client-side flash.
- **Search endpoint scope**: returns max 10 rows. Matches by `LOWER(username) LIKE LOWER($1) || '%'` (prefix) OR `discord_id = $1` (exact, when input is all digits). Empty/sub-2-char query → empty array (don't dump the whole users table). Admin gate runs FIRST (before any input validation) so unauth/non-admin always sees 404, never an empty list. Indexes: `idx_users_discord_id` covers the exact-ID case; the LIKE on `username` is unindexed but acceptable for a small users table.
- **No new audit table**: structured `console.log('admin-grant', { adminId, action, flag, targetDiscordId, targetUserId, preProvisioned })` per established convention. Pin the prefix string `admin-grant` (not `[ADMIN-GRANT]`) as a named constant referenced by the test, so prefix drift breaks the test.

---

## Open Questions

### Resolved During Planning

- **Discord handle vs Discord ID for pre-provisioning** → require snowflake (KTD).
- **404 vs 403 for admin routes** → 404 + debug log line.
- **Admin-check mechanic in routes** → inline `getSession` + manual check, NOT `requireAdmin` (KTD: avoids 403 mapping).
- **Patron + Beta in one click vs separate** → separate (R7, KTD), with input-reset-but-toggle-preserved as the workflow optimization.
- **Page placement** → `/admin` (top-level). Future admin tools live alongside under `/admin/*`; the grant panel may move to `/admin/grant` then.
- **Insert-vs-update detection** → SELECT-then-UPSERT (KTD), not `xmax = 0`.
- **`flag` allowlist mechanic** → `typeof` guard + re-extract matched value from constant (KTD).
- **`discordId` validation** → `/^\d{17,25}$/` (KTD).
- **Revoke** → out of scope for the page; `psql` path documented in `docs/ADMIN.md`. Reconsider only if friction shows up in practice (Scope Boundaries).
- **Log prefix string** → `admin-grant`, pinned as a constant referenced by the test.
- **Server-component session reader** → inline via `cookies()` → `cookieStore.get('swupod_session')?.value` → `verifyToken(...)`. No new helper in `lib/auth.ts`.

### Deferred to Implementation

- **CSS approach for the suggestions dropdown** — whether to extend `SearchInput.css`, create `AdminGrantPanel.css`, or use a shared dropdown style. Decide while building U4; pick whatever matches the existing component's pattern.
- **FYI items not folded into v1** (from doc-review): requirements list grouping (cosmetic), `/admin` URL precedent for future tools (deferred until tool #2 ships), CSRF defense is `SameSite=Lax` (already in place via `lib/auth.ts:114,121` — no token-header layer added), 404-stealth timing oracle (immaterial for this threat model), all-digit username collision (a username happening to be 17–25 digits would be invisible to the digit-only search branch — acceptable, extremely rare). None of these change v1 behavior.

---

## Implementation Units

- [ ] U1. **Admin user-search API route**

**Goal:** Provide the type-ahead suggestion backend. Returns up to 10 matching users by `username` prefix or exact `discord_id` match.

**Requirements:** R2, R4, R5

**Dependencies:** None

**Files:**
- Create: `app/api/admin/users/search/route.ts`
- Test: `app/api/admin/users/search/route.test.ts`

**Approach:**
- `GET /api/admin/users/search?q=<query>`
- **Admin gate FIRST** (before any input validation): `const session = getSession(request); if (!session?.is_admin) return errorResponse('Not found', 404)`. Do NOT use `requireAdmin` — its `Error('Admin access required')` would be mapped to 403 by `handleApiError`, breaking R5.
- After the gate: trim `q`; if empty or shorter than 2 chars, return `jsonResponse({ users: [] })` (envelope is `{ success, data: { users: [] }, message: null }`).
- If `q` is all-digit (and ≤25 digits): `SELECT id, discord_id, username, is_patron, is_beta_tester FROM users WHERE discord_id = $1 LIMIT 10`. (Discord IDs are 17–19 digits; the 25-digit cap matches U2's validation so the admin can search for a snowflake they're about to pre-provision and not be cut off.)
- Otherwise: `SELECT id, discord_id, username, is_patron, is_beta_tester FROM users WHERE LOWER(username) LIKE LOWER($1) || '%' ORDER BY username LIMIT 10`.
- Response: `jsonResponse({ users: [...] })` — wrapped to `{ data: { users } }` by `jsonResponse`.

**Patterns to follow:**
- [app/api/admin/sync-patrons/route.ts](app/api/admin/sync-patrons/route.ts) — try/catch + `requireAdmin` + structured log.
- [lib/utils.ts](lib/utils.ts) — `jsonResponse`, `errorResponse`.

**Test scenarios:**
- Happy path: admin caller, `q='ever'` → SQL string contains `LOWER(username) LIKE LOWER($1) || '%'`, params include `'ever'`, response is `{ data: { users: [...] } }`.
- Happy path: admin caller, `q='476210241630109696'` (all digits) → SQL string contains `WHERE discord_id = $1`, params include the snowflake.
- Edge case: empty `q` → returns `{ data: { users: [] } }` without hitting the DB.
- Edge case: `q='e'` (1 char) → returns empty list without DB call.
- Error path: no session → 404 (not 401, not 403). Response body shape matches `errorResponse('Not found', 404)`.
- Error path: non-admin session → 404. Same shape.
- Error path: DB throws → handled via `handleApiError` → 500.

**Verification:**
- The route returns 404 for unauthenticated and non-admin callers.
- Admin caller with a valid prefix or snowflake gets up to 10 matching rows.

---

- [ ] U2. **Admin grant API route**

**Goal:** Set `is_patron` OR `is_beta_tester` to TRUE for an existing user (by `discord_id`) or pre-provision a new row.

**Requirements:** R3, R4, R5, R6, R7

**Dependencies:** None (independent of U1; U4 will call both)

**Files:**
- Create: `app/api/admin/grant/route.ts`
- Test: `app/api/admin/grant/route.test.ts`

**Approach:**
- `POST /api/admin/grant` with body `{ flag: 'is_patron' | 'is_beta_tester', discordId: string, username?: string }`.
- **Admin gate FIRST** (inline check, not `requireAdmin` — same reason as U1): `const session = getSession(request); if (!session?.is_admin) return errorResponse('Not found', 404)`.
- **`flag` allowlist mechanic** (per KTD):
  ```
  const ALLOWED_FLAGS = ['is_patron', 'is_beta_tester'] as const
  if (typeof flag !== 'string') return errorResponse('Invalid flag', 400)
  const safeFlag = ALLOWED_FLAGS.find(f => f === flag)
  if (!safeFlag) return errorResponse('Invalid flag', 400)
  ```
  Use `safeFlag` (the value from the constant, not the raw input) in the SQL string. Neutralizes object/array/case-twist injection vectors.
- **`discordId` validation**: `if (typeof discordId !== 'string' || !/^\d{17,25}$/.test(discordId)) return errorResponse('Invalid discordId', 400)`.
- **SELECT-then-UPSERT pattern** (per KTD; gives correct `preProvisioned`):
  ```
  const existing = await queryRow('SELECT id FROM users WHERE discord_id = $1', [discordId])
  const preProvisioned = !existing
  await query(
    `INSERT INTO users (discord_id, username, ${safeFlag}) VALUES ($1, $2, TRUE)
     ON CONFLICT (discord_id) DO UPDATE SET ${safeFlag} = TRUE`,
    [discordId, username ?? discordId]
  )
  const user = await queryRow(
    'SELECT id, discord_id, username, email, is_patron, is_beta_tester FROM users WHERE discord_id = $1',
    [discordId]
  )
  ```
  Three statements is fine — admin endpoint, no perf concern.
- **Audit log** (with pinned prefix): `console.log('admin-grant', { adminId: session.id, flag: safeFlag, targetDiscordId: discordId, targetUserId: user.id, preProvisioned })`. The prefix `'admin-grant'` lives as a top-of-file constant `LOG_PREFIX_ADMIN_GRANT = 'admin-grant'` that the test imports — so renaming the prefix breaks the test.
- Response: `jsonResponse({ user, preProvisioned })`.

**Patterns to follow:**
- [app/api/draft/[shareId]/dev/add-bots/route.ts:79-85](app/api/draft/[shareId]/dev/add-bots/route.ts) — `ON CONFLICT (discord_id) DO UPDATE` upsert.
- [app/api/webhooks/patreon/route.ts:128-141](app/api/webhooks/patreon/route.ts) — single-flag UPDATE without touching siblings.
- [scripts/sync-patrons-cron.ts:236-255](scripts/sync-patrons-cron.ts) — structured log prefix style.

**Test scenarios:**
- Happy path: existing user, `flag='is_patron'`, valid digits `discordId` → SELECT-then-UPSERT issued in order; SQL string contains `INSERT INTO users (discord_id, username, is_patron)` and `ON CONFLICT (discord_id) DO UPDATE SET is_patron = TRUE`. Log line emitted with `preProvisioned: false` and prefix matching `LOG_PREFIX_ADMIN_GRANT`.
- Happy path: existing user, `flag='is_beta_tester'` → SQL contains `is_beta_tester` and NOT `is_patron` (R7 string-search).
- Happy path: pre-provisioning (no existing row, `username` omitted) → params include `discordId` for both `discord_id` AND `username` slots; SELECT returns no row → `preProvisioned: true` in log AND response.
- Edge case: idempotency — same call twice → second call returns same user, `preProvisioned: false` on the second (SELECT finds the now-existing row).
- Edge case: `flag === 'is_patron'` typed as `String('is_patron')` (boxed) → `typeof !== 'string'` rejects → 400.
- Edge case: `flag` arrives as `['is_patron']` array → `typeof !== 'string'` rejects → 400, no SQL executed.
- Edge case: `flag` arrives as `{ toString: () => 'is_patron' }` → `typeof !== 'string'` rejects → 400.
- Edge case: `flag === 'IS_PATRON'` (case-twist) → `find(f => f === flag)` returns undefined → 400.
- Edge case: `discordId === '12345678901234567890123456'` (26 digits, over limit) → regex rejects → 400.
- Edge case: `discordId === ''` → regex rejects → 400.
- Edge case: `discordId === '12345'` (5 digits, under 17) → regex rejects → 400.
- Error path: `flag === 'is_admin'` (not in allowlist) → 400, no SQL executed.
- Error path: `flag` missing → 400.
- Error path: `discordId` contains non-digits → 400.
- Error path: no session → 404 (not 401 — 404 stealth).
- Error path: non-admin session → 404.
- Error path: DB throws on SELECT → 500 via `handleApiError`; no INSERT attempted.

**Verification:**
- A successful grant to an existing user flips only the requested flag and leaves the other one untouched (specifically: granting beta does NOT also set is_patron; granting patron does NOT also set is_beta_tester).
- A successful grant for a fresh Discord ID inserts a row with the flag set, `email=NULL`, `avatar_url=NULL`.
- 404 stealth covers both unauth and non-admin.

---

- [ ] U3. **`/admin` page shell with 404 stealth**

**Goal:** Server-component page that renders the admin grant panel for admins and `notFound()`s for everyone else. No client-side flash.

**Requirements:** R1

**Dependencies:** None for the page shell itself — can be scaffolded with a placeholder `<div>Admin panel</div>` first, then U4 replaces the placeholder once the panel exists. This lets U3 ship before U4 if useful.

**Files:**
- Create: `app/admin/page.tsx`
- Test: `app/admin/page.test.ts`

**Approach:**
- **`async` server component.** Next 16's `cookies()` from `next/headers` returns `Promise<ReadonlyRequestCookies>` ([verified in `node_modules/next/dist/server/request/cookies.d.ts`](node_modules/next/dist/server/request/cookies.d.ts)), so the component must be `async` and `await cookies()`.
- Session read (no new helper in `lib/auth.ts` — inline is simpler):
  ```
  const cookieStore = await cookies()
  const token = cookieStore.get('swupod_session')?.value
  const session = token ? verifyToken(token) : null  // verifyToken is already exported from lib/auth.ts
  ```
- If `!session?.is_admin`: emit `console.warn('admin-page-blocked', { hasSession: !!session, sessionId: session?.id })` AND call `notFound()` from `next/navigation`. The log gives Lee a Railway-grep handle to debug self-locked-out scenarios; the `notFound()` renders `app/not-found.tsx` with HTTP 404 (mechanic verified in `node_modules/next/dist/client/components/not-found.js`).
- If admin: render `<AdminGrantPanel />` (U4) inside a minimal page wrapper. No nav, no other admin tools. No client-side `useAuth()` re-check — the server gate is authoritative.

**Patterns to follow:**
- [app/sets/[setCode]/page.tsx:2,28](app/sets/[setCode]/page.tsx) — `notFound()` import + call.
- [app/not-found.tsx](app/not-found.tsx) — the 404 surface that will render.

**Test scenarios:**
- Happy path: spec assertion that the page imports `notFound` from `next/navigation`, `cookies` from `next/headers`, and `verifyToken` from `@/lib/auth`.
- Spec assertion that the file's exported default is an `async` function (the regex `/^export default async function/m` matches).
- Spec assertion that the page does NOT include `'use client'` directive.
- Spec assertion that the page contains `console.warn('admin-page-blocked'` for the debug-log requirement (string-search).
- Spec assertion that the gate uses `!session?.is_admin` (no false positives for empty session). String-search.
- Edge case: assertion that `<AdminGrantPanel />` is the only rendered child when admin (no leak of nav, dashboard chrome, etc.) — scope-control test.

**Verification:**
- Visiting `/admin` while logged out → 404 page renders.
- Visiting `/admin` while logged in as non-admin → 404 page renders.
- Visiting `/admin` while logged in as admin → panel renders.
- No user-facing console error or layout flash for non-admins.

---

- [ ] U4. **`<AdminGrantPanel />` client component**

**Goal:** The actual UI — type-ahead autocomplete, Patron/Beta toggle, Add button, success/error feedback.

**Requirements:** R2, R3, R4, R7

**Dependencies:** U1 (search route), U2 (grant route), U3 (page shell that renders it)

**Files:**
- Create: `src/components/admin/AdminGrantPanel.tsx`
- Create: `src/components/admin/AdminGrantPanel.css` (or co-located styles per existing convention)
- Test: `src/components/admin/AdminGrantPanel.test.tsx` (spec-style; assert wiring, not full render)

**Approach:**

- `'use client'` directive.
- **State:**
  - `query: string`
  - `suggestions: User[]` (last received from search)
  - `selected: User | PreprovisionSentinel | null` where `PreprovisionSentinel = { kind: 'preprovision', discordId: string }`
  - `flag: 'is_patron' | 'is_beta_tester'`, default `'is_patron'` (Patron-first because the dominant use case is paying patrons who haven't signed in; documented here so the default can be defended)
  - `status: 'idle' | 'searching' | 'submitting' | 'success' | 'error'`
  - `lastGranted: { user, preProvisioned, flag } | null` (for the success row)
  - `errorMessage: string | null`
- **Input layer:** reuse `<SearchInput value={query} onChange={...} debounceMs={300} />`. On debounced change: set `status='searching'`, fetch `/api/admin/users/search?q=<encoded>`, populate `suggestions`, set `status='idle'`.

- **State-to-render map** (the spec the implementer follows for each `status`):

| Status | Input | Dropdown area | Toggle | Add button | Feedback region |
|---|---|---|---|---|---|
| `idle` (no query) | Empty, focused | Hidden | Enabled, current `flag` highlighted | Disabled, label "Add" | Hidden (or shows `lastGranted` if present) |
| `idle` (query, suggestions present) | Shows query | Open, listing suggestions | Enabled | Disabled until selection, label "Add" | Same |
| `searching` | Shows query | Open, shows previous suggestions dimmed + a `…` indicator | Enabled | Disabled, label "Add" | Same |
| `idle` (query, no matches, all-digit) | Shows query | Open, single pre-provision row (see below) | Enabled | Disabled until row selected, label "Add" | Same |
| `idle` (query, no matches, non-digit) | Shows query | Open, single empty-state row: "No matches. To pre-provision a new user, enter their Discord user ID (a long number — see Discord's Copy User ID with Developer Mode on)." Row is NOT selectable. | Enabled | Disabled, label "Add" | Same |
| `submitting` | Shows query, disabled | Closed | Disabled | Disabled, label "Adding…" | Hidden |
| `success` | Reset to empty, focus returned to input | Closed | Preserved at last-used flag (workflow optimization, KTD) | Disabled, label "Add" | `lastGranted` success row visible |
| `error` | Shows query | Open or closed depending on what failed | Enabled | Enabled if `selected` is still valid | `<div role="alert">` with `errorMessage` |

- **Suggestions dropdown:** `<ul role="listbox" aria-label="Matching users">` of `<li role="option" id="opt-{i}">` rows. Rows are NOT `<button>` elements (per `.claude/rules/ui-components.md` — nested-button rule). Each row is a `<div role="button" tabIndex={-1}>` inside the `<li>`. Each existing-user row shows two columns: `username` (primary) and `discord_id` (secondary, mono font, smaller). Selected row has a visual highlight.

- **Pre-provision row visual treatment** (R4 + design-lens finding): the pre-provision row uses a distinct visual treatment so the admin cannot mistake it for an existing user:
  - Different row background (`var(--bg-warning-subtle)` or equivalent).
  - Icon prefix (e.g., a `+` or sparkle icon) with explicit 8px gap to the label per `feedback_button_icon_spacing`.
  - Label: "Pre-provision Discord ID `{query}`" on first line, "(no swupod account yet)" on second line in muted text.
  - Single-column (no `discord_id` secondary — the snowflake IS the label content).

- **ARIA / combobox structure** (design-lens finding): the input + dropdown forms an ARIA combobox:
  - Input gets `role="combobox"`, `aria-expanded={dropdownOpen}`, `aria-controls="suggestions-list"`, `aria-activedescendant={highlightedOptionId}`.
  - The `<ul>` gets `id="suggestions-list"` `role="listbox"`.
  - Each `<li>` gets `role="option"` and `id="opt-{i}"`. The currently-highlighted option's id matches `aria-activedescendant`.

- **Keyboard navigation:**
  - Up/Down arrows on the input move `highlighted` through suggestions (cycle, no wrap-around at boundaries). Updates `aria-activedescendant`.
  - Enter selects the highlighted suggestion (sets `selected`, closes dropdown, focus stays on input so the admin can immediately toggle/Add or type a new query).
  - Escape closes the dropdown, clears highlight. Focus stays on input.
  - Tab from input moves focus to the Patron toggle (NOT into the listbox — listbox is `aria-activedescendant` driven, not focus-walked).
  - Tab from toggle → Add button → success feedback region (if visible) → out.

- **Mobile behavior** (`.claude/rules/mobile.md`):
  - Dropdown is dismissed by tapping outside it (track via `pointerdown` outside the panel).
  - Dropdown has `max-height: 50vh; overflow-y: auto` so it never pushes the toggle/Add button off-screen on small viewports.
  - All hover styles in CSS wrapped in `@media (hover: hover) and (pointer: fine)`.
  - SearchInput's clear button still works inside the open dropdown (clearing closes the dropdown).

- **Flag toggle:** `<Button variant="toggle" glowColor="blue" active={flag === 'is_patron'}>Patron</Button>` and `<Button variant="toggle" glowColor="blue" active={flag === 'is_beta_tester'}>Beta</Button>` per `MEMORY.md` `feedback_use_button_component_for_toggles`.

- **Add CTA:** `<Button variant="primary" disabled={!selected || status === 'submitting' || status === 'searching'}>` — note `searching` is disabling (per adversarial finding: don't let admin act on stale suggestions). Label flips to "Adding…" while `submitting`.

- **On Add click:** set `status='submitting'`, `POST /api/admin/grant` with body:
  ```
  { flag, discordId: selected.kind === 'preprovision' ? selected.discordId : selected.discord_id, username: selected.kind === 'preprovision' ? undefined : selected.username }
  ```
  On 2xx: parse `{ data: { user, preProvisioned } }`, set `lastGranted`, set `status='success'`, reset `query`, reset `suggestions`, reset `selected` to null, **preserve `flag`**, return focus to input.
  On non-2xx: set `errorMessage` to the response's `message` (envelope) or a fallback, set `status='error'`, leave `selected` so the admin can retry.

- **Success feedback row** (varies by case; design-lens finding):

  | Case | Rendered text |
  |---|---|
  | Existing user, patron granted | `Granted patron access to {username} ({discord_id}).` |
  | Existing user, beta granted | `Granted beta access to {username} ({discord_id}). Tell them to sign out and back in to see beta features immediately.` |
  | Pre-provisioned, patron granted | `Pre-provisioned new user with Discord ID {discord_id} and granted patron access. They will see patron features on first sign-in.` |
  | Pre-provisioned, beta granted | `Pre-provisioned new user with Discord ID {discord_id} and granted beta access. They will see beta features on first sign-in.` |

  Rationale: the staleness note ("sign out and back in") shows ONLY for existing-user beta grants. Patron is re-queried from DB on every request ([app/api/auth/patron-status/route.ts:33](app/api/auth/patron-status/route.ts)), so no staleness. Pre-provisioned users get a fresh JWT on first sign-in, so no staleness either. Showing the note unconditionally trains the admin to ignore it.

- **Error feedback:** `<div role="alert">` with `errorMessage`. Styled per existing error patterns (look at `app/beta/page.tsx` error rendering).

- **CSS:** hover/focus inside `@media (hover: hover) and (pointer: fine)`. Co-locate styles in `AdminGrantPanel.css`.

**Patterns to follow:**
- [src/components/SearchInput.tsx](src/components/SearchInput.tsx) — debounced input shape; reuse, don't replace.
- [src/components/Button.tsx](src/components/Button.tsx) — variants `toggle` (with `glowColor="blue"`), `primary`.
- [app/beta/page.tsx](app/beta/page.tsx) — fetch shape (`credentials: 'include'`, read `{ data }` envelope).
- `.claude/rules/ui-components.md` (canonical nested-button rule and Button usage), `docs/STYLE_GUIDE.md`, `MEMORY.md` `feedback_use_button_component_for_toggles`, `feedback_button_icon_spacing`.
- WAI-ARIA Combobox pattern (combobox + listbox + activedescendant) for the autocomplete a11y shape.

**Test scenarios:**
- Happy path: render with mocked fetch, type 'ev', debounce fires, `/api/admin/users/search?q=ev` is called once (not 3 times for 3 keystrokes).
- Happy path: suggestion clicked → `selected` state updates → Add button enabled.
- Happy path: Add clicked with `flag='is_patron'` → `POST /api/admin/grant` called with `{ flag: 'is_patron', discordId, username }`.
- Happy path (R7): Toggle to Beta, click Add → POST body has `flag: 'is_beta_tester'`. Component never sends both flags in one request.
- Happy path: after a successful grant, `query` is reset, `selected` is null, but `flag` is preserved at last-used value (workflow optimization for grant-many-same-flag).
- Happy path: success message for existing-user beta grant contains "sign out and back in"; for existing-user patron grant does NOT.
- Happy path: success message for pre-provisioned grant contains "first sign-in"; not "sign out and back in".
- Edge case: empty query → no search request fired, dropdown hidden.
- Edge case: query='e' (1 char) → no search request fired (matches U1's short-circuit).
- Edge case: pre-provision row appears only when `query` matches `/^\d{17,25}$/` AND no exact `discord_id` match in suggestions.
- Edge case: non-digit query with zero matches → empty-state row renders ("No matches. To pre-provision..."); pre-provision row does NOT appear.
- Edge case: same input typed twice rapidly → debounce coalesces (only one network call).
- Edge case: while `status === 'searching'`, Add button is disabled even if a stale `selected` exists (adversarial finding: don't act on stale suggestions).
- Edge case: clicking outside the dropdown closes it (mobile + desktop).
- Edge case: ARIA — `aria-expanded` is `true` when suggestions visible, `false` otherwise; `aria-activedescendant` matches the highlighted option's id.
- Edge case: Tab order — input → Patron toggle → Beta toggle → Add → (success region if visible).
- Error path: search route returns 404 (e.g., admin session expired mid-page) → component shows a clear error, doesn't crash.
- Error path: grant route returns 400 (validation) → error message rendered in `role="alert"` region; `selected` is preserved so admin can retry.
- Integration: success feedback row reflects `{ user, preProvisioned }` returned from the grant route — message variant matches the case table.

**Verification:**
- Typing in the input shows suggestions after debounce.
- A snowflake-with-no-match shows the pre-provision row.
- Toggling Patron/Beta and clicking Add sends the right flag.
- After a successful grant, the success row shows correct user info and pre-provision status.

---

## System-Wide Impact

- **Interaction graph:** This page reads from and writes to `users`. No new code paths invoke or are invoked by the Patreon webhook, sync-patrons-cron, OAuth callback, or session refresh. **But the existing webhook does overlap with admin-granted flags in two ways the plan must accept honestly:**
  - **Pre-provisioned patron with `email=NULL` cannot be revoked by the webhook.** [app/api/webhooks/patreon/route.ts:128](app/api/webhooks/patreon/route.ts) matches by `LOWER(email) = LOWER($1)`. A pre-provisioned row's `email` is `NULL`, so `members:pledge:delete` for that Patreon account silently no-ops. The patron status persists until the user signs in with a matching email — at which point the email gets populated and the webhook can find them on subsequent events. Acceptable for friends-of-the-pod use; if you pre-provision someone who isn't actually a patron, no automated path revokes them.
  - **Webhook revoke clears `is_beta_tester` alongside `is_patron`.** [app/api/webhooks/patreon/route.ts:132-140](app/api/webhooks/patreon/route.ts) runs `UPDATE users SET is_patron = FALSE, is_beta_tester = FALSE WHERE LOWER(email) = LOWER($1)` on delete events. If you admin-grant beta to a user whose email later matches a churning Patreon account (theirs or a coincidental match), your grant is silently cleared. The current behavior of this webhook is acknowledged — the admin tool inherits it, doesn't introduce it.
  - The OAuth callback's UPDATE branch ([app/api/auth/callback/discord/route.ts:117-133](app/api/auth/callback/discord/route.ts)) harmlessly overwrites `username/email/avatar_url` on a pre-provisioned row when the target user signs in — and intentionally leaves `is_patron/is_beta_tester` alone (verified). No collision with the OAuth INSERT branch because of the preceding SELECT-by-discord_id check.
- **Error propagation:** Route errors flow through `handleApiError` → JSON envelope. Page errors (auth gate fails) render `app/not-found.tsx`. Panel errors render inline in `role="alert"`. No error path uses redirects.
- **State lifecycle risks:**
  - Idempotent upserts mean re-clicking Add isn't destructive. SELECT-then-UPSERT (per KTD) gives correct `preProvisioned` even under concurrent inserts.
  - **JWT staleness, per-flag:** `is_patron` is NOT in the JWT — every route re-queries the DB ([app/api/beta/enroll/route.ts:15](app/api/beta/enroll/route.ts), patron-status, etc.) — so patron grants take immediate effect. `is_beta_tester` IS in the JWT ([lib/auth.ts:23](lib/auth.ts)); routes like `/api/formats/pack-blitz`, `pack-wars`, `rotisserie`, and the beta-page UI gate read the cached JWT value. A beta grant to a currently-logged-in user only manifests after they hit `/api/auth/refresh` or sign out/in. This is reflected in the per-case success messages (U4) — staleness note shows ONLY for existing-user beta grants.
  - **Concurrent dual-grant race:** if the admin grants Patron in one tab and Beta in another for the same user near-simultaneously, both `UPDATE`s commit and the final row has both flags set. R7 holds per-request (each request sets only one flag), but cross-request the net state is dual-set. Acceptable; not worth row-locking for a single-admin tool. Documented in Risks.
- **API surface parity:** No other interfaces need the same change — this is a net-new admin capability. The CLI equivalent could be added later (`scripts/grantPatron.ts`, `scripts/grantBeta.ts`) but is out of scope.
- **Integration coverage:** Spec-style route tests cover SQL shapes and statuses. Wire-up between the panel and routes is covered by the panel's test (mocked fetch). An E2E that drives the page through the UI to grant patron to a synthetic admin-created user would be valuable but is out of scope for v1.
- **Unchanged invariants:** The Patreon webhook still owns automatic `is_patron` flips by email match (with the side effects called out above). The cron still owns weekly reconciliation. The OAuth callback still owns first-sign-in user creation. The `/api/beta/enroll` self-serve flow still requires patron-or-admin. None of these change; this admin tool is an additional, manually-invoked path.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Admin types a Discord handle instead of an ID for pre-provisioning, gets confused by the snowflake-only requirement. | UX labels the pre-provision row "Pre-provision Discord ID X (no swupod account yet)" with a distinct visual treatment (icon + colored background). Non-digit query with no matches shows the empty-state row pointing at Discord's "Copy User ID with Developer Mode" path. |
| `flag` parameter injected as SQL — array, object-with-`toString`, case-twist, or arbitrary string. | Three-step guard (KTD): `typeof flag === 'string'` check, then re-extract the matched value from the const allowlist, then interpolate the re-extracted value. Test scenarios cover boxed strings, arrays, `toString`-objects, case-twist, and `is_admin`. |
| `discordId` resource exhaustion / junk rows via giant digit strings. | `/^\d{17,25}$/` regex caps at 25 digits. Test scenarios cover empty, under-17, over-25, and non-digit. |
| 404 stealth accidentally hides a real bug from Lee (e.g., his admin flag got revoked, page silently 404s). | Page emits `console.warn('admin-page-blocked', { hasSession, sessionId })` BEFORE `notFound()`. Railway log grep on `admin-page-blocked` surfaces the case. Shipped in v1. |
| Search SQL `LIKE` on unindexed `username` becomes slow at scale. | Users table is small (low thousands); LIMIT 10 keeps it bounded. If it ever matters, add a `LOWER(username)` expression index — flagged for followup. |
| Granted beta user's JWT is stale until they refresh — admin thinks the grant failed because target says "I still don't have access." | Per-case success message: beta-to-existing-user includes "Tell them to sign out and back in." Patron grants never show the staleness note (patron is DB-re-queried, not JWT-cached). Pre-provisioned grants never show it (target has no existing JWT). Admin is not trained to ignore a generic "may need to refresh" caveat. |
| Pre-provisioned row has `username = discordId` (a number string) which looks ugly anywhere it surfaces before the user signs in. | Acceptable — the OAuth callback will overwrite `username` on first sign-in. Surfaces are admin-only (the grant panel + future admin views), not user-facing. |
| **Webhook silently clears admin-granted `is_beta_tester` when target's email matches a churning Patreon account.** | Inherited from existing webhook behavior, not introduced here. Documented in System-Wide Impact and `docs/ADMIN.md`. If it bites in practice, the followup is a webhook revision (don't clear beta on patron revoke) — separate plan. |
| **Pre-provisioned patron with `email=NULL` cannot be auto-revoked by the webhook.** | Acceptable for friends-of-the-pod direct-add. Documented. The admin's `psql` revoke path covers the rare cleanup case. |
| Concurrent grants of different flags to the same user → final row has both flags set, even though each request only set one. | R7 holds per-request (no auto-dual-set from one click). Cross-request races are accepted — single-admin tool, no row-locking complexity needed. Documented. |
| Admin clicks Add while search is in-flight, acting on stale `selected` state. | Add button is disabled while `status === 'searching'`. Pre-provision row is only computed against the most recently received suggestions, so click-during-flight scenarios resolve correctly via ON CONFLICT. |
| Admin loses admin flag mid-session; current page state retains `selected` user and the next Add silently 404s. | The 404 from `/api/admin/grant` flows into the panel's `errorMessage` via the alert region. The admin sees "Not found." Combined with the `admin-page-blocked` log line on the next page load, this is a recoverable failure mode rather than a silent black hole. |

---

## Documentation / Operational Notes

- Create `docs/ADMIN.md` covering:
  - What `/admin` does (grant patron, grant beta).
  - The Discord-ID-for-pre-provisioning requirement (and how to copy a Discord user ID).
  - The `psql` revoke path for the cases this tool doesn't cover.
  - The known webhook overlaps (pre-provisioned `email=NULL` not auto-revoked; webhook revoke clears admin-granted beta on email match).
  - The `admin-grant` log prefix for audit grep.
  - The `admin-page-blocked` log prefix for self-debugging when the page 404s unexpectedly.
- No deploy / rollout changes — ships behind the existing `is_admin` gate, no flag rollout.
- Railway logs: `grep 'admin-grant'` to audit grants over time; `grep 'admin-page-blocked'` to debug access issues.

---

## Sources & References

- Today's manual everly1990 fix (conversation context) — the canonical example of what this page automates.
- [migrations/063_add_is_patron_to_users.sql](migrations/063_add_is_patron_to_users.sql) — `is_patron` policy.
- [app/api/auth/callback/discord/route.ts](app/api/auth/callback/discord/route.ts) — OAuth user create/update shape.
- [app/api/admin/sync-patrons/route.ts](app/api/admin/sync-patrons/route.ts) — existing admin route pattern.
- [app/api/draft/[shareId]/dev/add-bots/route.ts](app/api/draft/[shareId]/dev/add-bots/route.ts) — `ON CONFLICT (discord_id) DO UPDATE` precedent.
- [scripts/makeAdmin.ts](scripts/makeAdmin.ts) — sibling capability (grant admin), same shape, different tier.
- [.claude/rules/ui-components.md](.claude/rules/ui-components.md), [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) — UI bar.
- [.claude/rules/database.md](.claude/rules/database.md), [.claude/rules/testing.md](.claude/rules/testing.md) — DB and test conventions.
