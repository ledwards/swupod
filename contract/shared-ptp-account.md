# Shared PTP account and library

PTP issues `ptp_session`, an HttpOnly, Secure, SameSite=Lax cookie scoped to `protectthepod.com` on the production PTP origin. The existing host-only cookie remains readable during migration. `/api/auth/session` and the lobby login handoff migrate an existing PTP session without extending its expiry or requiring Discord again. A signed-out shared cookie overrides legacy cookies on both sites. Do not remove that precedence: it prevents an old login returning after logout.

Purrgil never has PTP's JWT signing secret. It validates the shared cookie through the service-authenticated POST `/api/play/native/internal/session`, which verifies the JWT and compares `auth_version` with the current PTP user. Invalid shared credentials never fall back to a different local Purrgil account. Transient validation failures fail closed. Game polling still uses existing seat authorization; it does not add session-introspection round trips.

## Library contract for the UI work

- `GET /api/lobby/library` (also `/api/lobby/decks`) returns `{decks, hiddenCount, localTesting}` for the authenticated PTP account.
- Existing `POST /api/lobby/shared` with `{action:"decks"}` returns the same full library. `{action:"library"}` is an alias.
- Unfinished, older and unsupported pools are included with `ready:false`, `blocker` and `blockerCode`. `hasDeck`, `poolUrl`, `editUrl`, `sourcePoolShareId` are included. Hidden pools are excluded. There is no silent 100-pool cutoff.
- `GET /api/lobby/pools/:shareId` or shared `{action:"pool",poolShareId}` returns `{pool}` containing the owner's cards, saved deck-builder state, summary and PTP links. `buildComplete` describes the saved build; it is not permission to play.
- Never send a user ID. Both gateways derive ownership from the authenticated session. A foreign/hidden pool is a 404.
- Admission still freezes and validates the owned saved deck against authoritative source evidence, set/format and engine support. Showing a pool does not make it eligible to play.

The existing picker receives the expanded list automatically. Its default ready/compatible filters may hide unfinished pools; the UI should distinguish the full library from playable choices and use editUrl for blocked builds. When the account changes, clear cached library selections and reload the library.

Backend-only source worktrees: `/Users/lee/Repos/ledwards/ptp-shared-account` and `/Users/lee/Repos/ledwards/purrgil-shared-account`. Preserve the concurrent Current/prerelease validator and UI work when integrating/deploying.
