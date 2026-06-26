---
date: 2026-06-24
topic: 17lands-style-replay-card-data
---

# 17Lands-Style Replay Card Data for SWUPOD and Wayfinder

## Problem Frame

SWUPOD has strong draft, pool, deck, and result data, and Wayfinder now provides the replay plugin source of truth. The missing product surface is the thing 17Lands makes immediately useful under Analytics -> Card Data: a dense set-level table, sortable into grades by descriptive card performance in actual games. This should become a shared card-metric capability, not a SWUPOD-only one: Wayfinder's own Card Data / Card Analytics surfaces should use the same metric semantics and source facts.

The requested version should assume the replay plugin exists, but the native Forceteki system does not. That means v1 should be replay-backed and Wayfinder-derived, not blocked on on-site play.

The user signal is specific: a friend values the 17Lands Card Data view because it grades every card in a set by Game-in-Hand win rate (GIH WR). SWU is less likely than Magic to be dominated only by bomb rares/mythics, so the surface should make high-performing commons and uncommons easy to find, not just confirm rare power. The grades are context-sensitive correlations, not causal proof of card strength; archetype strength, player skill, deck quality, and sample composition all affect the numbers.

## Research Findings

- 17Lands Card Data provides a set/format/date/cohort-filtered card table and a Grades view. Its table exposes card identity plus metrics like seen/picked averages, game counts, opening-hand win rate, drawn win rate, game-in-hand win rate, not-seen win rate, and improvement when drawn.
- 17Lands' Grades view groups cards from A+ to F based on the selected metric. Their visible methodology says grades assume a normal distribution centered at C, with each letter gradation representing 0.33 standard deviations from the center. Metric-affecting filters redistribute grades; hide-only filters do not.
- 17Lands publishes usage guidelines and discourages scraping unstable/private APIs. SWUPOD should treat 17Lands as product inspiration, not a data source.
- Wayfinder is not hypothetical here. `../wayfinder/packages/extension-shared/src/capture-shell.ts` buffers Socket.IO `gamestate` frames into `wsFrames`, attaches `wsExtracted`, and sends capture payloads to ingestion.
- `../wayfinder/packages/extension-shared/src/gamestate-cards.ts` attributes visible cards by owner from Karabast gamestate data, avoiding screen-position guessing.
- `../wayfinder/apps/web/src/server/card-replay-signals.ts` already derives replay signals: played WAR, turn-one WAR, starting-hand/Hand WAR, played-when-seen, resourced-when-seen, on-curve rate/WAR, and on-play/on-draw win rates.
- Wayfinder's current "Hand WAR" is opener-based, not exact 17Lands GIH. Exact GIH/GD/GNS-style metrics need a normalized per-game card-observation fact layer over the saved frames/messages, or the UI must label them more narrowly.
- `../wayfinder/apps/web/src/server/karabast-resource-stats.ts` proves the pattern for materializing derived facts from raw captures: resource-zone card identities are extracted incrementally into `karabast_resource_facts`.
- Wayfinder's current Card Analytics is decklist/match-result based. `../wayfinder/apps/web/src/server/compute-cards.ts` reads `decklists.cards` JSONB and correlates deck inclusion with match results; it does not produce replay-derived OH/GIH/GD/GNS card metrics.
- Wayfinder's current replay-derived card signals are narrow, request-time computations. `../wayfinder/apps/web/src/server/card-replay-signals.ts` computes one target card's signals by loading replay games, capture payloads, and deck blobs; `../wayfinder/apps/web/src/server/archetype-card-analytics.ts` computes archetype-scoped signals similarly. These are useful prototypes, but not the right scale model for an all-card, all-slice table.
- Wayfinder already avoids repeated raw-blob scans when analytics need to be reusable. Examples include `karabast_resource_facts`, `meta_snapshots`, precomputed `gamestate_frame_count`, and the `decklists.card_names` GIN helper for card lookup.
- Existing SWUPOD `/stats` work covers draft picks and deck inclusion, but not replay-derived card-in-hand performance.

## Terminology

- In this document, "Premier" means SWU constructed Premier, not 17Lands PremierDraft. "Limited" means SWU draft/sealed replay contexts.
- "Metric row" means a logically available card/context aggregate. It does not require every possible context to be physically precomputed; rollups, snapshots, atomic fact queries, and lazy caches may serve different slices.
- "Standard slice" means a slice intended for the dense all-card table. "Long-tail slice" means a high-cardinality context such as individual deck/build/player-private views.

