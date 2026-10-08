---
title: "feat: Import competitive sealed pool from registration sheet (SPIKE)"
type: feat
status: active
date: 2026-05-05
deepened: 2026-05-05
---

# feat: Import competitive sealed pool from registration sheet (SPIKE)

## Overview

Add an "Import Pool" entry point on the homepage that lets a Friend of the Pod upload up to 2 photos of a competitive sealed registration sheet. Claude vision extracts the event header, leader/base selections, full 96-card pool, and the marked deck. The user resolves any extraction errors in an aspect-grouped wizard, then lands in the existing sealed deckbuilder at `/pool/[shareId]/deck` with the deck pre-marked.

This is an exploratory SPIKE that introduces a first-time Anthropic SDK integration and the app's first file-upload flow, but ships a usable end-to-end feature behind a Friends-of-the-Pod gate.

---

## Problem Frame

Players who play registered sealed events have a paper sheet listing their pool and selected deck. Today, to revisit the pool in Protect the Pod they have to either rebuild it card-by-card in the limited deckbuilder (using the infinite-pool builder, which doesn't represent their real pool) or skip it entirely. There is no way to bring a real-world competitive pool into the app for review, sideboarding practice, or playtesting.

The fix is OCR-by-LLM: ask Claude to read the photo(s), extract the structured pool/deck, and produce a real `card_pools` row that flows into the existing sealed deckbuilder pipeline. Because vision extraction is imperfect (smudges, mis-spellings, unreadable quantities), the UX must include a guided resolution step where the player corrects extraction errors before the pool is created.

---

## Requirements Trace

- **R1.** New homepage entry point: a third button "Import Pool" sits on the bottom row next to the existing Limited Deckbuilder button, using the Death Star Plans card art.
- **R2.** Tapping Import Pool routes to a mobile-friendly upload screen.
- **R3.** Up to 2 images can be uploaded; the picker uses the camera by default on mobile and the file dialog on desktop.
- **R4.** Submitting images calls a server-side route that uses Claude vision to extract: detected set, event name, event date, player name, selected leader, selected base, and a list of `{ name, type, subtitle?, poolQty, deckQty }` rows.
- **R5.** Extracted card rows are matched against the in-app card database for the detected set, disambiguating same-name cards by `Name|Type|Subtitle`, resolving variants to Normal.
- **R6.** A resolution screen, grouped by aspect (mirroring the registration sheet layout), lets the user fix unrecognized cards (placeholder picker), wrong matches (open the picker), and quantities (+/- controls). Running totals show pool count, deck count, and confirm leader/base are present.
- **R7.** "Continue" is disabled until the pool is exactly 96 cards (1 leader + 1 base + 14 other × 6), the deck is a strict subset of the pool, and a leader and base are selected.
- **R8.** A confirm step shows the auto-composed title (`{event} · {date} · {player} · {leader} / {base}`), allows the user to edit it, and on submit creates a `card_pools` row with `pool_type='imported'`, then redirects to `/pool/[shareId]/deck`.
- **R9.** The deckbuilder loads with the marked deck already in the deck section, sideboard cards in the sideboard, and the active leader/base selected.
- **R10.** The feature is gated to Friends of the Pod (mirroring the existing `is_patron` gate in `app/api/draft/route.ts`); admins bypass the gate.
- **R11.** Pool is stored server-side anonymously-against-user (logged-in users see it in their pool history); the feature itself only works for logged-in patrons in the SPIKE.
- **R12.** Re-uploading images during the wizard discards the prior extraction and runs CV again (no manual-edit preservation in v1).

**Origin actors:** A1 (Player — patron with a registered sealed sheet), A2 (Server — extraction route), A3 (Claude vision)
**Origin flows:** F1 (Homepage → upload → extract → resolve → confirm → deckbuilder), F2 (Re-upload mid-wizard → re-extract), F3 (Resolve unknown card via picker)

---

## Scope Boundaries

- Non-goal: editing a created imported pool's roster (post-creation edits happen in the deckbuilder, not the import wizard).
- Non-goal: importing pools for sets whose cards aren't in the in-app DB. The detected-set must match a known `setConfig`.
- Non-goal: bulk-importing multiple sheets in one session.
- Non-goal: rotation among multiple competing CV providers; only Claude vision in v1.
- Non-goal: anonymous (logged-out) imports in v1 — gated to `is_patron`.
- Non-goal: live OCR / camera streaming. Static photos only.

### Deferred to Follow-Up Work

- **Cost dashboard / per-user usage caps:** measure and gate after the SPIKE.
- **Multi-sheet imports** (e.g. for a four-sheet sealed format if introduced).
- **Archetype tagging or auto-classification** of imported pools.
- **Edit-after-create flows in the import wizard** (today: re-import = re-run wizard).
- **Round-trip SWUDB export of imported pool's deck** — should mostly work for free since `pool_type='imported'` reuses the sealed export path; verify post-SPIKE.

---

## Context & Research

### Relevant Code and Patterns

- **Homepage button host:** [src/components/LandingPage.tsx:14](src/components/LandingPage.tsx#L14) — `MODE_ART` constant. [src/components/LandingPage.tsx:256](src/components/LandingPage.tsx#L256) — `.mode-full-width-row` (currently single deckbuilder button).
- **Mode-button styling:** [src/components/LandingPage.css:187](src/components/LandingPage.css#L187) — `.mode-button-wide`. ui-components rule explicitly keeps mode buttons custom (NOT `<Button>`).
- **Pool persistence:** [app/api/pools/route.ts](app/api/pools/route.ts) — POST accepts `{ setCode, cards, packs?, deckBuilderState?, isPublic, poolType, hidden, name }`. [src/utils/poolApi.ts:24](src/utils/poolApi.ts#L24) — `PoolData` / `SavedPool` types and `savePool()` wrapper.
- **Patron gate pattern to mirror:** [app/api/draft/route.ts:34](app/api/draft/route.ts#L34) — `queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])` with admin override.
- **Card DB + matching:** [src/utils/cardData.ts:19](src/utils/cardData.ts#L19) — `RawCard` type. [src/utils/cardNormalization.ts](src/utils/cardNormalization.ts) — `buildCardLookupMaps`, `normalCardMap`, `toNormalCard`, `normalizeCardId`. Uses `Name|Type|Subtitle` canonical key.
- **Card cache:** [src/utils/cardCache.ts:16](src/utils/cardCache.ts#L16) — `ALL_SETS = ['SOR','SHD','TWI','JTL','LOF','SEC','LAW']`. [src/utils/setConfigs/latest.ts:9](src/utils/setConfigs/latest.ts#L9) — `getLatestReleasedSetCode()` (currently `'LAW'`).
- **Pack composition:** [src/utils/packConstants.ts:20](src/utils/packConstants.ts#L20) — 16 cards/pack = 1 leader + 1 base + 9 commons + 3 uncommons + 1 R/L + 1 foil = 1 leader + 1 base + 14 other. ×6 = 96.
- **Aspect grouping (pure service):** [src/services/cards/cardSorting.ts](src/services/cards/cardSorting.ts) — `compareByAspectTypeCostName`, `sortByAspect`, `getAspectSortKey`. [src/utils/aspectCombinations.ts:47](src/utils/aspectCombinations.ts#L47) — `getAspectCombinationKey`, display names.
- **Deckbuilder state shape:** [src/components/DeckBuilder.tsx:1562](src/components/DeckBuilder.tsx#L1562) — `buildDeckStateSnapshot` defines the canonical `{ cardPositions, activeLeader, activeBase, deckCardIds, sideboardCardIds, poolName, sessionId }` shape.
- **Local-storage quota fix (load-bearing):** [src/utils/deckBuilderLocalState.ts:73](src/utils/deckBuilderLocalState.ts#L73) — `safeLocalStorageSetItem`, `buildDeckBuilderUiStorageState`. Any deckbuilder state we seed must go through these.
- **Existing deckbuilder route for handoff:** `app/pool/[shareId]/deck/page.tsx` (the URL the user provided: `/pool/EFEyNRnr/deck`).
- **Pool-type constraint:** [migrations/028_add_casual_pool_types.sql](migrations/028_add_casual_pool_types.sql) — current allowed values: `'sealed', 'draft', 'pack_blitz', 'pack_wars', 'chaos_sealed', 'rotisserie'`. Last migration: [migrations/058_add_bot_commitment.sql](migrations/058_add_bot_commitment.sql).
- **Card art reference for new button:** Death Star Plans Normal variant `JTL-260` → `https://cdn.starwarsunlimited.com//card_04010260_EN_Death_Star_Plans_a019b81e05.png`.

### Institutional Learnings

- **Local-storage quota crash recently fixed (commit `0b8b6ae`)**: any deckbuilder seeding must use `safeLocalStorageSetItem` and the trimmed `buildDeckBuilderUiStorageState` projection — never raw `localStorage.setItem`.
- **No `docs/solutions/`** in this repo; closest equivalents are scoped rule files in `.claude/rules/` (architecture, mobile, ui-components, testing, database) and `docs/STYLE_GUIDE.md`.
- **Spec-first / red-green TDD** is mandatory per `.claude/rules/testing.md` for new pure logic (matcher, pool assembly).
- **Memory rule:** `feedback_no_player_data_in_repo.md` — never commit captured registration-sheet images with real names. Test fixtures must be synthetic.
- **Memory rule:** `feedback_always_build_before_commit.md` — `npm run build` before any commit.
- **Memory rule:** `feedback_no_tournament_language.md` — UI must say "competitive" or "registered sealed pool", never "tournament".
- **Memory rule:** `feedback_button_icon_spacing.md` — explicit `gap: 8px` on icon+text buttons.

### External References

- Anthropic SDK: `@anthropic-ai/sdk` for Node, vision API via `image` content blocks. Use the in-environment `claude-api` skill when implementing for current SDK shape and prompt-caching pattern.
- `claude-opus-4-5` (or current strongest available) for vision extraction — Sonnet is faster/cheaper but vision quality matters; calibrate during U2/U11.

---

## Key Technical Decisions

- **Server-side extraction route, not client-side.** Decision: new `POST /api/import-pool/extract`. Rationale: keeps `ANTHROPIC_API_KEY` off the browser. Matches all existing third-party-API patterns (Discord, Patreon, swuapi).
- **Anthropic SDK wrapped in `lib/anthropic.ts`, not imported into route handlers directly.** Decision: introduce `lib/anthropic.ts` exposing narrow domain functions (e.g. `extractPoolFromImages(images, setHint?)`). The extract route imports from this lib. Rationale: mirrors the existing `lib/discord.ts` and `lib/patreon.ts` pattern. Centralises env-var checks, model selection, retries, and prompt-cache plumbing in one place; lets tests mock the lib export without intercepting network calls; keeps the route file focused on auth + envelope.
- **Both extract AND create are gated server-side; client never persists imported pools directly.** Decision: a new sibling route `POST /api/import-pool/create` accepts the resolved rows + leader + base + title, re-runs `buildPool` (U4) server-side, re-checks `is_patron`, enforces 96-card invariants, then INSERTs into `card_pools`. The existing `POST /api/pools` is NOT used by the wizard. Rationale: `POST /api/pools` allows anonymous submissions ([app/api/pools/route.ts:36](app/api/pools/route.ts#L36)); routing the wizard through it would let any logged-in non-patron craft a request that bypasses the extract gate and writes `pool_type='imported'` rows. The dedicated create route enforces the trust boundary at the right place.
- **`pool_type='imported'` as a new value.** Decision: add to the `card_pools_pool_type_check` constraint in a new migration. Rationale: lets history pages and stats distinguish imported pools without hijacking `'sealed'`. Cost is one idempotent migration; existing display paths fall through gracefully.
- **Claude returns card-name strings; matching happens locally.** Decision: prompt Claude for `{ name, type, subtitle?, poolQty, deckQty }` rows + header metadata, then match server-side against `getCachedCards(setCode)` via `buildCardLookupMaps`. Rationale: avoids stuffing the full card list into the prompt; uses the existing canonical-key matcher; the Normal-variant resolution is already battle-tested.
- **Set is auto-detected from sheet header.** Decision: Claude reads the set name from the header; we map to `setCode` via the `setConfigs` registry. If detection fails or returns an unknown set, the wizard surfaces an error with a manual set picker fallback. Rationale: matches user request and removes a click; fallback prevents lockout.
- **Two new routes, not one (`extract` + `create`).** Decision: see the gating decision above. Both routes Friends-of-the-Pod gated, both performing their own DB-backed `is_patron` check (the JWT does NOT encode `is_patron`). The created row is a normal `card_pools` row, so existing pool-history / sharing / save-state / GET endpoints work for free.
- **Deck/sideboard split lives in `deckBuilderState.cardPositions`.** Decision: build `cardPositions` server-side or client-side from the resolved data, set `section: 'deck' | 'sideboard'` per card, set `activeLeader` / `activeBase`. Rationale: matches the canonical shape DeckBuilder already restores from.
- **Multi-step wizard, not single-page inline.** Decision: three discrete screens (Upload → Resolve → Confirm) with back navigation. Rationale: the resolve step is dense (~96 rows + image preview) and benefits from a focused screen; matches the user's explicit choice.
- **Re-upload discards prior extraction.** Decision: hitting "change image" or uploading new files clears the resolution state and re-runs CV. Rationale: simplest mental model for v1; matches the user's explicit choice.
- **No client-side persistence of in-progress wizard state.** Decision: refresh = restart the wizard. Rationale: SPIKE simplicity; the deckbuilder still saves once the pool is created.
- **Anthropic SDK (`@anthropic-ai/sdk`).** Decision: official SDK for the route; prompt-cache the system prompt + extraction schema (small but stable). Rationale: idiomatic, safer than hand-rolled `fetch`, gives prompt-caching primitives.
- **Mode-button pattern, not `<Button>` component.** Decision: the new homepage button uses the existing `.mode-button` custom CSS pattern, with the bottom row converted to a 2-column layout matching `.mode-sections-row`. Rationale: explicit ui-components-rule exception lists landing-page mode buttons as custom; consistency with existing buttons.
- **Image preprocessing: client-side downsample to ≤2048px wide before upload.** Decision: a small util resizes via `<canvas>` before posting. Rationale: mobile photos are commonly 5–10 MB; downsampling to ≤2048px wide cuts payload ~5× without hurting CV legibility.

---

## Open Questions

### Resolved During Planning

- **Where does the resolution UI live?** → Multi-step wizard (Upload → Resolve → Confirm).
- **Set scope?** → Auto-detect from sheet header, with a manual override fallback.
- **Where does the CV call happen?** → Server-side `POST /api/import-pool/extract`.
- **Pool type?** → New `pool_type='imported'`.
- **Auth?** → Friends of the Pod gate (`is_patron` flag, DB-backed lookup) with admin override. Anonymous and logged-in non-patron access were both explicitly rejected per user requirements; this is enforced on **both** the extract route and the create route, since the JWT does not carry `is_patron`.
- **Re-upload behavior?** → Discard prior extraction, re-run CV.
- **Deckbuilder handoff?** → Redirect to `/pool/[shareId]/deck` after pool create.
- **Image input mode?** → Camera capture + gallery picker (`accept="image/*" capture="environment"`).

### Deferred to Implementation

- **Exact Claude prompt + structured output schema.** Will be calibrated against fixture images during U2 + U11. Plan-time best guess: ask for JSON matching `{ setName, eventName, eventDate, playerName, leaderName, leaderSubtitle, baseName, baseSubtitle, rows: [{ name, type, subtitle?, poolQty, deckQty, aspectGroup? }] }`.
- **Fuzzy match thresholds** (Levenshtein distance, candidate ranking). Calibrate against fixture extractions during U3.
- **Vision model choice** (Opus vs Sonnet). Start with `claude-opus-4-5` (or current Opus); benchmark Sonnet on ~5 fixtures to see if quality is acceptable for cost.
- **Retry / timeout policy** for the extract route. Plan-time: 30s server timeout, single retry on transient errors. Calibrate after first real usage.
- **Whether to include the full set's card list in the Claude prompt as additional grounding.** Plan-time default: NO (avoids large prompt + leans on local matcher). Revisit if matcher accuracy on fixtures is poor.
- **Final wizard URL structure.** Plan-time default: `/import-pool` is the wizard root, all three steps live in step state inside the page (no nested routes). Revisit if browser back-nav becomes needed.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
    A[Homepage<br/>Import Pool button] -->|router.push| B[/import-pool wizard/]
    B --> C[Step 1: Upload<br/>up to 2 images<br/>client downsample]
    C -->|POST /api/import-pool/extract| D{Claude Vision}
    D -->|JSON: header + rows| E[Server: card matcher<br/>buildCardLookupMaps]
    E -->|matched cards + candidates| F[Step 2: Resolve<br/>aspect-grouped<br/>+/- qty, picker]
    F -->|user re-uploads| C
    F -->|valid: pool=96, deck⊆pool| G[Step 3: Confirm<br/>edit title, review]
    G -->|POST /api/import-pool/create<br/>server re-validates +<br/>INSERTs pool_type=imported| H[card_pools row<br/>with deckBuilderState]
    H -->|router.push| I[/pool/shareId/deck<br/>existing sealed deckbuilder]
```

Extract response shape (directional):

```jsonc
{
  "header": {
    "setCode": "LAW",
    "eventName": "Crystal Cup #14",
    "eventDate": "2026-04-12",
    "playerName": "...",
    "leader":   { "name": "...", "subtitle": "..." },
    "base":     { "name": "...", "subtitle": null }
  },
  "rows": [
    { "name": "Sabacc Dealer", "type": "Unit", "subtitle": null, "poolQty": 2, "deckQty": 1, "aspectGroup": "Cunning" },
    { "name": "...", "type": "...", "poolQty": 1, "deckQty": 0 }
    /* ... up to ~80 rows; 96 - 1 leader - 1 base = 94 max-line-items, but a row can have qty>1 */
  ]
}
```

Server-side matched shape (directional):

```jsonc
{
  "header": { "setCode": "LAW", "leaderCardId": "LAW-001", "baseCardId": "LAW-009", /* ... */ },
  "rows": [
    {
      "extracted":  { "name": "Sabacc Dealer", "type": "Unit", "subtitle": null, "poolQty": 2, "deckQty": 1 },
      "matched":    { "id": "uuid...", "cardId": "LAW-085", "name": "Sabacc Dealer", /* RawCard */ },
      "candidates": [],
      "confidence": "exact"
    },
    {
      "extracted":  { "name": "Han Solo", "type": "Unit", "subtitle": null, "poolQty": 1, "deckQty": 1 },
      "matched":    null,
      "candidates": [/* multiple Han Solo Units in LAW; user picks */],
      "confidence": "ambiguous"
    }
  ]
}
```

---

## Output Structure

```
src/
  services/
    importPool/
      cardMatcher.ts
      cardMatcher.test.ts
      buildPool.ts
      buildPool.test.ts
      imagePrep.ts
      imagePrep.test.ts
  hooks/
    useImportPool.ts
  components/
    ImportPool/
      ImportPoolWizard.tsx
      UploadStep.tsx
      ResolveStep.tsx
      ConfirmStep.tsx
      CardPickerModal.tsx
      ImportPool.css
app/
  import-pool/
    page.tsx
  api/
    import-pool/
      extract/
        route.ts
        route.test.ts
      create/
        route.ts
        route.test.ts
lib/
  anthropic.ts
  anthropic.test.ts
migrations/
  059_add_imported_pool_type.sql
docs/
  IMPORT_POOL.md   (post-SPIKE learnings)
tests/
  e2e/
    import-pool.spec.ts
  fixtures/
    import-pool/             (gitignored — synthetic only, never real player photos)
```

---

## Implementation Units

- [ ] **U1. DB migration + pool-type allowlist audit**

  **Goal:** Allow the `card_pools` table to store imported pools as a distinct type without hijacking `'sealed'`, and ensure all existing display / stats paths render the new type.

  **Requirements:** R8.

  **Dependencies:** None.

  **Files:**
  - Create: `migrations/059_add_imported_pool_type.sql`
  - Modify (as required by audit): any file with a hardcoded pool-type allowlist or display-name map — likely candidates include `app/pool/[shareId]/page.tsx`, `src/components/Pool*.tsx`, stats endpoints under `app/api/stats/`, and any pool-history rendering helpers.

  **Approach:**
  - Drop and re-add `card_pools_pool_type_check` to add `'imported'` to the allowed list. Mirror the idempotent pattern in `migrations/028_add_casual_pool_types.sql`.
  - Migration must be safe to re-run (uses `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`).
  - **Audit step (part of U1, not deferred):** After the migration is written, grep for hardcoded pool-type allowlists across `app/`, `src/`, and `lib/`: search for the existing strings (`'sealed'`, `'pack_blitz'`, etc.) appearing together to identify switch statements / maps / type-narrowed conditionals. Extend each found allowlist or display-name map to include `'imported'`.

  **Patterns to follow:** `migrations/028_add_casual_pool_types.sql`.

  **Test scenarios:**
  - Happy path: `npm run migrate:prod status` after applying migration — new constraint accepts `'imported'`.
  - Edge case: re-applying the migration is a no-op (idempotent).
  - Integration: a `card_pools` row with `pool_type='imported'` round-trips through `GET /api/pools/[shareId]` and renders without errors on `/pool/[shareId]` and `/pool/[shareId]/deck`.
  - Integration: any pool-history listing UI shows imported pools with a sensible label (not blank, not raw `'imported'`).

  **Verification:** Migration runs on dev DB; manual INSERT of an `imported` row succeeds; grep for hardcoded pool-type allowlists returns no missing references; existing pool types still accepted.

---

- [ ] **U2. Anthropic SDK wrapper (`lib/anthropic.ts`) + extract API route**

  **Goal:** Add the Anthropic SDK as a dependency, introduce a `lib/anthropic.ts` wrapper that mirrors the `lib/discord.ts` / `lib/patreon.ts` pattern, and build the server-side extract route that uses the wrapper, runs the matcher (U3), and returns matched rows. Friends-of-the-Pod gated.

  **Requirements:** R4, R5, R10, R11.

  **Dependencies:** U3 (extract route calls the matcher and returns matched rows).

  **Files:**
  - Modify: `package.json` (add `@anthropic-ai/sdk`)
  - Modify: `.env.example` (add `ANTHROPIC_API_KEY`)
  - Create: `lib/anthropic.ts`
  - Create: `lib/anthropic.test.ts`
  - Create: `app/api/import-pool/extract/route.ts`
  - Create: `app/api/import-pool/extract/route.test.ts`
  - Modify (if helpful): `lib/auth.ts` — optionally add a `requirePatron(request)` helper. **Critical:** if added, the helper MUST query `users.is_patron` from the DB. The JWT `Session` interface ([lib/auth.ts:14](lib/auth.ts#L14)) does NOT encode `is_patron`; reading from the session object will silently pass for everyone. Mirror the explicit pattern at [app/api/draft/route.ts:34](app/api/draft/route.ts#L34).

  **Approach:**
  - **Server body size limit (load-bearing):** declare an explicit body-size limit on the route (App Router: export `const config = { api: { bodyParser: { sizeLimit: '11mb' } } }` or the equivalent in Next.js 16 App Router idiom — confirm during implementation). Without this, the request body is buffered before the handler can return 413, making the 10MB application check illusory.
  - Use the in-environment `claude-api` skill when implementing — get current SDK shape, model name, prompt-caching pattern, error-handling idioms.
  - **`lib/anthropic.ts` wrapper:** expose narrow domain functions only (e.g. `extractPoolFromImages(images: ImageInput[], opts?: { setHint?: SetCode }): Promise<RawExtractResponse>`). Centralise: env-var presence check (throw on missing `ANTHROPIC_API_KEY`), model selection, system-prompt template, prompt-cache flagging, and retry-once-on-transient. Mirror `lib/discord.ts` for shape/tone.
  - **Route handler responsibilities (thin):**
    1. Auth: `getSession(request)` → reject anonymous with 401; query `is_patron` from DB and reject non-patron non-admin with 403. Mirror [app/api/draft/route.ts:34-39](app/api/draft/route.ts#L34).
    2. Validate request body shape: `{ images: string[] (base64 data URLs), manualSetCode?: string }`. Reject >2 images, total payload >10MB, non-image MIME with 400/413.
    3. Call `extractPoolFromImages` from `lib/anthropic.ts`.
    4. **Validate Claude's response against a strict JSON schema** before trusting it: enforce per-row `poolQty: integer 0-6`, `deckQty: integer 0-6`, `name: non-empty string`, `type: 'Leader'|'Base'|'Unit'|'Event'|'Upgrade'`, total rows ≤ 100. Reject with 502 `EXTRACTION_INVALID_JSON` if schema fails. This is the prompt-injection mitigation surface.
    5. Map detected set name → `setCode` via `getSetConfig`; on miss and no `manualSetCode`, return 422 with `setCandidates`.
    6. Call `cardMatcher` (U3) with the validated rows + `setCode`.
    7. Return `{ header, rows: MatchedRow[] }` per High-Level Technical Design.
  - Server timeout 30s; single retry handled in `lib/anthropic.ts`.

  **Execution note:** Test-first. Mock `lib/anthropic.ts` exports in `route.test.ts`; mock the Anthropic SDK in `lib/anthropic.test.ts`.

  **Patterns to follow:** `lib/discord.ts` and `lib/patreon.ts` (lib wrapper shape); `app/api/draft/route.ts` (patron gate + error envelope); `app/api/auth/patron-status/route.ts:33` (`isPatron` lib usage as alternative to direct DB query).

  **Test scenarios:**
  - Happy path: valid images + valid session + patron → 200 with `{ header, rows }` matched-rows shape.
  - Auth: no session → 401. Logged-in non-patron → 403 "Friends of the Pod required". Admin (non-patron) → 200.
  - Auth: confirm patron check reads from DB, not from `session.is_patron` — write a regression test where `session.is_patron` is undefined and the DB returns `is_patron=true`; the route must succeed.
  - Edge case: 3 images → 400. Non-image MIME → 400. >10MB total payload → 413.
  - Edge case: 11+MB payload — server-level body-size limit returns 413 before handler is reached (verify via direct curl, not via test framework that may bypass the limit).
  - Edge case: detected set name maps to known `setCode` → succeeds. Unknown set, no `manualSetCode` → 422 with `setCandidates`.
  - Error path: Anthropic API 5xx → retried once in `lib/anthropic.ts`, then surfaced as 502 `EXTRACTION_UPSTREAM_ERROR`.
  - Error path: Anthropic returns malformed JSON → 502 `EXTRACTION_INVALID_JSON`.
  - Error path: Anthropic returns valid JSON with `poolQty: 999` (prompt-injection sim) → 502 `EXTRACTION_INVALID_JSON` from schema validation; never reaches matcher.
  - Integration: prompt-caching is enabled on the system block (verify via Anthropic response usage field showing `cache_read_input_tokens` on the second call in test).

  **Verification:** Calling the route against a fixture image returns parseable matched-rows JSON; auth/error envelopes match other API routes; body-size limit produces 413 on oversized payloads at the platform layer.

---

- [ ] **U3. Card matcher service (pure, server-only)**

  **Goal:** Map extracted `{ name, type, subtitle?, poolQty, deckQty }` rows to `RawCard` instances from the in-app card DB, disambiguating by `Name|Type|Subtitle`, resolving variants to Normal. **Imported and called by U2's extract route only — not the client.** The wizard receives already-matched rows from the route response.

  **Requirements:** R5.

  **Dependencies:** None (U2 imports this; no reverse dependency).

  **Files:**
  - Create: `src/services/importPool/cardMatcher.ts`
  - Create: `src/services/importPool/cardMatcher.test.ts`

  **Approach:**
  - Input: `{ rows: ExtractedRow[], setCode: SetCode }`.
  - Use `buildCardLookupMaps(getCachedCards(setCode))` to build canonical-key → Normal card maps.
  - For each row:
    - Primary: exact match on `Name|Type|Subtitle` canonical key → `confidence: 'exact'`.
    - Secondary: exact match on `Name|Type` (subtitle missing or unreadable) — if exactly one card matches → `confidence: 'high'`; if multiple → `confidence: 'ambiguous'` with `candidates[]`.
    - Tertiary: Levenshtein ≤ 2 on name (within set), tie-broken by type → `confidence: 'fuzzy'` with `candidates[]`.
    - Fallback: no match → `matched: null`, `confidence: 'unmatched'` with `candidates: []`.
  - Always resolve to Normal variant via `toNormalCard`.
  - Output: `MatchedRow[]` shape from High-Level Technical Design.

  **Execution note:** Test-first. Hand-curate 5–10 row scenarios covering exact / ambiguous / fuzzy / unmatched.

  **Patterns to follow:** `src/utils/cardNormalization.ts` (canonical key, lookup maps, `toNormalCard`).

  **Test scenarios:**
  - Happy path: exact `Name|Type|Subtitle` match returns `confidence: 'exact'` and the Normal card.
  - Edge case: same-name-different-subtitle (multiple "Han Solo" in JTL/LAW) returns `confidence: 'ambiguous'` with all candidates when subtitle is missing.
  - Edge case: typo within Levenshtein 2 ("Sabaac Dealer" → "Sabacc Dealer") returns `confidence: 'fuzzy'`.
  - Edge case: row claims a leader but no card with `isLeader=true` matches → unmatched.
  - Edge case: row name resolves to a non-Normal variant in `cards.json` → output is the Normal variant of that card.
  - Error path: empty set cards → returns all rows as unmatched (no crash).
  - Error path: `setCode` not in `ALL_SETS` → throws `Error('unknown setCode')`.

  **Verification:** Test suite passes; matcher handles ambiguity by surfacing candidates rather than guessing.

---

- [ ] **U4. Pool/deck assembly service (pure, server-only)**

  **Goal:** Take resolved matched rows + leader/base picks and produce `{ cards: RawCard[] (96), deckBuilderState }` ready to INSERT into `card_pools`. **Server-only**: imported and called by U13's create route. The client never assembles a trusted pool — it only ships resolved selections to the server, which re-runs this service.

  **Requirements:** R7, R8, R9.

  **Dependencies:** U3 (resolved-row shape).

  **Files:**
  - Create: `src/services/importPool/buildPool.ts`
  - Create: `src/services/importPool/buildPool.test.ts`

  **Approach:**
  - Input: `{ resolvedRows: ResolvedRow[], leader: RawCard, base: RawCard, setCode: SetCode }` where `ResolvedRow = { card: RawCard, poolQty: number, deckQty: number }`.
  - Expand each row into individual card entries by `poolQty` (each entry needs a unique `id` to avoid collisions — use `crypto.randomUUID()` for copies beyond the first, since `cards.json` `id` is a single UUID per variant).
  - Validate: total cards (including leader + base) === 96; leader count exactly 1; base count exactly 1; `deckQty <= poolQty` for every row; deck size is reasonable (typical: ≥30 main deck + leader + base; warn if outside range but don't block).
  - Build `deckBuilderState`:
    - `cardPositions: Record<id, { section: 'deck' | 'sideboard' | 'leaders-bases', card: RawCard }>` — first `deckQty` copies of each card go to `'deck'`, the rest to `'sideboard'`. Leader + base go to `'leaders-bases'`.
    - `activeLeader: leader.cardId`, `activeBase: base.cardId`.
    - `deckCardIds: string[]`, `sideboardCardIds: string[]` derived from `cardPositions`.
    - `poolName: string` — the auto-composed title.
    - `sessionId: nanoid()`.
  - Output: `{ cards: RawCard[], deckBuilderState, validationErrors: string[] }`.

  **Execution note:** Test-first.

  **Patterns to follow:** [src/components/DeckBuilder.tsx:1562](src/components/DeckBuilder.tsx#L1562) — `buildDeckStateSnapshot`. [src/contexts/DeckBuilderContext.jsx:60](src/contexts/DeckBuilderContext.jsx#L60) — section keys.

  **Test scenarios:**
  - Happy path: 6 leaders + 6 bases + 14 × 6 unique-or-duplicated other cards with `poolQty` summing to 84 produces a 96-card pool.
  - Wait — re-reading R6/R7 more carefully: each *player* selects 1 leader + 1 base from 6 of each, plus 14 other × 6 = 84 other = 96 total in the pool. The other 5 leaders and 5 bases remain in the pool but aren't active. Test scenarios must reflect this:
    - Happy path: pool has 6 leaders + 6 bases + 84 other = 96. `leader` and `base` inputs identify which of those 6 are active. `deckBuilderState.cardPositions` has all 12 leader/base entries in `'leaders-bases'`; only the active ones are referenced by `activeLeader`/`activeBase`.
  - Edge case: `poolQty=4` for a card → 4 distinct entries with unique ids in `cardPositions`, first `deckQty` in `'deck'`, rest in `'sideboard'`.
  - Edge case: `deckQty=0` for a card → all entries in `'sideboard'`.
  - Edge case: `deckQty>poolQty` → returns `validationErrors: ['deckQty exceeds poolQty for ...']`, does not throw.
  - Edge case: pool count != 96 → returns `validationErrors: ['expected 96 cards, got N']`.
  - Edge case: card object has no `imageUrl` (placeholder) → still placed correctly; downstream UI renders fallback.
  - **Regression guard for DeckBuilder restoration seam:** a leader or base accidentally placed in `cardPositions[id].section = 'deck'` is **dropped silently** by `DeckBuilder.tsx` restoration logic ([src/components/DeckBuilder.tsx:885-945](src/components/DeckBuilder.tsx#L885)). Test must assert leader/base entries always land in `'leaders-bases'`; reverse-direction test asserts that a fixture pool with leader-in-`'deck'` round-trips with the leader missing (encoding the silent-drop behavior so a future regression here is loud).
  - Integration: piping output through INSERT into `card_pools` produces a row whose `GET /api/pools/[shareId]` response round-trips the same `cardPositions`.

  **Verification:** Test suite passes; output shape matches `buildDeckStateSnapshot` format; restoration round-trip preserves deck/sideboard/leaders-bases sections.

---

- [ ] **U5. Image preprocessing utility (client-side)**

  **Goal:** Downsample uploaded images in the browser before posting, to keep payloads small and improve CV reliability.

  **Requirements:** R3.

  **Dependencies:** None.

  **Files:**
  - Create: `src/services/importPool/imagePrep.ts`
  - Create: `src/services/importPool/imagePrep.test.ts`

  **Approach:**
  - Function signature: `async resizeImage(file: File, opts?: { maxWidth?: number, maxHeight?: number, quality?: number }): Promise<{ dataUrl: string, width: number, height: number, sizeBytes: number }>`.
  - Default `maxWidth = 2048, maxHeight = 2048, quality = 0.85`.
  - Use `<canvas>` + `URL.createObjectURL` + `Image()` in DOM. Skip resize if image is already smaller than max.
  - Output JPEG data URL (smaller than PNG for photo content).
  - Reject non-image MIME (defense in depth — server also validates).

  **Patterns to follow:** None in repo (greenfield). Use idiomatic browser canvas resize.

  **Test scenarios:**
  - Test expectation: thin — pure DOM canvas behavior is hard to unit-test. Cover via E2E in U11.
  - Unit-testable: rejection on non-image MIME (`type: 'application/pdf'`) → throws.
  - Integration (in U11 E2E): uploading a 5MB PNG produces a sub-500KB JPEG data URL.

  **Verification:** Browser can upload a 5MB photo and receive a downsampled JPEG; non-image rejection works.

---

- [ ] **U6. `useImportPool` state hook (reducer-based)**

  **Goal:** Coordinate wizard state across Upload, Resolve, Confirm steps. Drive extract + create calls and edits to resolved rows.

  **Requirements:** R5, R6, R7, R12.

  **Dependencies:** U2 (extract route), U5 (image prep), U13 (create route).

  **Files:**
  - Create: `src/hooks/useImportPool.ts`
  - Create: `src/hooks/useImportPool.test.ts`

  **Approach:**
  - **Implementation shape: `useReducer` over a discriminated-union state.** With ~10 actions all mutating shared state (`addImages`, `removeImage`, `runExtraction`, `setRowQty`, `replaceRowCard`, `markRowAsLeader`, `markRowAsBase`, `setTitle`, `submit`, `reset`), scattered `useState` calls will drift. One action per exposed verb, each branch type-narrows the state.
  - State machine (encoded as the discriminated union's `phase`): `idle → uploading → extracting → resolving → confirming → submitting → done | error`.
  - Held state: `images: ProcessedImage[]`, `extraction: ExtractResponse | null`, `setOverride: SetCode | null`, `resolvedRows: ResolvedRow[]` (qty edits + manual matches), `activeLeader`, `activeBase`, `title`, `validationErrors`.
  - On `runExtraction`: POST `/api/import-pool/extract`, receive already-matched rows (matcher runs server-side per U2/U3).
  - On `submit`: POST `/api/import-pool/create` (U13), receive `shareId`, transition to `done`.
  - On image change after extraction: dispatch a `RESET_RESOLUTION` action; clears `extraction`, `resolvedRows`, validation; phase returns to `uploading`.
  - Validation runs continuously (in a derived selector, not stored): pool count, deck⊆pool, leader+base present.

  **Patterns to follow:** `src/hooks/` examples for hook shape; idiomatic React `useReducer` with TypeScript discriminated-union actions and state.

  **Test scenarios:**
  - Happy path: state machine progresses idle → uploading → extracting → resolving → confirming → submitting → done.
  - Error path: extract returns 502 → state transitions to `error` with the API error message; user can recover via `reset` action.
  - Edge case: image change during `resolving` phase clears `extraction` and `resolvedRows`, returns to `uploading`.
  - Edge case: validation flag flips green when pool reaches 96 + leader + base present + deck⊆pool; flips red when any condition unmet.
  - Edge case: `setRowQty` clamps deckQty to ≤ poolQty.

---

- [ ] **U7. Wizard root + Upload step UI**

  **Goal:** Mobile-friendly upload screen as Step 1 of the wizard.

  **Requirements:** R2, R3, R12.

  **Dependencies:** U5 (image prep), U6 (state hook).

  **Files:**
  - Create: `app/import-pool/page.tsx`
  - Create: `src/components/ImportPool/ImportPoolWizard.tsx`
  - Create: `src/components/ImportPool/UploadStep.tsx`
  - Create: `src/components/ImportPool/ImportPool.css`

  **Approach:**
  - Wizard root reads step from local hook state. No nested routes — refresh restarts the wizard (per scope).
  - Upload step:
    - Header: "Import a registered sealed pool" + short "what this is" copy ("Upload up to 2 photos of your registration sheet…").
    - File picker: `<input type="file" accept="image/*" capture="environment" multiple />` styled as a big drop zone / button.
    - After selection: thumbnail previews, "Remove" per-image, "Add another" if <2.
    - "Extract Pool" CTA (`<Button variant="primary">`) — disabled until ≥1 image selected; shows spinner during extraction.
    - On success: wizard advances to Resolve.
  - All `:hover` styles wrapped in `@media (hover: hover) and (pointer: fine)` per mobile rule.
  - All buttons except the file-input drop zone use `<Button>` per ui-components rule. Icon+text gap=8px.
  - Auth: page redirects logged-out users to `/api/auth/signin/discord?return_to=/import-pool`. Patrons-only check is enforced by the API route; the UI shows a friendly "Friends of the Pod required" message if 403 is returned.
  - Copy must NOT use the word "tournament" — say "competitive" or "registered sealed".

  **Patterns to follow:** `src/components/Button.tsx` for all non-mode buttons; `src/components/Modal.tsx` (if needed for errors); `app/sealed/new/page.tsx` for auth-redirect pattern.

  **Test scenarios:**
  - Test expectation: covered via E2E in U11. For unit tests: `Test expectation: none -- pure UI rendering, behavior verified end-to-end.`
  - Manual: upload 1 image on mobile (camera) and desktop (file picker) — both work.

  **Verification:** Page renders, file picker opens camera on mobile, "Extract" CTA disabled with no images, enables with ≥1 image.

---

- [ ] **U8. Resolve step UI (with embedded card picker)**

  **Goal:** Aspect-grouped review/fix UI showing extracted rows alongside the source image, letting the user resolve unrecognized cards, wrong matches, and bad quantities.

  **Requirements:** R6, R7.

  **Dependencies:** U6 (state hook).

  **Files:**
  - Create: `src/components/ImportPool/ResolveStep.tsx`
  - Create: `src/components/ImportPool/CardPickerModal.tsx`
  - Modify: `src/components/ImportPool/ImportPool.css`

  **Approach:**
  - Layout (mobile-first): image preview at top (collapsible), running totals strip (Pool: N/96, Deck: N, Leader: ✓/✗, Base: ✓/✗), then aspect-grouped sections matching the registration sheet.
  - Use `getAspectCombinationKey(card)` and `getAspectCombinationDisplayName(key)` for grouping; sort within group via `compareByAspectTypeCostName`.
  - Each row:
    - Card thumbnail (if `matched`) or "?" placeholder.
    - Card name + subtitle.
    - Pool qty: `[−] N [+]` controls.
    - Deck qty: `[−] N [+]` controls (capped at pool qty).
    - "Wrong card" affordance → opens `CardPickerModal` filtered to the row's aspect group + type.
  - Unmatched rows render as `?` placeholders with a prominent "Pick a card" CTA.
  - Ambiguous rows render with a small `[N candidates]` chip; tapping opens the picker pre-filtered to candidates.
  - "Re-upload" link returns to Upload (clears extraction per R12).
  - "Continue" CTA disabled while `validationErrors` is non-empty; tooltip lists what's missing.
  - All `:hover` wrapped per mobile rule. All controls work via taps.

  **Patterns to follow:** `src/services/cards/cardSorting.ts` (sortByAspect, compareByAspectTypeCostName); `src/utils/aspectCombinations.ts`; existing `<Button>` component; `src/components/Modal.tsx` for the picker.

  **Test scenarios:**
  - E2E (U11): upload fixture → resolve one unmatched row → resolve one wrong-match row → adjust qty → Continue enables when valid.
  - Unit-testable: a small render test that asserts an unmatched row shows the picker affordance and that a row with `confidence='ambiguous'` shows a candidates chip.

  **Verification:** Manual: upload a fixture image, fully resolve, Continue enables; mobile tap-only navigation works.

---

- [ ] **U9. Confirm step + create-and-redirect**

  **Goal:** Final review screen showing the auto-composed title (editable) and a roster summary, then call the server create route and redirect.

  **Requirements:** R8, R9.

  **Dependencies:** U6 (state hook), U13 (server create route).

  **Files:**
  - Create: `src/components/ImportPool/ConfirmStep.tsx`

  **Approach:**
  - Title: auto-composed `${eventName} · ${eventDate} · ${playerName} · ${leader.name}/${base.name}` (mind the `[PTP]` rule — do NOT auto-prefix; export adds it).
  - Editable title field.
  - Summary: leader + base portraits, deck card count, sideboard card count, aspect breakdown.
  - "Create Pool" CTA → POST `/api/import-pool/create` (U13) with `{ resolvedRows, activeLeader, activeBase, title, setCode }`. The route re-runs `buildPool`, re-checks the patron gate, and INSERTs.
  - On success (returns `{ shareId }`): `router.push('/pool/' + shareId + '/deck')`.
  - On failure: surface error inline, allow retry.
  - "Back" returns to Resolve preserving state.
  - **No client-side `savePool()` call**: the wizard never POSTs to `/api/pools` directly. All trust boundaries are server-enforced (per Key Technical Decisions).

  **Patterns to follow:** [app/api/formats/pack-blitz/route.ts](app/api/formats/pack-blitz/route.ts) (server-side INSERT pattern that U13 mirrors).

  **Test scenarios:**
  - E2E (U11): full happy-path → land on `/pool/[shareId]/deck` with deck pre-marked.
  - Error path: server 502 from `/api/import-pool/create` → error surfaced, "Retry" works without losing state.
  - Error path: server 422 from create route (validation failure) → surfaces the specific validation error from the response body.
  - Edge case: title with weird unicode is preserved on submit and displayed correctly on the deckbuilder page.

  **Verification:** Pool persists with `pool_type='imported'`, redirect lands on existing deckbuilder route, deck section is populated.

---

- [ ] **U10. Homepage Import Pool button**

  **Goal:** Add the third bottom-row button on the landing page, with the Death Star Plans card art, pushing the deckbuilder button to the left.

  **Requirements:** R1.

  **Dependencies:** U7 (the `/import-pool` route must exist for the button to navigate to).

  **Files:**
  - Modify: `src/components/LandingPage.tsx` — add `MODE_ART.importPool` entry; convert `.mode-full-width-row` to a 2-button layout matching `.mode-sections-row`.
  - Modify: `src/components/LandingPage.css` — adjust `.mode-button-wide` styles or replace with a 2-column grid on the bottom row; verify mobile breakpoint at 768px renders both buttons.

  **Approach:**
  - Replace the single-button `.mode-full-width-row` with a two-column `.mode-sections-row`-style row.
  - New button: title "Import Pool", subtitle "From your registered sealed sheet" (or similar; never use the word "tournament").
  - Card art: `https://cdn.starwarsunlimited.com//card_04010260_EN_Death_Star_Plans_a019b81e05.png` (JTL-260 Normal).
  - Click handler: `() => router.push('/import-pool')`.
  - Mobile (≤768px): both buttons stack vertically.
  - All `:hover` rules wrapped per mobile rule.

  **Patterns to follow:** [src/components/LandingPage.tsx:194](src/components/LandingPage.tsx#L194) (mode-button structure); [src/components/LandingPage.css:187](src/components/LandingPage.css#L187) (existing wide-button styles to adapt).

  **Test scenarios:**
  - Manual: button renders, click navigates to `/import-pool`, mobile breakpoint stacks correctly.
  - E2E (U11): button is visible on `/`, clicking navigates to `/import-pool`.
  - Test expectation: visual regression depends on E2E; no separate unit test.

  **Verification:** Homepage renders the new button next to the deckbuilder button; navigation works; mobile breakpoint stacks correctly.

---

- [ ] **U11. E2E test + service test consolidation + synthetic fixture**

  **Goal:** Lock in the happy path end-to-end and harden the matcher/assembly with realistic fixtures.

  **Requirements:** all R-IDs.

  **Dependencies:** U1–U10.

  **Files:**
  - Create: `tests/e2e/import-pool.spec.ts`
  - Create: `tests/fixtures/import-pool/synthetic-sheet-LAW.png` (synthetic, no real player data — generate from a Figma/Sketch mockup or hand-roll in canvas)
  - Modify: `.gitignore` — add `tests/fixtures/import-pool/private/` for any locally-staged real photos used during dev (NEVER committed)
  - Add unit-test fixtures under `src/services/importPool/__fixtures__/` for mocked extraction responses (covers ambiguous, unmatched, fuzzy cases).

  **Approach:**
  - E2E flow:
    1. Login as a test patron user (or seed `is_patron=true` for the test user via Playwright global setup).
    2. Navigate to `/`, click Import Pool, upload synthetic fixture image.
    3. Mock the Anthropic API call at the network layer (Playwright `route()`) returning a known-good extraction.
    4. Assert resolve step renders 96 cards in correct aspect groups.
    5. Click Continue → confirm step → Create Pool.
    6. Assert URL is `/pool/[shareId]/deck` and the deck section contains the expected cards.
  - Unit tests in U3, U4 expanded with the fixture cases.

  **Execution note:** E2E tests must drive every action through the UI per memory `feedback_e2e_ui_only.md` — never call the API directly except to mock Anthropic.

  **Patterns to follow:** Existing Playwright tests in `tests/e2e/` (Playwright `testDir` is `./tests/e2e`, confirmed in `playwright.config.ts:8`).

  **Test scenarios:**
  - Happy path E2E as described.
  - Edge case E2E: ambiguous row → user picks from candidates → Continue enables.
  - Edge case E2E: unmatched row → user picks via card picker → Continue enables.
  - Edge case E2E: pool != 96 → Continue disabled with tooltip.
  - Edge case: non-patron logged-in user gets the "Friends of the Pod required" message on `/import-pool`.
  - Edge case: logged-out user is redirected to Discord signin from `/import-pool`.

  **Verification:** `npm run test:e2e -- --grep "Import Pool"` passes; service tests pass under `npm run test`.

---

- [ ] **U13. Server-side create API route (`POST /api/import-pool/create`)**

  **Goal:** Trust-boundary endpoint that accepts the wizard's resolved selections, re-runs assembly server-side, re-enforces the patron gate, and INSERTs the pool. The wizard never persists imported pools through any other path.

  **Requirements:** R7, R8, R10, R11.

  **Dependencies:** U1 (`pool_type='imported'` constraint), U3 (matcher — for re-validation of any client-edited card picks), U4 (assembly).

  **Files:**
  - Create: `app/api/import-pool/create/route.ts`
  - Create: `app/api/import-pool/create/route.test.ts`

  **Approach:**
  - **Same body-size limit posture as U2** (declare `bodyParser` size limit; resolved rows + selections is small but the gate must exist).
  - **Auth: same DB-backed `is_patron` check** as U2. The JWT is not a patron-source-of-truth.
  - Accept body `{ setCode, resolvedRows: ResolvedRow[], activeLeaderCardId, activeBaseCardId, title }`.
  - Server-side validations:
    1. `setCode` is in `ALL_SETS`.
    2. Each resolved row's `card.id` exists in `getCachedCards(setCode)` (re-resolve through `cardMatcher` if necessary; defensive against client-fabricated cards).
    3. `activeLeaderCardId` / `activeBaseCardId` resolve to real cards in the set, with `isLeader=true` / `isBase=true` respectively.
    4. Total card count after expansion === 96.
    5. For every row, `0 ≤ deckQty ≤ poolQty ≤ 6`.
    6. Title length ≤ 80 chars (matches SWUDB export limit), no `[PTP]` prefix.
  - On any validation failure: 422 with `{ error: 'VALIDATION_FAILED', details: [...] }`.
  - On success: call `buildPool` (U4) to produce `{ cards, deckBuilderState }`, then INSERT into `card_pools` with `pool_type='imported'`. Mirror the INSERT shape from [app/api/formats/pack-blitz/route.ts](app/api/formats/pack-blitz/route.ts).
  - Generate `share_id` via `nanoid(8)`.
  - Return `{ shareId, shareUrl: '/pool/' + shareId + '/deck' }`.

  **Execution note:** Test-first. Cover the auth bypass attempt (logged-in non-patron crafts a request — must 403).

  **Patterns to follow:** [app/api/formats/pack-blitz/route.ts](app/api/formats/pack-blitz/route.ts) (server-side INSERT into `card_pools`); [app/api/draft/route.ts:34](app/api/draft/route.ts#L34) (DB-backed patron check); [lib/db.ts](lib/db.ts) (`query` helper).

  **Test scenarios:**
  - Happy path: valid resolved rows + patron session → 201 with `{ shareId, shareUrl }`; row exists in `card_pools` with `pool_type='imported'`.
  - **Auth bypass guard:** logged-in non-patron with valid resolved rows → 403 (regression guard for the security finding).
  - Auth: anonymous → 401.
  - Edge case: pool count != 96 after expansion → 422 with `details: [{ code: 'POOL_SIZE', expected: 96, got: N }]`.
  - Edge case: `activeLeaderCardId` resolves to a card with `isLeader=false` → 422 `INVALID_LEADER`.
  - Edge case: client submits a card whose `id` is not in the cached card DB for `setCode` → 422 `UNKNOWN_CARD`.
  - Edge case: `deckQty > poolQty` for a row → 422 `INVALID_QTY`.
  - Edge case: title > 80 chars → 422 `TITLE_TOO_LONG`.
  - Integration: post-INSERT `GET /api/pools/[shareId]` returns the pool and `/pool/[shareId]/deck` renders.

  **Verification:** Created pool round-trips through the existing deckbuilder route; non-patron users cannot create imported pools by any means.

---

- [ ] **U12. Documentation + spike learnings capture**

  **Goal:** Document the integration shape, prompt, calibration thresholds, and known-failure cases so the SPIKE produces durable institutional knowledge.

  **Requirements:** none functional; supports future maintenance.

  **Dependencies:** U2, U3, U11 (need real-fixture data to write meaningfully).

  **Files:**
  - Create: `docs/IMPORT_POOL.md`
  - Modify: `docs/PRIVATE_API.md` (or similar — append the `/api/import-pool/extract` route)
  - Modify: `RELEASE_NOTES.md` (root only — add a section for the deploy date that ships this; never edit `public/RELEASE_NOTES.md`)
  - Modify: `CLAUDE.md` (consider adding Import Pool to the Common Commands section if any new scripts emerge)

  **Approach:**
  - `IMPORT_POOL.md` covers: the Claude prompt template, expected JSON schema, fuzzy-match thresholds chosen, estimated cost per extraction, common failure modes seen in fixture testing, links to the service files.
  - Cross-link from `docs/ARCHITECTURE.md` if relevant.

  **Test scenarios:** `Test expectation: none -- documentation only.`

  **Verification:** Docs link target files; release notes mention the SPIKE behind FotP gate.

---

## System-Wide Impact

- **Interaction graph:** New API route under `app/api/import-pool/`. New page route at `/import-pool`. Hands off to existing `app/pool/[shareId]/deck/page.tsx` which already handles `pool_type='sealed'`-shaped pools — verify it doesn't reject `'imported'` (likely fine; check for hard-coded type allow-lists).
- **Error propagation:** Extraction failures surface as inline UI errors in the Upload step. Match failures surface as per-row affordances in the Resolve step. Pool creation failures surface inline in the Confirm step. None should produce console-only errors.
- **State lifecycle risks:** A wizard mid-flight has no server-side persistence. Refreshing the page restarts the wizard. Acceptable for SPIKE.
- **API surface parity:** No other client surfaces (mobile, share links) need changes. The deckbuilder route already exists.
- **Integration coverage:** The matched-rows → `deckBuilderState` → `card_pools` row → DeckBuilder restoration round-trip is the critical seam. Covered by U4 unit tests + U11 E2E.
- **Unchanged invariants:** Existing pool types (`'sealed', 'draft', 'pack_blitz', 'pack_wars', 'chaos_sealed', 'rotisserie'`) continue to behave identically. The deckbuilder restoration code path is unchanged. The `card_pools` schema gains one allowed enum value via constraint update — no column changes.
- **Cost surface (NEW):** Anthropic API spend is now part of operating costs. Friends-of-the-Pod gate caps the eligible audience; monitor usage post-launch and consider per-user rate limits if needed.
- **Privacy surface (NEW):** Uploaded images contain real player names. They are sent to Anthropic for processing and are NOT persisted in our DB. Document this clearly in the upload UI ("Your photos are sent to Anthropic for OCR and not stored").

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Claude vision misreads cards on poor-quality photos. | Resolve step is mandatory — every imported pool passes through human review before creation. Fuzzy-match candidates surface alternatives. |
| Same-name cards (Han Solo across sets/types) get confused. | Matcher disambiguates by `Name|Type|Subtitle`; ambiguous rows surface candidate list rather than guess. |
| Anthropic API costs balloon if a spammer uploads many sheets. | Friends-of-the-Pod gate (small audience). Server-side enforces ≤2 images per call and ≤10MB total. Future: per-user daily caps. |
| Anthropic API outage blocks the whole feature. | Single retry on transient errors; clear "Try again later" UX on persistent failure. SPIKE-acceptable. |
| Image upload UX is mobile-fragile (iOS Safari especially). | Test on real devices (iOS + Android) during U11. Use the mobile-friendly camera-or-gallery input (`capture="environment"`). |
| **Patron gate bypass via direct API.** A logged-in non-patron crafts a request to a persistence endpoint and creates an `imported` pool, sidestepping the extract gate. | The wizard never POSTs to `/api/pools` directly. The dedicated `POST /api/import-pool/create` route (U13) re-enforces `is_patron` server-side. Both routes (extract + create) check `is_patron` from the DB, not the JWT. |
| **`is_patron` read from JWT instead of DB.** A `requirePatron` helper that reads `session.is_patron` would silently pass everyone, since that field isn't encoded in the token. | U2 + U13 explicitly call `queryRow('SELECT is_patron FROM users WHERE id = $1', ...)`. Regression test: session with `is_patron=undefined` and DB row with `is_patron=true` must succeed; session with `is_patron=true` and DB row with `is_patron=false` must fail. |
| **Image size limits illusory without server body-cap.** Next.js buffers the full request body before the handler runs; an in-handler 413 fires after memory is already consumed. | U2 and U13 declare an explicit `bodyParser.sizeLimit: '11mb'` (or App-Router-equivalent) on the route handler. Manual curl test of an 11MB POST verifies the limit fires at the platform layer. |
| **Prompt injection: a crafted sheet manipulates Claude's response.** Worst case is fabricated card names or out-of-bounds quantities returned by the model. | (a) U2 enforces a strict JSON-schema validation on Claude's response with numeric bounds (`poolQty`/`deckQty` ≤ 6, `name` non-empty string, `type` enum) before passing to the matcher. (b) U13 re-validates server-side, including matching every card to the in-set DB; fabricated card IDs are rejected with 422. The matcher itself is not a trust boundary — it can only return cards that exist in `getCachedCards(setCode)`. |
| **Privacy: player names on photos sent to Anthropic.** Identifiable data leaves our system; under GDPR/CCPA, third-party processor disclosure should be more than advisory. | (a) Upload-step UI shows an explicit "Your photos are sent to Anthropic for OCR and not stored" notice. (b) Confirm whether an existing privacy policy covers third-party LLM processing; if not, add an explicit consent checkbox at the upload step before any GA promotion beyond SPIKE/FotP. (c) Images are not persisted in our DB. (d) Server route does NOT log raw image bytes — verify this with U2 review. |
| **Local-storage quota crash if we accidentally bypass `safeLocalStorageSetItem`.** | The wizard does NOT write to deckbuilder local-storage keys directly; once the pool is created server-side, the existing deckbuilder loads via `GET /api/pools/[shareId]` and uses the existing local-storage discipline. |
| **Pool detail page (`/pool/[shareId]`) hardcodes a list of pool types and rejects `'imported'`.** | Audit and patch as part of U1 (promoted from this risk table to a U1 sub-step). |
| **Stale `uiStorageKey` collision** if a user imports → edits → deletes → re-imports for the same `shareId`-prefix-collision. | `share_id` is fresh `nanoid(8)` per create; collision probability is negligible. U11 E2E covers fresh-import case. |
| `[PTP]` SWUDB-export prefix accidentally injected into the wizard's auto-composed title. | Title field intentionally stays prefix-free; export-time formatter is the only place that adds `[PTP]`. U13 server-side validation rejects titles starting with `[PTP]`. |

---

## Documentation / Operational Notes

- **New env var:** `ANTHROPIC_API_KEY` must be set in Railway production + dev environments before this ships. Add to `.env.example`.
- **New dependency:** `@anthropic-ai/sdk` — check version compat with Node 20.9+.
- **Migration sequencing:** `migrations/059_add_imported_pool_type.sql` runs at server startup. Verify on staging Railway environment first per `feedback_test_migrations_locally.md`.
- **Friends of the Pod onboarding:** No new role plumbing — uses the existing `is_patron` flag synced from Discord via `lib/discord.ts:isPatron()`.
- **Release notes:** Root `RELEASE_NOTES.md` only (`public/RELEASE_NOTES.md` is generated). Each deploy date gets its own section. Mention the FotP gate.
- **Build before commit:** `npm run build` is required pre-commit per project memory.

---

## Phased Delivery

### Phase 1 — Foundations (U1, U2, U3, U4, U13)
- DB migration + allowlist audit (U1), Anthropic SDK wrapper + extract route (U2), pure matcher (U3), pure assembly (U4), server-side create route (U13). Zero user-visible changes; both server routes are reachable via curl with auth.
- **Ops prerequisite (blocks Phase 1 merge):** provision `ANTHROPIC_API_KEY` on Railway production AND staging environments. Confirm via `railway run -e production env | grep ANTHROPIC` (do not log the key value).
- **Verification:** curl `/api/import-pool/extract` against a fixture image with a patron session → returns matched rows JSON. curl `/api/import-pool/create` with synthetic resolved rows → returns `{ shareId }` and `GET /api/pools/[shareId]` round-trips.

### Phase 2 — Wizard UI (U5, U6, U7, U8, U9)
- Image preprocessing utility (U5), reducer-based state hook (U6), three wizard steps (U7/U8/U9). The full upload-to-deckbuilder flow lands. Still no homepage entry point — testers reach it via direct URL `/import-pool`.

### Phase 3 — Discoverability + Hardening (U10, U11, U12)
- Homepage button (U10), E2E coverage (U11), docs (U12). The SPIKE is publicly visible.

The phasing exists so we can stop after Phase 1 if Anthropic integration cost or quality is unacceptable, and after Phase 2 if the wizard UX is rougher than expected. Phase 3 ships discoverability only after the rest is solid.

---

## Sources & References

- **Repo research summary** (in this session, gathered via `ce-repo-research-analyst`): canonical files, patterns, and constraints cited inline above.
- **Institutional learnings** (gathered via `ce-learnings-researcher`): local-storage quota fix, card normalization, mobile rules, no-tournament-language rule.
- **`claude-api` skill** in this environment — invoke when implementing U2 for current Anthropic SDK shape and prompt-caching.
- **Architecture rules:** `.claude/rules/architecture.md`, `.claude/rules/database.md`, `.claude/rules/mobile.md`, `.claude/rules/ui-components.md`, `.claude/rules/testing.md`.
- **Style guide:** `docs/STYLE_GUIDE.md`.
- **Existing deckbuilder route URL pattern:** `https://www.protectthepod.com/pool/EFEyNRnr/deck` (handoff target).
- **Patron gate exemplar:** [app/api/draft/route.ts:34](app/api/draft/route.ts#L34).
- **Pool-type constraint exemplar:** [migrations/028_add_casual_pool_types.sql](migrations/028_add_casual_pool_types.sql).
