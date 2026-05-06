---
title: "feat: Pool Builds — shared pool, multiple builders, comparison view"
type: feat
status: active
date: 2026-05-06
---

# Pool Builds: Shared Pool, Multiple Builders

## Overview

Replace the standalone "Clone" action (creates a detached independent copy) with a "Build with This Pool" model where builds are children of a shared parent pool. Multiple players can build from the same pool; the pool detail page shows all builds in a comparison view; each build is owned by the player who created it.

The data model change is minimal: one new nullable FK column on `card_pools` (`parent_pool_id`). Everything else — the DeckBuilder, auto-save, Play flow — continues unchanged.

---

## Problem Frame

When a player shares their pool (sealed or draft) with friends via Discord, today's workflow is:
1. Share the pool link
2. Each friend clicks Clone to get their own copy
3. Everyone builds their deck independently
4. Comparison requires passing multiple links around — there's no shared view

**What Chris described**: A pool is a root. Each player who builds from it creates a "build" linked to that pool. The pool detail page shows all builds with leader/base/builder name. Clicking a build opens that player's DeckBuilder.

The "Clone" label is also confusing: users expect "clone" to mean copy, not "build my deck from this pool."

---

## Requirements Trace

- R1. A pool can have many builds (child pools) by different users, linked via `parent_pool_id`
- R2. "Build with This Pool" replaces the Clone action for the non-owner case
- R3. If the current user already has a build from this pool, "Build with This Pool" opens it rather than creating a duplicate
- R4. Pool detail page shows a comparison view of all builds (builder name, leader, base, deck size)
- R5. Builds inherit the parent pool's `is_public`; only the root pool owner can change visibility; changing root visibility cascades to all children
- R6. Build pools are first-class pool URLs — a build opens at `/pool/:buildShareId/deck` and works exactly like any other pool in the DeckBuilder
- R7. The pool detail and DeckBuilder pages show context when viewing a build ("Part of a group build — see all builds")

---

## Scope Boundaries