## Metric Mapping

| 17Lands concept | Meaning for users | Wayfinder state today | SWUPOD requirement |
|---|---|---|---|
| GIH WR | Win rate when the card was in opener or drawn | Not materialized exactly | Primary target metric after extractor validation |
| OH WR | Win rate when card was in opening hand | Current starting-hand extraction exists | Include as a first-class column |
| GD WR | Win rate when card was drawn after opener | Not proven as a current aggregate | Add if frames/messages can distinguish draws reliably |
| GNS WR | Win rate when deck had card but it was not seen | Derivable only with deck completeness plus seen facts | Include only for complete/enough-confidence games |
| IIH / improvement | Delta between seen and not-seen performance | Not current table output | Derived from GIH/GNS once both are reliable |
| Played WAR | Value when card was played vs not played | Current Wayfinder signal exists | Include as secondary replay signal |
| Resourced When Seen | How often seen cards become resources | Current Wayfinder signal exists for known own resources | Include with hidden-info caveat |

## Requirements

**Product Surface**
- R1. Add a 17Lands-style Card Data surface reachable from SWUPOD stats/analytics. It must be additive: existing draft-pick, deck-inclusion, and personal stats views remain intact.
- R1a. The shared metric layer should support both products, but first production UI parity is not required. The default launch target remains the SWUPOD Card Data surface unless planning explicitly reorders it; Wayfinder should consume the same metric definitions and facts as its Card Analytics / Card Data UI adopts replay-derived columns.
- R1b. Wayfinder information architecture must be planned explicitly before its UI ships: where replay-derived Card Data lives relative to existing Card Analytics, card detail pages, archetype pages, and deck detail views; whether labels and URLs match SWUPOD; and which parts are shared semantics versus product-specific navigation.
- R2. The default experience is a dense, sortable all-cards table for one set and one limited format, with a Grades/Table toggle. This is an advanced analytics surface for serious Limited players; it should be discoverable from stats/analytics without taking over the core draft, pool, and deck-building experience.
- R3. The default sort/grade metric is replay-backed card performance in hand, aiming for GIH WR when validated. If exact GIH cannot be validated from the replay facts, v1 must launch as an honestly positioned Opening Hand / replay-signals table with different copy and success criteria, not as 17Lands-style GIH parity.
- R3a. GIH/GD/GNS are considered validated only after fixture cases and a manually audited replay sample cover opener, draw, resource, play, refresh, mirror-capture, and incomplete-capture scenarios for the supported Wayfinder plugin versions. The accepted extractor must show no unresolved systematic errors and at least 95% agreement on audited card-zone classifications; unsupported sources fall back to narrower metric labels.

**Replay Data Source**
- R4. v1 uses Wayfinder replay plugin captures and must not depend on the native Forceteki/on-site play system. Wayfinder derives canonical observation facts from eligible Wayfinder captures; SWUPOD views consume SWUPOD-linked facts and any broader Wayfinder aggregate slices only when they are explicitly visibility-approved.
- R5. The Card Data surface consumes a normalized per-game, per-player, per-card observation-facts contract before rendering aggregates. The preferred v1 boundary is a least-privilege Wayfinder-derived export or internal API of derived facts; SWUPOD should not require broad raw `karabast_captures` database access unless planning proves the derived boundary insufficient.
- R5a. At minimum, each eligible fact set needs source capture, game, player perspective, game result, format, set, date, player/deck context, card identity, deck-has-card confidence, opening-hand status, drawn/seen/in-hand status when known, played status, resourced status when known, and data-quality flags.
- R5b. Hand, draw, and resource fields are populated only for perspectives whose source exposes that zone. Opponent rows with hidden hand/resource data remain null for those fields. Mirror captures are reconciled by perspective before aggregation so denominators and numerators come from compatible eligibility sets.
- R5c. Each per-card metric declares its denominator source and confidence threshold. Deck-has-card, seen, opener, drawn, played, and resourced facts are independently nullable, and aggregate rows exclude games from metrics whose denominator is not proven for that perspective.
- R5d. Each exported fact must either carry a resolvable SWUPOD pool, practice match, deck, or build identity, or be marked Wayfinder-only. SWUPOD-specific slices exclude unlinked facts. The association contract must define accepted identifiers such as Wayfinder match/game/event IDs plus SWUPOD pool/deck/build IDs or content hashes.
- R6. Hidden information stays hidden. Opponent hand/resource identities are used only when the replay source actually reveals them with consent/visibility rules; otherwise they are excluded from hand/resource metrics rather than guessed.
- R7. Multiple captures of the same game, Bo3 continuation games, mirror captures, concessions, and very short/incomplete games must be deduped or excluded by explicit rules before they affect aggregates.
- R7a. Aggregate eligibility requires capture provenance validation: trusted Wayfinder-server facts or exports, linked match identity checks, schema validation, dedupe keys, and exclusion of untrusted or malformed captures.
- R7b. Any Wayfinder-to-SWUPOD fact feed requires concrete cross-service controls: machine-to-machine authentication, per-tenant authorization, signed or versioned exports, request/export audit logs, rate limits, credential rotation, and environment separation.

