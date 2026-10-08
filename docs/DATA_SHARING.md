# Data Sharing Philosophy

PTP exposes data through two tiers of API access, with different privacy guarantees.

## Public APIs — Population-Level Analytics

**Endpoints:** `/api/stats/*`, `/api/public/*`

**What they expose:** Aggregate statistics about cards, picks, and formats across the entire player base. Card pick rates, average pick positions, leader popularity, rarity distributions, pack quality metrics.

**What they never expose:** Individual player identity. No usernames, no user IDs, no Discord IDs, no way to trace a data point back to a specific person.

**Who can access:** Anyone. No authentication required. Rate limited (60 req/min) to prevent abuse.

**Design principle:** Population-level data is a public good. The community benefits from knowing that Card X is picked 80% of the time in pack 1 or that Leader Y has a 55% win rate in sealed. This data helps everyone make better decisions and makes the game more interesting.

**Bot data:** Stats endpoints return **human-only data by default**. Draft bots fill empty seats and make random picks — including them would distort pick rates, leader popularity, and deck inclusion metrics. Pass `includeBots=true` to include bot data (useful for debugging bot behavior, not for real analysis).

**Examples:**
- `GET /api/stats/draft-picks` — card pick rates by set, position, rarity (human-only)
- `GET /api/stats/draft-picks?includeBots=true` — same, with bot picks included
- `GET /api/stats/leader-selection` — leader popularity and pick round (human-only)
- `GET /api/stats/deck-inclusion` — how often cards make it from pool to built deck (human-only)
- `GET /api/public/draft-log/:shareId` — anonymized draft log (seat numbers, not names)

## Private API — Opt-In User Data

**Endpoints:** `/api/private/*`

**What they expose:** A specific user's pools, built decks, and draft picks — everything they've done on PTP.

**Who can access:** First-party services only, authenticated via a shared service key (`PTP_SERVICE_KEY`). Currently only SWUTeam.

**How users opt in:** By joining a SWUTeam team. SWUTeam knows team members by Discord ID (shared auth provider). When syncing, SWUTeam requests data for each member's `discord_id`. Users who don't join a team are never queried.

**What this enables:** A team member's PTP draft data appears in their SWUTeam dashboard alongside their Karabast games and melee.gg tournament results — one unified view of their play across all platforms.

**Design principle:** User-specific data is private by default. We never bulk-export the user table. We never return data for users who haven't opted in. The private API fetches one user at a time, by explicit identifier, only when a trusted service asks for a specific person.

## The Line

| | Public | Private |
|---|---|---|
| **Scope** | All players, anonymized | One player, identified |
| **Auth** | None | Service key |
| **Granularity** | Aggregate stats | Individual records |
| **Identity** | Never exposed | Discord ID required |
| **Consent** | Implicit (using PTP = contributing to stats) | Explicit (joining a SWUTeam team) |
| **Consumer** | Anyone (community sites, tools) | First-party services only |

## Adding New Data Exports

Before adding a new endpoint, ask:

1. **Does it identify individuals?** → Private API, service key required.
2. **Is it aggregate/anonymized?** → Public API, no auth needed.
3. **Could aggregate data be de-anonymized?** (e.g., "the only person who drafted this exact sequence") → Be careful. Consider minimum sample sizes or coarser aggregation.
4. **Is a third party asking for it?** → Public stats only. Private API is first-party only.
