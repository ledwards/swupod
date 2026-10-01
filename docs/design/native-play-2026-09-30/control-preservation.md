# Table options and workshop studies

These additions are standalone review artifacts. Production React components, rules, draft networking, saved decks, and exports are unchanged.

## Implemented in the study

Seven environment choices include the original command table and six requested Star Wars-inspired environments. Shared browser-local preferences retain environment and full/cinematic presentation across `real-board.html` and `workshop.html`. Gameplay independently offers central or player-area leader/base placement. Draw/discard piles are adjacent in player shelves; discard inspection uses actual card faces.

The draft fixture supports selection, deselection, confirmation, a picked-card tray, search/filter/sort/density, views, and inspection. Its sample pack is refilled when exhausted; it does not simulate genuine passing, timers, or other players.

The builder fixture uses 42 sample copies of 14 actual catalog cards, two leader choices, and two base choices. It supports pool/deck/sideboard movement, filters, views, density, aspect penalties, bulk operations, a cost curve, inspection, and a local study-format JSON download. The Play control opens the fixed gameplay scene, not a match with the selected deck. Reload resets the sample pool. Only presentation preferences persist.

## Existing control preservation for production

| Existing control family | Study coverage | Production requirement |
|---|---|---|
| SortControls: default, aspect, cost, type | Functional sorting/grouping | Preserve established ordering and defaults |
| ViewModeToggle: arena, grid/playmat, table/list | Three functional views | Preserve full table columns and arena interactions |
| CardDensity and aspect-penalty toggles | Functional | Preserve existing persisted settings and cost computation |
| Filters and leader/base selectors | Search, aspect/type, 2 leaders and 2 bases | Preserve all filters, available choices, and selection rules |
| Pool, deck, sideboard movement | Per-copy buttons | Retain production drag/drop, touch, keyboard, and shortcuts |
| ArenaActionsBar | Add all, on-aspect, remove off-aspect, return deck | Retain swap and all existing bulk operations with undo/confirmation behavior |
| Cost curve and deck statistics | Sample curve and unit/event/off-aspect counts | Retain complete statistics and deck validation |
| Header exports, statistics, share, clone, play | Study JSON and link to scripted board only | Preserve all existing utility functions; prioritize native Play |
| Draft pack grouping and density | Functional | Preserve genuine pack order, pick state, and timing |
| Draft confirmation, review, fullscreen | Confirm/deselect and local picked-card tray | Preserve full review, fullscreen, live pod state, reconnect, and accessible focus |

Inspected existing `src/components/DeckBuilder/README.md`, SortControls, ViewModeToggle, CardDensity, AspectPenaltyToggle, ArenaActionsBar, and PackDraftPhase. This is a retention checklist, not a claim that these components have been migrated.

## Asset provenance and delivery

`assets/table-{dejarik,imperial,cantina,cloud-city,rebel,hoth}.png` are generated empty environmental surfaces, with prompts in `table-theme-prompts.json`. Actual printed card images and card backs remain sourced from PTP's catalog, as documented in `real-board-notes.md`. The surfaces are static assets; all cards, controls, text, and interactions are live DOM/CSS/JavaScript. Production should compress/resize environment assets and load only the selected theme. These source PNGs are review-quality assets, not a mobile performance benchmark.

## Validation

Run `node docs/design/native-play-2026-09-30/verify-real-board.mjs` and `node docs/design/native-play-2026-09-30/verify-table-options.mjs` with the local preview server running. Chromium and Firefox cover the base gameplay interactions, options, persistence across pages, discard inspection, draft pick, builder movement/bulk actions, views, inspection, image loading, and responsive overflow. Safari/iOS device validation remains outstanding.