**Metrics and Columns**
- R8. The table includes card identity columns: name, aspects/color, rarity, type, cost, and image/hover preview.
- R9. The table includes sample/context columns: deck games, games in opening hand, games in hand/seen, games not seen, played count/rate, resourced count/rate, and any data-quality/sample warning.
- R10. The v1 table prioritizes core 17Lands-like performance columns: deck-game win rate, OH WR, GIH WR when validated, GD WR when validated, GNS WR when validated, and improvement-in-hand when GIH/GNS are validated.
- R10a. Existing Wayfinder replay signals such as Played WAR, Turn 1 WAR, Hand/Openers WAR, On-Curve Rate/WAR, and On Play/On Draw WR are secondary metrics. They may appear in card detail, optional columns, or later iterations, but they should not block the first useful Card Data table.
- R11. Metrics with too little sample display as unavailable or visually muted, not as misleading precise percentages. Planning should set minimum thresholds per metric.

**Grades and Filters**
- R12. Grades view groups cards into A+ through F bands using a 17Lands-like normal-distribution method centered at C. The selected metric controls the grading basis.
- R12a. Grades account for uncertainty before assigning bands. Low-sample, privacy-suppressed, or statistically indistinguishable cards should be ungraded, grouped, muted, or shrinkage-adjusted rather than forced into the full A+ through F distribution.
- R13. Filters that change metric values recompute grades. Examples: set, format, date range, player cohort, deck/pool context, leader/base/aspect context. Filters that only hide rows, such as rarity or card aspect, do not recompute the grade distribution. The UI must visibly distinguish recompute filters from hide-only filters and explain when grades are redistributed.
- R13a. Planning must specify filter interaction behavior before implementation: which filters are always visible, which live in overflow, whether changes apply immediately, where recompute/redistribution warnings appear, how users reset/share a view, and how zero-result or privacy-suppressed combinations recover.
- R14. Required first-table filters: set/card pool, format, date range or meta window, rarity, and card aspects/colors. Hide-only card type and cost filters may be included if cheap. Context-slicing filters such as archetype, deck aspects/colors, leader/base, player cohort, and pod-specific scope are gated expansion slices, not required in the first all-card table unless planning proves enough sample size and privacy safety. URLs preserve filter state for sharing.
- R15. The UI must make highest-performing commons/uncommons easy to inspect. A rarity filter and a "top non-rare" affordance are both acceptable; the core requirement is that rare-heavy sorting does not bury the user's Limited question.

