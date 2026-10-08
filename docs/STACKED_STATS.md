# Stacked Stats: You / All / Top

## Overview

The stats page displays card performance data across three player groups in stacked cells, allowing users to compare their own stats against the broader community and tournament players.

## Player Groups

| Group | Color | Source | Description |
|-------|-------|--------|-------------|
| **You** | Blue (#64B5F6) | `userId` API param | Logged-in user's personal stats |
| **All** | White | Default (no filter) | All players, filtered by Humans/Bots/Completed |
| **Top** | Gold (#FFB74D) | `tournamentOnly=true` | Tournament players matched from swumetastats.com |

When logged out, the "You" row shows "—" and the legend displays a "Log in" link (Discord OAuth).

## Legend Bar

The legend bar appears above each table and contains:

```
[x] You  ·  [x] All  [x] Humans [x] Bots [x] Completed  ·  [x] Top ℹ
```

- **You/All/Top toggles**: Checkboxes that show/hide their respective row in all stacked cells
- **Humans/Bots/Completed filters**: Only affect the "All" group's API calls. Positioned near "All" in the legend bar
- **"Completed" filter**: Only shown on the Draft tab (not Sealed)
- **ℹ icon**: Tooltip explaining that "Top" uses tournament player data

## Filter Scoping

Filters are scoped to the data group they control:

| Filter | Affects "All" | Affects "You" | Affects "Top" |
|--------|:---:|:---:|:---:|
| Humans | Yes | No | No |
| Bots | Yes | No | No |
| Completed | Yes | No | No |

"You" and "Top" fetches use independent API params (`userId` and `tournamentOnly` respectively) without bot/human filtering.

## Stacked Cell Layout

Each numeric cell renders up to 3 rows:

```
You:  3.2
All:  4.1
Top:  3.8
```

When a group is toggled off, its row is hidden from all cells. When a user has no data for a card, "You:" shows "—".

## Table Columns

### Draft Tab — Card Picks
| Name | Aspects | Rarity | Avg Pick | 1st Pick | # Drafted |

### Draft Tab — Leader Picks
| Leader | Aspects | Avg Pick | 1st Pick | # Drafted |

### Draft Tab — Leader Selection
| Leader | Aspects | Selection % | # Selected |

### Sealed Tab — Card Inclusion
| Name | Aspects | Rarity | Inclusion % | Avg Copies | Pools |

### Sealed Tab — Leader Selection
| Leader | Aspects | Selection % | # Selected |

- **Aspects** is always the 2nd column (icon images)
- **Rarity** is the 3rd column in card tables (sortable, color-coded)
- Sorting operates on the "All" values

## API Changes

Three stats API routes accept a new `userId` query parameter:

- `GET /api/stats/draft-picks?userId=<uuid>` — Filter picks to a single user
- `GET /api/stats/leader-selection?userId=<uuid>` — Filter leader selections to a single user
- `GET /api/stats/deck-inclusion?userId=<uuid>` — Filter deck inclusion to a single user

The parameter is optional and backward-compatible. When absent, the route behaves as before.

## Data Fetching

Each tab fires parallel API requests for all three groups:

### Draft Tab
- **All**: 3 fetches (card picks, leader picks, leader selection)
- **Top**: 3 fetches (same endpoints with `tournamentOnly=true`)
- **You**: 3 fetches (same endpoints with `userId=<id>`) — only if logged in

Total: 9 parallel fetches (6 if logged out)

### Sealed Tab
- **All**: 2 fetches (deck inclusion, leader selection)
- **Top**: 2 fetches
- **You**: 2 fetches — only if logged in

Total: 6 parallel fetches (4 if logged out)

Lookup maps keyed by `cardName` enable O(1) cell rendering for Top/You data.

## Files

| File | Role |
|------|------|
| `app/stats/page.tsx` | Main stats page with StatsCell, StatsLegend, DraftTab, SealedTab |
| `app/stats/stats.css` | Styles for stacked cells, legend bar, toggles, filters |
| `app/api/stats/draft-picks/route.ts` | API: draft pick analytics (added `userId` param) |
| `app/api/stats/leader-selection/route.ts` | API: leader selection rates (added `userId` param) |
| `app/api/stats/deck-inclusion/route.ts` | API: deck inclusion metrics (added `userId` param) |
| `app/api/stats/draft-picks/route.test.ts` | Unit tests for query building (added `userId` tests) |
| `tests/e2e/stats-page.spec.ts` | E2E tests for stats page UI |
