# Native private play host boundary

Disabled unless `PTP_NATIVE_PLAY_ENABLED=true`. Required server-only settings:

- `BAIZE_PVP_URL`, `BAIZE_PVP_SERVICE_KEY`
- `PURRGIL_INTERNAL_URL`, `PURRGIL_HOST_SERVICE_KEY`, `PURRGIL_PUBLIC_ORIGIN`
- `PTP_PUBLIC_ORIGIN`, `PTP_NATIVE_INVITE_KEY` (random high-entropy secret)
- `PTP_NATIVE_SUPPORT_PATH`: server-owned JSON manifest with `engineRevision`, `version`, `supportedSets`, `unrestrictedBaseIds`, and `cards` entries `{ptpId,engineId,type,rarity}`. Only reviewed supported cards belong here. Engine `/v1/support` authoring metadata alone is not gameplay certification.

Run migrations 096–100 before enabling. Nothing reads browser deck lists as runtime authority. A same-origin authenticated host request freezes a saved deck against immutable generation evidence and the pinned support manifest. Private paths are separate from the legacy client-reported runtime tables; they do not introduce a public queue.

## HTTP contract

- `POST /api/play/native/invitations`: `{poolShareId,requestId:<UUID>,allowMismatch?:boolean}` → `{matchId,token,status,allowMismatch}`. Persist the request ID across network retries. The token is an invitation discovery capability, not a game-seat credential.
- `GET /api/play/native/invitations/:token`: authenticated metadata only. No deck lists.
- `POST /api/play/native/invitations/:token`: `{poolShareId}` reserves the second seat atomically. Normal invitations require identical set, format and pack count. Explicit mismatch never relaxes deck legality/support.
- `DELETE /api/play/native/invitations/:token`: creator cancels a waiting invitation only.
- `POST /api/play/native/matches/:matchId/launch`: both seats must exist. Sends frozen decks to Baize idempotently, then requests a one-use Purrgil launch URL. Game-client session expires no later than six hours or the host login expiry; launch code expires after 60 seconds.
- `GET /api/play/native/matches/:matchId`: seat-owner-only status. Reconciles authoritative Baize terminal result; accepts no browser outcome. Repeated reconciliation is idempotent.

Mutations require exact configured host Origin. Login version is checked against the current user. Request bodies are bounded. Sensitive payloads are omitted from errors. No network call is held inside a database transaction. Backend must preserve exact match-ID/deck idempotency.

## Provenance

Completed server drafts use `pod_players.drafted_cards/drafted_leaders`, with pack count from the original `pods.all_packs`; edited card-pool JSON is ignored. New sealed-pod generation atomically stores `ptp_native_pool_evidence` alongside each generated pool. Evidence and deck versions prohibit UPDATE and do not cascade with editable pool deletion. Retention/account-erasure policy must explicitly delete retained private records when required.

Historical sealed and browser-generated solo pools are intentionally ineligible: their editable `cards/packs` cannot establish provenance. New authenticated solo pools use `/api/sealed/generate`: prepare retains a server-generated 24-pack box, and finalize atomically saves the chosen six/eight-pack window plus immutable evidence. Anonymous legacy generation remains unverified. No backfill invents evidence. Builds require the original owned source; borrowed/cloned pools are not silently certified.

## Remaining rollout gates

- Disposable PostgreSQL coverage now verifies migration reruns, join/creation/admission races, immutable history, consent/rematch snapshots, result retries and revocation retries. Actual two-account HTTP integration now verifies host → gateway → Baize launch, browser-user binding, one legal action and duplicate retry, concession/result, rematch snapshots, and logout. Visual/browser interaction remains a separate gate.
- Legacy queue entry and native reservations share per-user transaction advisory locks. Native legacy-state inspection uses one database snapshot to avoid missing queue-to-game transitions.
- Results reconcile on status reads and a 30-second server job. PostgreSQL leases and idempotent writes retry outages across restarts; logout revocation has a durable retry queue.
- No automatic invite expiry/disconnect win or public discovery is implemented. Mutual rematch requires both authenticated consents and retains identical snapshot IDs. The host UI is maintained separately.
- No launch set is certified by this code. Pin and review support data against the deployed engine revision before enabling.