**Trust, Privacy, and Interpretation**
- R16. Do not scrape or import 17Lands data. 17Lands is a design reference only.
- R17. Aggregate/public card data respects SWUPOD and Wayfinder privacy constraints, including team/private captures and minimum sample sizes. Minimum sample thresholds are enforced after every filter combination, not only on the unfiltered dataset.
- R17a. Planning must define an actor/visibility matrix for private, team, pod, and public views before any non-private aggregate ships.
- R17b. Replay data handling follows data minimization: raw payload access is limited, derived facts carry only fields needed for analytics, replay links and player/deck context are access-controlled, and logs redact raw replay/frame content.
- R17c. Source capture deletion, privacy changes, team membership changes, and user opt-outs must propagate to observation facts, rollups, snapshots, caches, and exports within a defined SLA. The serving model needs tombstone or recompute behavior and auditability for revocation.
- R17d. Privacy release rules must go beyond raw sample thresholds. Public/team/pod views need minimum distinct players/decks/games, suppression consistency across related filters, date-window coarsening where needed, optional rounding/noise for public views, and explicit protection against adjacent-filter differencing that isolates private participants.
- R17e. Individual deck/build labels are private by default. User names, exact dates, deck identities, and testing patterns may be shown only to owner-approved audiences according to the actor/visibility matrix; broader views should anonymize or generalize those labels.
- R18. Every column with non-obvious semantics has a tooltip or compact definition, especially GIH, GNS, improvement-in-hand, WAR, and resource-derived metrics.
- R19. Grades and win-rate columns must be described as descriptive, context-sensitive aggregates. The UI should provide supporting context for archetype, player-skill, deck-quality, and sample bias rather than implying a causal pick-order truth.
- R20. Card detail drilldowns, when shipped, should explain why a card is graded highly or poorly by showing metric breakdowns by leader/base/aspect context and trend over time, without requiring the user to inspect raw replays. The entry and exit flow must preserve the user's table/filter state.
- R20a. The first table must include at least one context-awareness affordance even if full drilldowns are deferred: for example a clear "global discovery metric" label, visible context/sample warnings, or lightweight leader/base/aspect breakdown indicators for top-ranked cards.

**States and Access**
- R21. The surface has explicit states for loading, no replay data, filters with zero matching rows, privacy/sample suppression, extractor-unvalidated metrics, partial metric availability, and ingestion/backfill errors.
- R21a. Planning must define a state matrix covering trigger, affected surface, copy intent, available actions, disabled controls, and whether the state applies to a cell, row, table, or whole page.
- R22. Desktop table quality is primary, but the surface still needs a mobile/tablet fallback, keyboard-accessible sorting and filtering, non-hover access to card previews and metric definitions, screen-reader labels for metric abbreviations, and usable touch targets.
- R22a. Mobile/tablet behavior should preserve card identity and core metrics first. Secondary metrics can move behind row detail or column selection, filters can collapse into a sheet, and card previews/metric definitions must be tap-accessible.

**Shared Consumers and Slicing**
- R23. The derived card metrics must power both SWUPOD analytics and Wayfinder Card Data / Card Analytics at the definition and fact-contract layer. Metric definitions, denominator rules, validation status, and privacy thresholds must be shared rather than reimplemented differently in each product surface.
- R24. Every eligible card should have logically available metric rows segregated by format and context. At minimum, the product must distinguish Premier-style constructed replay metrics from Limited replay metrics, so "Premier GIH WR" and "Limited GIH WR" are separate values rather than one blended number.
- R25. Standard first-table slices must include set/card pool, format, date range or meta window, and global scope. Archetype slices should support questions like "GIH WR for Cad Blue 30 Limited" as a gated expansion slice when sample size and privacy rules allow; planning should decide whether that is a required v1 UI filter, backend-only rollup, or post-v1/detail capability.
- R26. Individual deck/build slices are desirable and should be supported as a later or detail-level capability when there is a stable deck/build identity and enough games. The product should be able to label a private/approved comparison as specifically as "GIH WR for Lee's 2026-07-16 Cad Blue 30 Sealed build" without confusing it with the broader Cad Blue 30 archetype.
- R27. Deck/build-specific slices should preserve exact context: decklist/build identity, owner or cohort visibility, format, date window, card pool, and whether the build is a single submitted deck, a content-hash-equivalent build, or a broader archetype bucket.

**Computation and Scale**
- R28. Raw game and deck blobs are source-of-truth/provenance, not the serving model for broad Card Data tables. Public/default all-card views must not parse `karabast_captures.payload`, `wsFrames`, or deck JSON blobs on every request.
- R29. Planning should introduce an incremental observation-fact extraction path, similar in spirit to Wayfinder's `karabast_resource_facts` job: parse new captures once, derive game-side-card facts, upsert idempotently, and checkpoint progress.
- R29a. Incremental extraction must handle late-arriving dependencies. Partial captures should become pending/ineligible facts or retry work, and dependency changes to game links, results, decklists, privacy, or card identity must invalidate affected facts and rollups. Checkpoints cannot permanently skip captures whose required attribution was missing on first pass.
- R30. Planning should introduce rollups or snapshots for standard card-table slices: card x format x set/card pool x meta/date window x global context, plus access scope or pre-authorized fact subset. These are the serving layer for dense all-card tables and public/team dashboards, and must re-evaluate post-filter sample thresholds per visibility scope.
- R31. High-cardinality slices, especially individual deck/build/player-private views, may be computed from atomic facts on demand or lazily cached. The system should not precompute every deck x card x metric combination globally unless usage proves it is necessary.
- R32. Initial backfill is expected to be a heavy offline job with progress, retry, and validation reporting. Incremental updates should be bounded enough to run with the existing analytics job family, because each new eligible game produces a finite set of per-side card facts rather than requiring full historical rescans.

