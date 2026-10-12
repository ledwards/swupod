---
paths:
  - "public/play-home/**"
  - "src/components/PlayHomepage/**"
  - "src/components/SharedPlay/**"
  - "src/components/SiteTheme/**"
  - "src/services/play/**"
  - "src/presentation/purrgil/**"
  - "app/api/lobby/**"
  - "app/api/play/**"
  - "scripts/sync-play-home.mjs"
  - "scripts/sync-shared-play.mjs"
  - "scripts/presentation/**"
---

# Purrgil boundary (decided 2026-10-12)

Purrgil runs games. Protect the Pod is the website. Full plan:
`plans/2026-10-12-purrgil-website-to-ptp.md`.

## Who owns what

- **Purrgil** (`../purrgil`, services `baize-pvp` + `purrgil`): the engine host, the AI,
  the game table, the gateway that seats players, table cosmetics, and every game's
  record, replay and recording. Records are Purrgil's data; PTP reads them through a
  service API and keeps no copy.
- **PTP**: identity, decks and pools, lobby and matchmaking, match results, ratings
  (Elo, shown on `/me`), history, stats, watch list, deck import, release notes,
  settings, the themes catalog page, and every page a player browses.
- **The front door is `protectthepod.com`.** `play.protectthepod.com` is only the
  table's address until PTP serves the table through www, then it retires.

## Freeze

The Purrgil website embedded in PTP is frozen while it moves here:

- **No new features** in `public/play-home/` (the vendored `homepage.js`),
  `src/components/PlayHomepage/`, `src/components/SharedPlay/` or the `/api/lobby`
  relay. Bug fixes only.
- **Don't run `sync-play-home` / `sync-shared-play` to land new website features.**
  Re-syncing a bug fix is fine; say so in the commit.
- **New website work is built in PTP**, with PTP components, behind
  `viewerHasAlphaAccess()`. It replaces a `<PlayHomepage path=…>` route; it never adds a
  third copy of a page PTP and Purrgil both already have.
- **Never add engine records or replays to Postgres.** They belong to Purrgil.
