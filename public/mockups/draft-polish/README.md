# Draft interaction polish comparison

Open `/mockups/draft-polish/index.html` on the development server.

Screenshots use mocked API data, not a real draft. Before and after captures use the same viewport and interactions. The deck-loading tab is an unchanged audit, not a before/after claim.

Regenerate after captures: `CAPTURE_DRAFT_POLISH=after npx playwright test --config playwright.draft-polish.config.ts -g "capture draft polish comparison"`.

Run geometry/interaction checks: `npx playwright test --config playwright.draft-polish.config.ts`.

These integration fixtures exercise the shared native-limited-play working tree, including its draft-theme and solo-flow work. This commit does not package or release that larger feature.

The solo pending-action skeleton change shown in the comparison remains in the shared, untracked `app/play/solo/SoloPlay.tsx`; it must accompany the game-flow task's commit. Deck skeleton counts were audited, not changed in this pass. Table-sizing studies are excluded.