## Delivery Tiers

- **Prototype validation.** Build or backfill the thinnest current-set snapshot that can show the dense all-card table for one Limited context, with honest OH/GIH labeling. Test it with multiple SWU Limited players before committing to the full production backfill and rollup surface.
- **First production table.** Ship the SWUPOD Card Data surface with standard set/card-pool, format, date/meta, global slices; validated metric labels; minimum privacy/sample protections; no raw-blob request-time serving; and the state/filter/mobile basics required for trust.
- **Shared Wayfinder adoption.** Wayfinder consumes the same canonical fact contract and metric definitions, but its UI integration can land after or alongside the first SWUPOD table depending on planning capacity. Shared semantics are required; identical day-one UI parity is not.
- **Gated context expansion.** Add archetype/leader/base/aspect slices only after sample-size, privacy, and anti-differencing gates pass. Individual deck/build views are later/detail-level and private or owner-approved by default.

## Success Criteria

- A Limited player can open the Card Data view for the current set, sort by the default grade/GIH-style metric, and quickly identify the highest-performing cards in the selected replay context, including high-performing uncommons.
- The table feels comparable in utility to 17Lands Card Data while using SWUPOD/Wayfinder-owned data and SWU-specific context.
- Wayfinder's own Card Data / Card Analytics and SWUPOD's analytics tell the same story for the same filter context, because they consume the same metric definitions and derived facts.
- The UI never overclaims. If the current replay-derived fact is opener-only, it is labeled opener-only; if exact GIH is available, the supporting extractor and sample counts make that credible.
- A thin prototype/static snapshot is validated with enough SWU Limited players to justify moving from product proof to production backfill/rollups.
- Existing `/stats` functionality is not regressed or reoriented around the new table.
- A current-set prototype shown to a small group of Limited players is useful enough that they would use it to inform pick/deck decisions or card evaluations.
- A planner can move directly to implementation planning without inventing product scope, metric semantics, or source-of-truth assumptions.

## Scope Boundaries

- Native Forceteki/on-site play is out of scope for v1. This work assumes the replay plugin exists and is the source of gameplay facts.
- 17Lands data/API usage is out of scope. No scraping, mirroring, or depending on 17Lands endpoints.
- Bot/opponent hidden-hand inference is out of scope. Unknown hidden information remains unknown.
- Full replay viewing is out of scope. Store links or drilldowns only as needed to explain aggregate metrics.
- Predictive draft pick recommendations are out of scope. This is an analytics surface, not an autopicker.
- Paid packaging is out of scope for this brainstorm; privacy and sample-size safety still apply.

## Key Decisions

- **Replay-backed first, not Forceteki-blocked.** The user's constraint makes Wayfinder captures the v1 path.
- **Metric honesty over label mimicry.** "GIH WR" is valuable, but the label only ships when the underlying fact really means opener-or-drawn. Wayfinder's current opener-based Hand WAR should not be renamed into GIH.
- **Use 17Lands' shape, not its data.** The table, filters, grade view, and methodology are the inspiration; SWUPOD uses its own captures and SWU-specific interpretation.
- **Use a derived fact contract before analytics.** A normalized observation-facts contract mirrors Wayfinder's resource-facts pipeline and prevents every table/API request from reparsing raw capture JSON. The preferred boundary is least-privilege derived data from Wayfinder rather than broad raw capture access from SWUPOD.
- **Shared metric layer, one launch surface first.** The metric layer is not just a SWUPOD reporting feature; it should also upgrade Wayfinder's card data from decklist-inclusion analytics to replay-derived gameplay analytics. But first-launch UI parity is not required: shared facts and definitions come first, with SWUPOD as the default initial Card Data surface.
- **Precompute common slices, query long-tail slices from facts.** Default all-card tables and standard format/meta/global slices deserve rollups or snapshots. Archetype slices are gated expansion, and individual deck/build slices are too high-cardinality to eagerly materialize everywhere in v1.
- **Keep deck/pick stats adjacent.** SWUPOD's existing draft/deck data remains useful context, but replay card performance is a distinct layer.

