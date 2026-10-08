# Draft Bot Strategy System

## Overview

Draft bots use 7 distinct strategies to create diverse, realistic opponents. Each strategy inherits from `BaseStrategy`, which provides shared scoring, deck constraints, and LAW splash logic.

## Architecture

```
BaseStrategy (abstract class)
├── Shared: quality/color/need/synergy scoring
├── Shared: deck validation, LAW splash logic
├── Mixin weight multipliers applied at construction
│
├── TopPlayerStrategy (1) — Drafts like top players
├── TournamentPlayerStrategy (2) — Drafts like tournament competitors
├── AllPlayerStrategy (3) — Drafts by community consensus
├── NemesisStrategy (4) — Counter-drafts the human (solo only)
├── DiversityStrategy (5) — Maximizes aspect diversity
├── PrimaryColorCornerStrategy (6) — Corners a primary color
└── SecondaryAspectCornerStrategy (7) — Corners hero/villain alignment
```

## Three Phases of a Draft

1. **Leader Draft** (3 rounds) — Strategy dictates leader ranking.
2. **Y — Mental Leader Pick** — The turn at which the bot decides which leader to play. Before Y, the bot stays flexible.
3. **X — Mental Base Pick** — The turn at which the bot decides its base color. After X, no more off-aspect picks.

Those draft-time commitments are persisted on `pod_players` as `committed_leader` and `committed_base_color`.
Post-draft deck building reuses that stored plan instead of re-picking a lane from the final pool.

## Strategy Assignment

- **7 bots (solo mode)**: One of each strategy (1-7), including Nemesis.
- **1-6 bots (multiplayer)**: No Nemesis. Strategies 1-3, 5-7 randomly, no duplicates.
- **Mixin**: Each bot gets a random mixin (A, B, or C). Duplicates allowed.

## Mixin Modifiers

| Mixin | Effect | Y/X Offset |
|-------|--------|------------|
| A: High Optionality | Picks broadly, commits late | +3 turns |
| B: High Conviction | Commits early, strong synergy | -3 turns |
| C: High Groupthink | Heavily weights popularity | No change |

## Scoring Formula

Each card is scored across four dimensions:
- **Quality** (0-100): Popularity-based (DB pick position) or rarity fallback
- **Color** (-40 to +100): Aspect match with leader/base
- **Need** (0-100): Deck profile targets (type ratios, cost curve)
- **Synergy** (0-50): Leader-specific card popularity delta + trait matching

Weights shift based on phase (exploration vs committed) and mixin.

## Data Sources

| Lens | Query Filter | Used By |
|------|-------------|---------|
| All Players | No user filter | Strategy 3 |
| Top Players | JOIN `top_players` table | Strategy 1 |
| Tournament Players | `user_id = ANY(tournament_user_ids)` | Strategy 2 |
| Solo Pod Leader | Specific user's history | Strategy 4 (Nemesis) |

## LAW Splash Rule

In LAW, bots may splash 3-5 off-aspect "bombs" if:
- Card is exactly ONE primary color out of aspect
- Card is NOT wrong hero/villain alignment
- Card is rare/legendary or a powerful card
- Current off-aspect count is below 5

## Key Files

| File | Purpose |
|------|---------|
| `src/bots/behaviors/BaseStrategy.ts` | Abstract base with shared scoring |
| `src/bots/behaviors/mixins.ts` | Mixin weight modifiers |
| `src/bots/behaviors/strategies/*.ts` | Individual strategy implementations |
| `src/bots/behaviors/index.ts` | Registry + strategy assignment |
| `src/bots/data/draftStats.ts` | Segmented popularity queries |
| `src/utils/botLogic.ts` | Bot pick execution + strategy wiring |
| `src/utils/botDeckBuilder.ts` | Post-draft deck building |
| `migrations/058_add_bot_commitment.sql` | Persists bot leader/base commitment |