- No in-place "switch builds" within a single DeckBuilder view; clicking a build navigates to that build's URL
- No per-build privacy overrides; visibility is always inherited from the parent pool
- No deep nesting — builds cannot be children of builds; only one level of parent-child
- No granular card-diff highlighting in the comparison view (phase 2)
- Notes/comments on builds (the `notes` column already exists on each pool; no additional comment system)
- Pod comparison view (comparing all players' pools from the same draft) is separate — this plan covers shared-pool builds only

---

## Context & Research

### Relevant Code and Patterns

- **Clone today** (`src/utils/deckBuilderSharing.ts`): `shouldCloneSharedPoolForPlay()`, `getClonePoolName()`, `getClonedDeckBuilderState()` — pure utility functions, easy to rename and extend
- **Clone invocation** (`src/components/DeckBuilder/DeckBuilderHeader.tsx`): `handleClonePool()` calls `savePool()` with copied cards + state then redirects; runs for owner and non-owner
- **Auto-clone on Play** (`src/components/DeckBuilder.tsx` ~line 2189): triggers when non-owner hits Play on a shared sealed pool; currently creates a detached copy, should create a child pool instead
- **Pool creation** (`app/api/pools/route.ts`): `POST /api/pools` — this is where `parentPoolId` gets added
- **Pool GET** (`app/api/pools/[shareId]/route.ts`): returns pool detail; needs `parentPoolId`/`parentShareId` in response
- **Visibility update** (`app/api/pools/[shareId]/route.ts` PATCH handler): existing logic; add cascade here
- **Pool detail pages**: `app/sealed_pool/[shareId]/page.tsx`, `app/draft_pool/[shareId]/page.tsx` — both get a "Builds" section
- **`built_decks` table**: not changed in this plan; still records the finalized build when visiting Play

### Institutional Learnings

- PTP uses `shareId` (random token) as the access mechanism for pools — this is how builds will be shared too (each build gets its own `shareId`)
- `card_pools.user_id` is nullable (anonymous pools exist); builds should also allow anonymous builders but comparison view shows name only when user is logged in
- The `deck_builder_state` JSONB on `card_pools` is the source of truth for leader/base; the comparison view reads from it

---

## Key Technical Decisions

- **`parent_pool_id` on `card_pools`, not a new table**: Builds ARE pools with a parent link. DeckBuilder works unchanged. No migration of build-specific state — each build pool has its own `deck_builder_state`. Trade-off: `card_pools` grows by one nullable column; build pools are indistinguishable from root pools to generic pool queries.

- **Single-level only — validate at the API**: When creating a build, check that the parent pool has `parent_pool_id IS NULL`. If not, reject with 400. This prevents nested builds.

- **Privacy: cascade at write time**: When `PATCH /api/pools/:shareId` changes `is_public` on a root pool, immediately `UPDATE card_pools SET is_public = $1 WHERE parent_pool_id = $poolId`. Builds with `parent_pool_id IS NOT NULL` cannot change their own `is_public` via the API (return 403 if attempted).

- **One build per user per pool (authenticated users only)**: If an authenticated user already has a child pool for a given `parent_pool_id`, return the existing `shareId` rather than creating a duplicate. R3 applies to authenticated users only. Anonymous users (user_id = NULL) always create a new child pool — deduplication requires a known user identity.

- **`is_public` gates listing, not URL access**: Anyone with a shareId can always access a pool directly (existing behavior). `is_public` controls whether the pool appears in public listings and in the comparison view to non-members. This means: if a root pool goes private, the builds become hidden from the comparison view but their direct URLs still work for anyone who has the link.

- **Comparison view reads from `card_pools.deck_builder_state`**, not `built_decks`. The `built_decks` row only exists if the player visited the Play page. `deck_builder_state` may be NULL (newly created pool, never opened the DeckBuilder); the API and UI must treat NULL and an empty object the same — show a "not yet built" placeholder instead of erroring.

- **Build name format**: `{parent.name} – {user.displayName}'s Build`. If user is anonymous: `{parent.name} (Build)`. This replaces the `" (Copy)"` suffix.

---

## Open Questions

### Resolved During Planning

- **Should builds appear on the parent pool's detail page?** Yes — the comparison section always appears on the root pool's page. Child pool pages show a "Part of a group build" banner with a link to parent.
- **Can a user have multiple builds from the same pool?** No — "Build with This Pool" opens the existing build if one exists.
- **What about the DeckBuilder auto-clone-on-Play?** It becomes auto-build — creates a child pool instead. Same behavior, new parent_pool_id.

### Deferred to Implementation

- Whether to add a `UNIQUE(parent_pool_id, user_id)` constraint on `card_pools` — risky given nullable user_id and anonymous pools; runtime check is simpler for now. **Known race**: two rapid clicks from the same authenticated user can bypass the runtime check and create duplicate child pools before either request sees the other. Acceptable tradeoff — duplicates only manifest on double-click and the dedup path catches it on the next request.
- Whether the comparison view API should join `built_decks` to get finalized leader/base (more reliable) vs `deck_builder_state` (always available but less structured)
- **Known limitation — anonymous duplicate builds**: an anonymous user opening the same pool in multiple tabs will create multiple child pools, all labeled `"{pool} (Build)"`, indistinguishable in the comparison view. Acceptable: anonymous users are the minority and deduplication requires stable identity.

---

## Implementation Units

- [ ] U1. **Database Migration**

**Goal:** Add `parent_pool_id` to `card_pools` to establish parent-child relationship between pools and builds.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `migrations/060_add_parent_pool_id_to_card_pools.sql`

**Approach:**
- `ALTER TABLE card_pools ADD COLUMN parent_pool_id UUID REFERENCES card_pools(id) ON DELETE SET NULL`
- `CREATE INDEX ON card_pools (parent_pool_id) WHERE parent_pool_id IS NOT NULL`
- Nullable — all existing pools remain root pools

**Test scenarios:**
- Test expectation: none — schema-only migration; tested indirectly by U2 API tests

**Verification:**
- Migration runs without error against dev DB
- `SELECT column_name FROM information_schema.columns WHERE table_name = 'card_pools' AND column_name = 'parent_pool_id'` returns a row

---

- [ ] U2. **API — Build creation, build listing, privacy cascade**

**Goal:** Extend the pools API to support creating child pools (builds), listing all builds for a pool, and cascading visibility changes.

**Requirements:** R1, R2, R3, R5

**Dependencies:** U1

**Files:**
- Modify: `app/api/pools/route.ts` (POST handler — accept `parentPoolId`)
- Modify: `app/api/pools/[shareId]/route.ts` (GET — return `parentPoolId`/`parentShareId`; PATCH — cascade `is_public`)
- Create: `app/api/pools/[shareId]/builds/route.ts` (GET — list child pools with builder info)

**Approach:**
- `POST /api/pools` body: add `parentPoolId?: string`. If present: look up parent by `share_id`, verify it's a root pool (`parent_pool_id IS NULL`), copy `is_public` from parent, set `parent_pool_id = parent.id`. **Note on builds created while pool is private**: the child copies `is_public = false` from the parent at creation time — correct, no special handling needed.
- `POST /api/pools` response codes: return **201** for a newly created child pool; return **200** with `{ shareId, alreadyExists: true }` when deduplicating an existing build. Callers must branch on status code (or `alreadyExists` flag), not assume 201 always means new.
- `GET /api/pools/:shareId` response: add `parentPoolId: string | null`, `parentShareId: string | null`, `buildCount: number` (count of child pools). `poolType` is already returned by the existing handler (line 188) — U5 can use it directly to construct the parent pool link (`/sealed_pool/` vs `/draft_pool/`).
- `GET /api/pools/:shareId/builds`: the response must combine two sources:
  1. The root pool's own row (`card_pools WHERE share_id = $shareId`) as the first entry, representing the original builder's deck. The `WHERE parent_pool_id = $poolId` query never returns the root itself — fetch it explicitly and prepend.
  2. All child pools (`card_pools WHERE parent_pool_id = $rootId`), joined to `users` for `display_name`, sorted by `created_at`.
  For each entry, extract `activeLeader`/`activeBase` from `deck_builder_state`; treat NULL `deck_builder_state` as `{ activeLeader: null, activeBase: null }` — return a "not yet built" entry rather than omitting or erroring.
- `PATCH /api/pools/:shareId` — if changing `is_public` and pool has `parent_pool_id IS NOT NULL`, return `403 Forbidden`. If changing `is_public` on a root pool, cascade: `UPDATE card_pools SET is_public = $1 WHERE parent_pool_id = $poolId`
- Existing-build check: in `POST /api/pools`, if `parentPoolId` is set and `user.id` is non-null, check `SELECT id FROM card_pools WHERE parent_pool_id = $parentId AND user_id = $userId LIMIT 1` — if found, return `{ shareId: existing.share_id, alreadyExists: true }` with 200

**Patterns to follow:**
- `app/api/pools/route.ts` POST handler for pool creation
- `app/api/pools/[shareId]/route.ts` GET handler for pool detail
- `lib/db.js` query patterns

**Test scenarios:**
- Happy path: POST /api/pools with valid `parentPoolId` → child pool created with `parent_pool_id` set, `is_public` inherited from parent
- Edge case: `parentPoolId` points to non-existent pool → 404
- Edge case: `parentPoolId` points to a child pool (has its own `parent_pool_id`) → 400
- Edge case: authenticated user who already has a build for this pool → **200** with `alreadyExists: true` and the existing `shareId` (new pool creation returns 201)
- GET /api/pools/:shareId/builds with no children → `{ builds: [], originalBuild: {...} }`
- GET /api/pools/:shareId/builds with 2 child pools → 2 builds returned with leader/base/builderName
- PATCH is_public on child pool → 403
- PATCH is_public on root pool → cascades to all children; children's direct URLs still work post-cascade
- PATCH is_public on root pool with no children → no-op cascade (no error, 200)
- GET /api/pools/:shareId for a child pool → includes `parentShareId` in response
- GET /api/pools/:shareId/builds when root pool's `deck_builder_state` is NULL → returns root entry with `activeLeader: null, activeBase: null` (not an error)

**Verification:**
- All listed test scenarios pass
- Builds endpoint returns correct builder names and leader/base from `deck_builder_state`

---

- [ ] U3. **"Build with This Pool" — replace Clone UX**

**Goal:** Rename "Clone" to "Build with This Pool" throughout the DeckBuilder, change the created pool to be a child of the parent, and handle the "already have a build" case.

**Requirements:** R2, R3, R6

**Dependencies:** U2

**Files:**
- Modify: `src/utils/deckBuilderSharing.ts`
- Modify: `src/components/DeckBuilder/DeckBuilderHeader.tsx`
- Modify: `src/components/DeckBuilder/StickyInfoBar.tsx`
- Modify: `src/components/DeckBuilder.tsx` (auto-build-on-play flow)
- Modify: `src/utils/deckBuilderSharing.test.ts`

**Approach:**
- `deckBuilderSharing.ts`: rename `getClonePoolName` → `getBuildName(parentName, displayName)` returning `"{parentName} – {displayName}'s Build"` (or `"{parentName} (Build)"` for anonymous); rename `getClonedDeckBuilderState` → `getBuildDeckBuilderState`; rename `shouldCloneSharedPoolForPlay` → `shouldBuildFromSharedPool` (logic unchanged)
- `DeckBuilderHeader.tsx`: rename `handleClonePool` → `handleBuildFromPool`; change button label from "Clone" → "Build with This Pool"; pass `parentShareId: shareId` to the `savePool()` call
- `StickyInfoBar.tsx`: update Clone icon tooltip text to "Build with This Pool"
- `DeckBuilder.tsx` auto-build flow: pass `parentShareId` when creating the build pool; change status message `'Creating your own copy...'` → `'Setting up your build...'`; if API returns `alreadyExists: true` (200), navigate to existing build `shareId` instead of creating a new one. **Guard check**: the auto-build-on-play path already fires only for non-owners (`shouldBuildFromSharedPool`); verify the `isOwner` guard in that path matches the header button guard so owners never hit the auto-build flow.
- Owner flow: owner clicking "Build with This Pool" on their own pool — this is the original pool, not a build. Should owners see a "Build with This Pool" button at all? No — owners already ARE the original builder. Show the button only to non-owners (existing `isOwner` guard, same as Clone logic today).

**Patterns to follow:**
- `src/utils/deckBuilderSharing.ts` existing function signatures
- `handleClonePool` in `DeckBuilderHeader.tsx` for the redirect + API call pattern

**Test scenarios:**
- Happy path `getBuildName`: `("SOR Sealed", "Lee Edwards")` → `"SOR Sealed – Lee Edwards's Build"` (em dash `–` U+2013, not a hyphen)
- Edge case `getBuildName`: anonymous user (null display name) → `"SOR Sealed (Build)"`
- `shouldBuildFromSharedPool`: identical behavior to old `shouldCloneSharedPoolForPlay` — true for non-owner sealed non-draft pools
- Authenticated user: build creation returns `alreadyExists: true` → redirects to existing build (not new pool)
- Unauthenticated/anonymous user: "Build with This Pool" always creates a new child pool (no dedup check)
- Auto-build-on-play path: if API returns `alreadyExists: true` for an authenticated user, navigate to existing build's shareId (not new pool)
- Integration: clicking "Build with This Pool" creates child pool with correct `parentPoolId`, redirects to `/pool/:buildShareId/deck`

**Verification:**
- "Clone" label does not appear anywhere in the UI for shared pools
- Non-owner can click "Build with This Pool" on a public pool and land on their own DeckBuilder
- Second click by same user opens existing build, not a new one

---

- [ ] U4. **Comparison view — "Builds" section on pool detail pages**

**Goal:** Show all builds for a pool on the pool detail page. On a child pool's page, show a "Part of a group build" banner linking back to the parent.

**Requirements:** R4, R7

**Dependencies:** U2

**Files:**
- Create: `src/components/PoolBuilds.tsx`
- Modify: `app/sealed_pool/[shareId]/page.tsx`
- Modify: `app/draft_pool/[shareId]/page.tsx`

**Approach:**
- `PoolBuilds` component:
  - Fetches from `GET /api/pools/:shareId/builds` (uses root pool's `shareId`)
  - Shows a list/grid of build cards: builder avatar/name, leader name + image (if cards data available for lookup), base name + image, deck size
  - Each build card links to `/pool/:buildShareId/deck`
  - Empty state: "No other builds yet — share this pool to let others build from it" (shown only to pool owner). Note: the builds endpoint always returns the root pool's own entry as the first item, so the comparison list is never truly empty from the owner's perspective — this empty state fires only when `builds.length === 1` (just the original) and the viewer is the owner.
  - "Your build" badge on the card matching the current user's `user_id`
- Root pool page: add `<PoolBuilds shareId={shareId} isOwner={isOwner} />` section below the existing pool content
- Child pool page: add a `"Part of a group build"` banner above the existing content — shows parent pool name (linked), and a link to the parent's page which has the full comparison view. The `PoolBuilds` component renders here too, using the parent's `shareId`
- Leader/base display: `deck_builder_state.activeLeader` / `activeBase` are card IDs; resolve via the shared `cards.json` data already available in the app

**Patterns to follow:**
- Existing pool list card components in `app/sealed_pool/` and `app/draft_pool/`
- Existing leader/base rendering patterns in the DeckBuilder and Play page
- `docs/STYLE_GUIDE.md` and `.claude/rules/ui-components.md` for card/grid layout (must read before coding UI)

**Test scenarios:**
- Happy path: root pool with 2 builds → shows 2 build cards with correct builder names and leader/base
- Edge case: pool with only the original builder (no child builds) → "No other builds yet" empty state shown to owner; section hidden to non-owner
- Edge case: build where `deck_builder_state` has no `activeLeader` → shows "No leader selected" placeholder
- Integration: child pool page shows "Part of a group build" banner with link to parent

**Verification:**
- Pool detail page shows "Builds" section
- Each build card links to the correct DeckBuilder URL
- Child pool page shows parent link banner

---

- [ ] U5. **Build context in the DeckBuilder**

**Goal:** When using the DeckBuilder on a child pool (a build), show a lightweight indicator that this is part of a group build, with a link to see all builds.

**Requirements:** R7

**Dependencies:** U2

**Files:**
- Modify: `app/pool/[shareId]/deck/page.tsx` (DeckBuilder page)
- Modify: `src/components/DeckBuilder/DeckBuilderHeader.tsx` (or add a banner near the header)

**Approach:**
- Load pool via `GET /api/pools/:shareId`; if response includes `parentShareId`, the current pool is a child build
- Show a non-intrusive banner (below the header, above the card grid): "Part of a group build · [See all N builds]" — links to the parent pool's sealed/draft detail page
- The link goes to `/sealed_pool/:parentShareId` or `/draft_pool/:parentShareId` depending on pool type. Use the child pool's own `poolType` from the GET response — builds always share their parent's type, so no extra API call needed. (`poolType` is already returned by `GET /api/pools/:shareId` at line 188 of the route handler.)
- `buildCount` included in the GET response drives the count shown in the banner
- If `parentShareId` is null (root pool) and `buildCount > 0`: the pool detail page already shows the comparison (U4), no extra banner needed in the DeckBuilder

**Patterns to follow:**
- Existing sticky info bar and header layout in `DeckBuilderHeader.tsx`
- Style guide for banners (read `docs/STYLE_GUIDE.md` before coding)

**Test scenarios:**
- Child pool DeckBuilder page shows banner with correct parent link and build count
- Root pool DeckBuilder page does NOT show the banner

**Verification:**
- Non-owner visiting their build's DeckBuilder can navigate back to the parent pool's comparison view with one click

---

## System-Wide Impact

- **Interaction graph:** Pool creation (`POST /api/pools`) is called from `handleBuildFromPool` and the auto-build-on-play flow. Both callers need the `parentShareId` prop threaded through — verify all call sites.
- **Error propagation:** If `GET /api/pools/:shareId/builds` fails, the `PoolBuilds` component should show a silent empty state, not break the pool detail page.
- **State lifecycle risks:** The `deck_builder_state` on a child pool starts empty (no cards selected). The DeckBuilder auto-saves changes to the child pool — the parent pool's state is unaffected. Verify the auto-save path uses the child pool's `shareId`, not the parent's.
- **Unchanged invariants:** `built_decks` UNIQUE(card_pool_id) is preserved — each pool (root or child) still has at most one `built_decks` row. Child pool's Play page still fires `POST /api/pools/:shareId/build` as today.
- **Cascade scope:** Visibility cascade on `PATCH is_public` only goes one level deep (direct children). There are no grandchildren by design.
- **Anonymous pools:** Existing anonymous pools have `user_id = NULL`. They can still generate child build pools with `user_id = NULL`. R3 (dedup) applies only to authenticated users — anonymous builds always create a new child pool since there's no stable identity to deduplicate on. This is acceptable: anonymous users are the minority and can use the back button.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Auto-save on child pool writes to parent pool's `shareId` | Verify DeckBuilder page uses its own `shareId` from URL params, not a prop from parent pool |
| Comparison view shows stale leader/base (not yet selected) | Show "No leader selected" placeholder; don't error; users expect incomplete builds |
| Privacy cascade runs on every is_public toggle, even if no children | Add `WHERE parent_pool_id = $id` count check; UPDATE is a no-op if no children — acceptable |
| `deck_builder_state` JSONB shape differs between pools (legacy pools have different keys) | Use optional chaining when reading `activeLeader`/`activeBase`; treat missing as null |

---

## Sources & References

- Related code: `src/utils/deckBuilderSharing.ts`, `src/components/DeckBuilder/DeckBuilderHeader.tsx`, `src/components/DeckBuilder.tsx`
- Related migrations: `migrations/031_create_built_decks.sql`, `migrations/051_add_notes_to_pools.sql`
- API: `app/api/pools/route.ts`, `app/api/pools/[shareId]/route.ts`
- Style guide: `docs/STYLE_GUIDE.md`, `.claude/rules/ui-components.md`
