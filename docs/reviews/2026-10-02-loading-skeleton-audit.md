# Loading skeleton audit — October 2, 2026

Scope: skeleton render branches in `app/` and `src/components/`, compared with the adjacent loaded JSX and responsive CSS. Work is in the beta-entry-flow worktree. This is a source/layout audit of the site, with browser geometry and screenshot verification concentrated on the new entry flow. It is not a claim that every live-data variation was exercised.

## Corrected mismatches

| Surface | Drift | Correction |
| --- | --- | --- |
| Entry route authentication and Suspense | Home's three tall tiles appeared on every route | Explicit Home, Draft, Sealed, Play and AI layouts, routed through both boundaries |
| Entry Home | Missing logo/banner; obsolete title block | Real header shell, announcement slot, tile art/title geometry, discovery columns |
| Entry Play | Three tiles instead of library and action sidebar | Search/filter controls, compact deck rows, action sidebar |
| Entry AI | Three tiles instead of player/opponent panels | Real headings and columns, deck rows, search, controls; opponent preparation also uses a deck row |
| Entry setup | Pack grid and set name collapsed until fetched | Reserve the chosen pack count and heading slot |
| Import | Resolving-table skeleton shown before upload | Header, steps and upload-area geometry |
| History | Missing Shared tab | Same three tabs as loaded view |
| Lobby listings | Blank strips omitted avatar, metadata and action | Shared listing-row skeleton using actual row classes |
| Pool history dashboard | Missing header and 26px strips for art-backed deck rows | Header, toolbar and pool/deck row hierarchy |
| Gameplay dashboard | Missing companion banner; blank 240px block | Shared banner, KPI labels and win-rate panel structure |
| Luck dashboard | Three 18px lines for a histogram, widgets and aspect panel | Shared chart/widget/aspect layout |
| Deck statistics | All four tabs used the same three lines | Pool, game-log, gameplay and matchup-specific layouts |
| Public Sealed stats | Draft chart headings in loading state | Format-specific chart headings |
| Legacy queue | Two blank blocks | Header, availability band, matches/queue/library sections |
| Runtime stub | One block for two seats | Two seat panels |
| Replay ledger | One block for an event list | Event rows with type/date/payload slots |
| Draft/Sealed pod pages | Generic blocks omitted player-list structure | Shared pod shell, status/player rows and opponent panel |

## Reviewed without a structural change

- Deck builder: existing arena/card/list placeholders follow the selected view; leader/base counts are derived from known state.
- Leader and pack draft transitions: placeholders use the card slots and expected next-pack counts.
- MatchDeckPane: leader/base row and card grid use loaded layout containers.
- Draft log: header, tabs, pick labels and pack-card rows follow the log structure.
- Card tier list: grade rows and card cells use loaded classes.
- Activity counters: loading and loaded branches iterate the same counter definitions.
- Meta/Draft analytics: metric bars and card rows remain within the corresponding panel shells.
- QA tables: filter/header and table-row placeholders follow the corresponding diagnostics tables.
- Solo play: leader/base images, deck title and action placeholders occupy their loaded regions.
- Account drawer: icon/text placeholders use the drawer-item layout.

Unknown data is not fabricated: exact list length, conditional sections, and name wrapping can still change after a response. Static UI stays visible; controls that depend on unloaded data are disabled. No eligibility, auth, generation, or game rules were changed by this audit.

## Verification

- TypeScript check.
- Entry browser suite, including held responses during authentication and AI fetches.
- Desktop (1440px) and mobile (390px) comparisons of loaded versus loading title, header and content-column positions; overflow checks.
- Loading and loaded screenshots under `artifacts/ai-{loading,loaded}-{1440,390}.png`.
- Existing YourStats tests (89 assertions/tests).