## Dependencies / Assumptions

- Wayfinder replay capture data is available to SWUPOD via a least-privilege derived-fact boundary: preferably a Wayfinder export/snapshot or internal API. Shared raw database access is a fallback only if derived facts cannot support the extractor, and would require explicit auth, authorization, audit logging, credential rotation, and failure-mode design.
- Card identity normalization between SWUPOD card data, Wayfinder/Karabast capture IDs, and SWU API slugs is required before aggregates are trustworthy.
- A SWUPOD-Wayfinder association contract is required. Facts need accepted join identifiers for replay events/games/matches plus SWUPOD pool, practice, deck, or build identities; unlinked Wayfinder-only facts cannot enter SWUPOD-specific slices.
- A stable deck/build identity is required for individual build slices. Wayfinder has decklist UUIDs, deck IDs, and `content_hash`; SWUPOD sealed/pool builds need an equivalent identity before build-specific GIH-style metrics can be trusted.
- Analytics job capacity is required for backfill and ongoing rollups. The existing Wayfinder analytics task family is a good precedent, but planning must size the backfill, checkpointing, and failure recovery explicitly.
- Exact GIH/GD extraction needs a spike against real captured `wsFrames` to confirm whether draw/ever-in-hand can be inferred reliably for the captured player across current plugin versions and to satisfy R3a.
- Privacy semantics must be aligned between Wayfinder capture visibility and SWUPOD aggregate display before any public/team-wide table ships.
- A migration/backfill path from existing Wayfinder captures is expected; current-set value depends on being able to backfill, not only collect future games.

## Outstanding Questions

### Resolve Before Planning

- *(none)*

### Deferred to Planning

- [Affects R5][Technical] Is the derived-fact boundary best implemented as a Wayfinder export/snapshot, internal API, or SWUPOD-owned materialized copy fed by Wayfinder?
- [Affects R5d][Technical] Which concrete identifiers form the canonical SWUPOD-Wayfinder join: `wayfinder_match_id`, Wayfinder game ID, replay event ID, decklist UUID/content hash, SWUPOD pool ID, or a mapping table?
- [Affects R3, R3a, R10][Needs research] Can current `wsFrames` satisfy the GIH/GD/GNS validation bar, or does v1 ship as an OH/replay-signals table first?
- [Affects R11, R12][Technical] What exact minimum sample thresholds, shrinkage/confidence treatment, and grade-distribution rules best avoid noisy early-set overreactions?
- [Affects R14, R25][User decision] Which context filters move into the first post-table expansion after the sample-size check: archetype, player cohort, deck aspects, leader/base, tournament/practice only, or pod-specific?
- [Affects R23][Technical] Does Wayfinder own the canonical observation facts and expose them to SWUPOD, or do both products consume a shared export/snapshot generated from Wayfinder?
- [Affects R25, R26, R27][Technical] What is the exact deck/build identity for SWUPOD Limited and sealed builds, and how does it map to Wayfinder decklist UUIDs, deck IDs, and content hashes?
- [Affects R29, R30, R32][Technical] What rollup grain and freshness target are required for the default tables: near-real-time incremental rollups, daily snapshots, weekly meta windows, or some combination?
- [Affects R29a, R17c][Technical] Which dependency changes invalidate observation facts and rollups: result updates, decklist promotion, card identity remaps, visibility changes, capture deletion, user opt-out, or all of them?
- [Affects R17, R17a][Technical] What actor/visibility matrix and post-filter aggregation thresholds are required before card metrics can be shown outside a user's private view?
- [Affects R17c, R17d][Technical] What deletion, opt-out, visibility-change SLA, distinct-player/deck/game thresholds, and anti-differencing rules apply to public, team, pod, and private views?
- [Affects R20][Design] Should the card detail experience be a dedicated route, row expansion, side panel, or modal?

## Next Steps

-> `/ce:plan` for structured implementation planning.
