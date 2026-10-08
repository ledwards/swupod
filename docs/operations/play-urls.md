# Play URLs

PTP is a limited product. Resource identity belongs in the path; filters and temporary presentation choices can remain query parameters.

| Route | Purpose |
| --- | --- |
| `/play` | Choose a saved deck or multiplayer play |
| `/pools/:poolId` | Pool overview |
| `/pools/:poolId/deck` | Deck builder; saved builds use `/deck/:buildId` |
| `/pools/:poolId/play` | Play choices for a pool |
| `/pools/:poolId/play/ai` | Practice opponent setup |
| `/pools/:poolId/play/swiss` | Swiss setup |
| `/pools/:poolId/play/bracket` | Elimination setup |
| `/runs/:runId` | Persistent practice or tournament, resolved for its owner |
| `/runs/:runId/sideboard` | Human sideboarding |
| `/lobbies/:invite` | Existing invitation lobby; each player selects their deck |
| `/matches/:matchId` | Multiplayer match status and continuation |
| `/games/:gameId` and `/games/:gameId/replay` | Host runtime and replay routes |
| `/draft/setup`, `/sealed/setup` | Gated creation flow |

Purrgil retains its own table URLs and seat-scoped authentication. It receives explicit `eventFormat` and `opponentUrl` launch metadata: tournament continuation must not depend on parsing a host URL. Practice rematches retain the same matchup; Find New Opponent uses the pool setup URL. Swiss live results return to the run; replays stay open.

Old `/limited/*`, `/pool/*`, `/draft_pool/*`, `/sealed_pool/*`, runtime and query-based invitation/match links redirect. Old saved pool/request links resolve the existing owner-bound run before redirecting; unfinished preparation keeps its idempotency key until it creates the run. New tournament request keys live in component/session storage and request bodies, not published URLs. API filtering parameters are unchanged. The new run resolver checks authentication and ownership; route IDs confer no authorization.

All experimental entry pages retain the beta presentation gate and existing API admission checks. The production switch remains unchanged. This migration does not enable a rollout.
