# Import Pool

The Import Pool feature lets a Friend of the Pod upload up to 2 photos of a competitive sealed registration sheet. Claude vision extracts the structured pool + deck, the user resolves any errors in a wizard, and the resulting pool is created via the existing sealed deckbuilder pipeline.

This document captures the integration shape, calibration thresholds, and known failure modes for the SPIKE shipped 2026-05-05.

## Architecture

```
Homepage button → /import-pool wizard
   ├── Step 1: Upload (up to 2 images, client-side downsample)
   ├── Step 2: Resolve (aspect-grouped, +/- qty, card picker)
   └── Step 3: Confirm (auto-composed title, summary)
        └── POST /api/import-pool/create → /pool/[shareId]/deck
```

### Server routes

| Route | Purpose | Auth |
| --- | --- | --- |
| `POST /api/import-pool/extract` | Vision OCR + server-side card matching | DB-backed `is_patron` (NOT JWT) |
| `POST /api/import-pool/create` | Trust-boundary creation: re-runs `buildPool`, INSERTs `pool_type='imported'` | DB-backed `is_patron` (NOT JWT) |

### Services (`src/services/importPool/`)

- `cardMatcher.ts` — pure, server-only. `Name|Type|Subtitle` canonical key + Levenshtein-2 fuzzy fallback. Always resolves to Normal variant.
- `buildPool.ts` — pure, server-only. Produces `{ cards, deckBuilderState }` for the `card_pools` row. Places leaders/bases in `'leaders-bases'` section (the silent-drop seam in `DeckBuilder.tsx:915` is regression-tested).
- `imagePrep.ts` — browser-only. Downsamples uploads to ≤2048px and outputs JPEG quality 0.85.

### Wizard (`src/components/ImportPool/`)

- `ImportPoolWizard.tsx` — orchestrator
- `UploadStep.tsx`, `ResolveStep.tsx`, `ConfirmStep.tsx`
- `CardPickerModal.tsx` — search/select for unmatched/wrong-match rows
- `useImportPool` hook (`src/hooks/useImportPool.ts`) — `useReducer` over a discriminated-union state machine

## Operational requirements

- **Env var**: `ANTHROPIC_API_KEY` must be set in Railway (production + staging) before this ships. The wrapper in `lib/anthropic.ts` throws if it's missing.
- **Dependency**: `@anthropic-ai/sdk` (added in `package.json`).
- **Migration**: `migrations/059_add_imported_pool_type.sql` adds `'imported'` to the `card_pools_pool_type_check` constraint. Idempotent.

## Security boundary (load-bearing — don't relax without re-reviewing)

- `is_patron` is NOT in the JWT. Both server routes call `queryRow('SELECT is_patron FROM users WHERE id = $1', ...)`. If you ever introduce a `requirePatron` helper that reads from session, the gate disappears silently.
- The wizard never POSTs to `/api/pools` directly. That route allows anonymous submissions; only `/api/import-pool/create` enforces the patron gate at creation time.
- The extract route validates Claude's response against a strict JSON schema with numeric bounds (`poolQty`/`deckQty` 0-6, `type` enum) before calling the matcher. This is the prompt-injection mitigation surface.
- The create route re-resolves every `cardId` against the in-set DB before INSERT. A forged `cardId` that's not in `getCachedCards(setCode)` is rejected with `UNKNOWN_CARD`.
- Server-side body size limit (in route handler) caps payload at ~10MB total.

## Calibration thresholds (revisit during regular use)

- **Vision model**: `claude-opus-4-7`. Vision quality matters more than cost for OCR; revisit if Sonnet 4.6 proves adequate on real fixture photos.
- **Image downsampling**: 2048px max edge, JPEG quality 0.85. Mobile photos (5-10MB) drop to ~500KB after downsampling.
- **Fuzzy match**: Levenshtein distance ≤ 2 on lowercased card name, scoped to set, tie-broken by type.
- **Server timeout**: 60s on the extract route. Single retry on transient errors (handled by SDK).
- **Prompt-cache**: `lib/anthropic.ts` puts the system prompt + extraction schema in a `cache_control: { type: 'ephemeral' }` block. Subsequent extractions during a 5-minute window get cached reads on the system portion.

## Known failure modes

- **Smudged or angled photos**: Some card names extract as `?` placeholders. The Resolve step's picker handles these; the user picks from the in-set card list.
- **Ambiguous same-name cards**: `Name|Type` match without subtitle returns `confidence='ambiguous'` with a candidates list. The Resolve UI surfaces a chip ("N candidates") and the picker is pre-filtered.
- **Set detection failure**: If Claude can't read the set name from the header, the route returns 422 with `code: 'SET_DETECTION_FAILED'` and `setCandidates`. Manual override via `manualSetCode` is supported by the API; UI for this is deferred to a follow-up.
- **Pool count != 96**: The Resolve step shows a running total; "Continue" is disabled until valid. Server `buildPool` re-validates and returns 422 `POOL_SIZE` on mismatch.

## Testing

- Unit (Node test runner):
  - `src/services/importPool/cardMatcher.test.ts`
  - `src/services/importPool/buildPool.test.ts`
  - `app/api/import-pool/extract/route.test.ts`
  - `app/api/import-pool/create/route.test.ts`
- E2E (Playwright): `tests/e2e/import-pool.spec.ts` — smoke (auth gating + nav). Full happy-path with synthetic fixture + Anthropic mock is deferred.

Test fixtures with real player data must NEVER be committed. `tests/fixtures/import-pool/` is gitignored. Use synthetic mockups only.

## Deferred (post-SPIKE)

- Manual set picker UI when auto-detection fails
- Re-upload preserves manual edits (current: re-upload = re-run CV, edits discarded)
- Imported-pools section in `/history` (currently land in the "Sealed" tab — acceptable v1)
- Multi-sheet imports (e.g. four-sheet sealed if introduced)
- Per-user daily extraction caps for cost protection
- Privacy-policy update for third-party LLM processing of identifiable data (currently disclosed inline in the Upload step)

## Plan

`docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md` — the full plan (13 implementation units U1–U13, deepened with security + architecture review findings).