## Verification and support inventory

`NATIVE_LOCAL_DB_TEST=1 npx tsx --test src/services/play/native/privateMatches.db.test.ts` creates its own uniquely named database through the local `/tmp` PostgreSQL socket, applies real migrations, checks races/recovery, then drops only that database. It does not load production environment files.

`scripts/native-play/build-support-manifest.ts --env-file PRIVATE_ENV --output FILE --sets SOR` reads authenticated Baize support metadata without printing credentials. It canonicalizes printings using the existing set/name/type/subtitle identity and rejects ambiguous normal printings. `supportedCardIds` is separate from catalog mappings, so unselected unsupported cards do not become playable. Without `--reviewed-ids FILE` the output is explicitly an internal authored inventory, not a certified launch allowlist. A reviewed ID JSON array restricts playable cards while retaining catalog identity mapping.

`GET /api/play/native/matches` returns the current player's recent matches and resumable waiting invitation token. `GET /api/play/native/matches/:id/rematch` returns `{status,accepted:[seat0,seat1],matchId}`; POST `{accept:boolean}` records consent/decline. Two accepted seats atomically create one match with exact prior snapshot IDs.

Launch performs a browser-bound host authorization bounce: Purrgil redirects to `/api/play/native/handoff?request=...`; PTP rechecks the actual browser user, approves only that subject through `/internal/authorize`, then returns to Purrgil's allowlisted completion URL. Login preserves invitation and match parameters. This adds no confirmation click.

## Isolated local full-stack fixture

`create-local-fixture.ts --gateway-env PRIVATE_ENV --support MANIFEST --directory /tmp/ptp-native-fullstack` creates a uniquely named local PostgreSQL database, two synthetic saved decks, and mode-600 environment/account files. It does not use or mutate production data. `run-local-fixture.ts /tmp/ptp-native-fullstack/fixture.env` starts Next directly on port 4395, with local PostgreSQL variables explicitly set so shared `.env` PG settings cannot redirect connections. The gateway must use host origin 4395, public origin 4396, and the same local Baize service credentials. Test cookies use the application's normal JWT signing with a separate random fixture secret.

`verify-local-http.ts /tmp/ptp-native-fullstack` exercises real HTTP routes, normal signed cookies, host-bound redirects, a real engine action, retry deduplication, concession, mutual rematch, exact snapshot retention, and logout. It permits loopback targets and fixture databases only. `verify-local-solo.ts` uses separate synthetic accounts to verify server generation, ownership, injection rejection, atomic saved evidence, and retry/window semantics. The fixture deliberately uses a minimal route-real schema rather than claiming coverage of every unrelated PTP feature. The database remains available for browser checks until explicitly removed. No authentication-bypass endpoint is created.

## Same-account local play

On the full local PTP app, set `PTP_NATIVE_LOCAL_TESTING=true` in `.env.local`
and restart the dev server. This is additionally restricted to
`NODE_ENV=development` and a loopback `PTP_PUBLIC_ORIGIN`.

Choose a saved deck on `/play`, click **Test both sides**, then **Open player 1**
and **Open player 2**. Both links use the same PTP login and launch separate
Purrgil windows with copies of the chosen deck. Reopening a link resumes that
seat. Each seat has a path-scoped HttpOnly game cookie; handoff cookies are also
independent, so concurrent windows do not replace each other's credentials.

Older saved builds may be tested without immutable generation provenance. The
server still checks ownership, canonical card identities, supported cards,
leader/base types and deck size. It does not certify those builds for ordinary
admission or insert artificial pool evidence. Test matches use an owner-bound,
idempotent engine ID, retain Baize journals, and never enter public matchmaking,
competitive results or the host's competitive archive/training dataset. No AI
is connected; control both players yourself. This testing path can be removed
without changing normal private/public admission rules.

The local-only creation path serializes the two launch requests with a user
advisory lock across engine creation. Ordinary match launch keeps network calls
outside its transaction. Current deck edits do not alter an already-created
test game; choose Test both sides again for a fresh game.
