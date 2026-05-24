# Ashes of the Empire (ASH)

Ashes of the Empire is Set 8. It uses the Block B pack model until physical-product evidence says otherwise.

## Availability

- Prerelease: 2026-07-10
- Release: 2026-07-17
- Before prerelease, ASH is visible only to existing beta users and admins.
- ASH remains hidden until the card catalog contains at least one real, non-placeholder ASH card from SWUAPI.

## Spoiler Placeholder Catalog

During spoiler season, `npm run fetch-cards` writes real SWUAPI cards to `src/data/cards.raw.json`, then `scripts/postProcessCards.ts` merges placeholders into `src/data/cards.json`.

The placeholder catalog:

- Uses bucket-slot IDs such as `ash-slot:normal:main:rare:vigilance:001`.
- Does not assign collector numbers to unresolved placeholders.
- Infers pack-critical bucket metadata only: rarity, aspect bucket, treatment, and leader/base type when the slot proves it.
- Leaves unknown gameplay fields blank: cost, power, HP, text, traits, arenas, artist, images, and main-deck card type.
- Generates Normal, Hyperspace, and Hyperspace Foil placeholders for the pack-facing buckets.
- Starts from a SEC-like aspect distribution with 24 LAW-symmetric main-deck multicolor slots and 2 primary-primary leader slots.

Saved pools and drafts store card JSON in the DB, but API reads resolve stored card objects against the current catalog. When enough real cards arrive in a bucket, old higher-index placeholder slots deterministically hydrate to matching real cards without a DB migration.

## Daily Spoiler Sync

1. Run `npm run fetch-cards`.
2. Check the ASH summary in the post-process output: real count, placeholder count, and spoiled normal count.
3. Run `npm run test:data`, `npm run test:utils`, and the ASH placeholder service tests.
4. Confirm beta set selection shows ASH only after at least one real ASH card is present.
5. Deploy the generated `src/data/cards.json`.

## Pack Rules

ASH follows LAW-style Block B construction:

- 1 leader
- 1 base
- 9 commons
- Slot 5 is a guaranteed Hyperspace common
- 1 Hyperspace-foil slot
- 3 uncommons
- 1 rare or legendary
- Prestige can appear through the existing Set 7+ UC3 upgrade path

Exports and play integrations reject decks or pools that still contain ASH placeholders. Placeholders are playable inside SwuPod, but external tools need real cards.
