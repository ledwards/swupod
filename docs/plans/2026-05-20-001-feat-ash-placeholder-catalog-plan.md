# ASH Spoiler Placeholder Catalog

## Summary

Keep cards as a generated JSON catalog, not a canonical card DB. SWUAPI remains the ingestion source during sync; the DB continues to store user artifacts like pools, drafts, and deck state. The architecture makes sense if we add stable IDs, placeholder metadata, and read-time resolution.

Goal: beta/Patreon users can draft, open packs, and build with ASH as soon as SWUAPI has at least one real ASH card. Missing ASH cards appear as playable, clearly marked placeholders, then automatically resolve when real card data arrives.

Update from the follow-up brainstorm: ASH placeholders are bucket inventory slots, not guessed collector-number cards. The current requirements source is `docs/brainstorms/2026-05-20-ash-bucket-placeholder-requirements.md`.

External facts used: the official ASH page lists Ashes of the Empire as set 8, releasing July 17, 2026, with over 260 cards and 16-card boosters with 9 commons, 3 uncommons, 1 rare/legendary, 1 leader, 1 base/token, and 1 hyperspace-foil card. SWUAPI documents bulk export/sync as the public card data source.

## Key Decisions

- Use existing beta access: `is_beta_tester || is_admin`. Patreon subscribers already enroll through beta, so no new ASH-specific Patreon gate.
- Show ASH only when both are true: user has beta access, and the synced catalog contains at least one real ASH card.
- Generate ASH placeholders into `src/data/cards.json` during card sync/post-processing; keep `src/data/cards.raw.json` as real SWUAPI data.
- Use synthetic bucket-slot IDs for unresolved placeholders, for example `ash-slot:normal:main:rare:vigilance:001`. Do not assign collector numbers until real cards exist.
- Generate placeholders for the pack-needed bucket treatments: Normal, Hyperspace, and Hyperspace Foil. Do not invent showcase/prestige-only cards until real data exists.

## Implementation Changes

- Add an ASH placeholder blueprint service that encodes inferred rarity/aspect bucket slots. Do not invent collector number, main-deck type, name, cost, stats, text, traits, or arenas beyond inferred fields.
- Merge real SWUAPI ASH cards into their matching bucket by rarity/aspect/group/variant. Real cards reduce the remaining placeholder count in that bucket.
- Add catalog metadata: `realCardCount`, `placeholderCardCount`, `spoiledNormalCount`, `placeholderVersion`, and ASH validation status.
- Finish ASH set plumbing in set registry/type/cache/sort paths so ASH is selectable, cached, and pack-sortable like prior sets.
- Keep ASH in the per-set config path and preserve the physical pack-generation model: no post-hoc pack rewriting. Placeholder pools must satisfy leader/base/common/uncommon/rare-legendary/hyperspace belts.
- Add a card resolver on read paths for saved pools, draft state, public draft logs, and deck-builder state. It replaces stored stale placeholder objects with current catalog records by ID while preserving instance fields like pack position, foil/hyperspace treatment, and draft metadata.
- Update card UI components to show placeholder cards as playable unknowns: visible rarity/aspect bucket when inferred, and a clear “Unknown ASH Rare Vigilance Slot 1” style label.
- Block external export/play integrations when a deck or pool contains placeholders, returning a clear validation message instead of emitting invalid SWUDB/play data.
- Document the daily spoiler process: run card sync, verify ASH real/placeholder counts, confirm pack generation, then deploy.

## Test Plan

- Placeholder catalog tests: ASH bucket blueprint generates required Normal/Hyperspace/Hyperspace Foil records and validates inferred metadata.
- Merge tests: real ASH cards reduce matching bucket placeholders; contradictions are surfaced when a bucket is overfull.
- Visibility tests: ASH hidden with zero real cards, visible to beta/admin after first real card, hidden from non-beta users before normal release behavior allows it.
- Pack tests: ASH sealed/draft packs always produce 16 cards with the official slot shape, even when most cards are placeholders.
- Resolver tests: saved placeholder pool/deck/draft data updates to real card data after catalog refresh with no DB migration.
- Export tests: placeholder-containing decks/pools cannot be exported to external formats and return a user-facing warning.
- Regression tests: existing sets continue using their current IDs and pack behavior unchanged.

## Assumptions

- ASH’s final normal card count and rarity distribution match recent main sets closely enough to encode a v0 bucket blueprint, then revise as spoilers reveal contradictions.
- Placeholder cards are allowed in SwuPod gameplay and deckbuilding, but not in external exports or play integrations.
- No canonical card database is added for this work. If future needs require card history, price data, or multi-source reconciliation, that should be a separate card-catalog service/database project.
