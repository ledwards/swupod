# PTP website source

PTP owns these pages and builds them here. `home/` contains the homepage, Play setup, decks/history and website controls; `components/` contains the website shell and account/statistics views. Tests live in `tests/play-home/`.

The game table and replay remain in Purrgil. Shared card presentation and table preferences are an explicit generated dependency snapshot at `vendor/purrgil-ui/`, exported by Purrgil's `scripts/export-host-ui.mjs`. Do not edit that snapshot or copy website pages back into Purrgil.

- Refresh dependencies and generated site assets: `node scripts/sync-play-home.mjs /path/to/purrgil`
- Type-check and build the owned source: `npm run build:play-home`
- Browser regression tests: `npx playwright test --config tests/play-home/playwright.config.ts`
- Unit tests: `TSX_TSCONFIG_PATH=tsconfig.play-home.json node --import tsx --test tests/play-home/*.test.ts scripts/ptp-css-scope.test.mjs`

Website paths are PTP paths (`/play`, `/decks`, `/history`, `/me`, `/watch`). `/api/lobby` remains the authenticated game-service API contract; it is not a second website.
