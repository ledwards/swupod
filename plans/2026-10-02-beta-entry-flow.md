# Beta entry flow implementation

Approved October 1 mockups in main checkout `docs/design/entry-flow-2026-10-01` and subsequent conversation are the visual/copy authority. New flow only for beta/admin accounts; anonymous/non-beta keep existing landing/setup. Native APIs already enforce fresh beta status.

Worktree inherits native-limited-play 397054e2 plus its current uncommitted implementation (snapshot in /tmp/entry-inherited.patch). Do not include unrelated inherited changes in this task's commit. No deployment requested.

- [x] Beta-gated homepage and setup using existing buttons, modal set picker, pack art, footer, auth menu.
- [x] Real resume/pod/lobby/deck data; latest-set commons, packs, popular/starter leaders.
- [x] Saved-deck play and edit controls, preserving competitive event locks.
- [x] AI opponent preparation/selection, owned same-format saved decks, single practice game; preserve legacy events.
- [x] Access, transition, service and browser verification; desktop/mobile visual review.


## Verification

- TypeScript: `npx tsc --noEmit --pretty false` passed.
- Focused native/solo/entry tests: 39 passed, 1 existing PostgreSQL integration suite skipped (its database fixture flag was not enabled).
- `npx playwright test --config playwright.entry.config.ts`: 4 passed, covering beta home, non-beta fallback, mobile set/pack/visibility selection, and public-admission retry identity.
- Live development API checks: beta accepted; non-beta denied; generated sealed, actual draft bot, and owned saved-deck opponents prepared successfully. Repeated preparation returned the identical opponent, rejected reuse for another selection, and created two participants.
- Live browser checks with development accounts: beta, non-beta, and signed-out entry; graphical modal; 3/6/8 pack summaries; saved-deck selection; durable opponent preview reload; actual Purrgil launch and connection.
- Desktop/mobile screenshots in ignored `artifacts/entry-*.png`.
- Final review fixed stale competitive resumes, event links, special-base deck sizes, hidden decks, public matching retry handoff, and errors disappearing during AI status polling.

## Local preview and integration boundary

Preview: http://localhost:3018. An isolated Purrgil preview runs on port 4399 against the already-running Baize engine; the other local development app/gateway were not changed. Local-only configuration is in ignored `.env.local` and `artifacts/entry-gateway.ts`.

The existing native-play and local-AI environment gates remain in place. This task does not deploy or enable the AI runtime in production. Existing solo event URLs remain functional; new beta deck-builder handoffs use `/limited/ai` and create one practice game. Non-beta handoffs retain their existing destinations.

Inherited working changes are deliberately retained in this isolated worktree. Task-specific changes are `app/page.tsx`, `app/api/entry/`, `app/limited/`, `src/components/EntryFlow/`, `src/services/entry/`, native deck edit-lock metadata, solo preparation/single-game additions, the deck-builder play handoff, and the entry tests/config. Do not attribute the rest of the inherited worktree diff to this implementation.

## Rollout validation

When this branch is deployed, compare beta and non-beta home visits and limited-flow creation success. Watch `/api/entry`, `/api/entry/ai`, native admission failures, and `runtime_unavailable`/`engine_revision_mismatch` errors. Confirm source pool, selected deck, and opponent stay unchanged across retry. Roll back the entry routing if non-beta traffic sees the new flow or beta creation starts failing. Runtime enablement remains a separate launch decision.

## AI launch recovery (October 2)
The preview gateway port 4398 was occupied by an unrelated Python static-art server, causing gateway launch POSTs to fail while Baize remained healthy. Moved the isolated preview gateway and local app configuration to 4399; left the art server untouched. Retried the reported saved run through `launchSoloGame`: engine creation/resume and gateway launch issuance succeeded. AI failures now render beside the opponent launch controls with token-based danger border, shared retry button, and explicit retry action. Desktop/mobile error-and-retry browser checks pass; TypeScript passes.
