# Native play operations — internal milestone

This runbook covers the current single-replica Purrgil/Baize deployment. Public
matchmaking and promotion from PTP remain gated by the execution plan. Do not
interpret a healthy process or authored-card inventory as rules certification.

## Ownership and configuration

PTP owns accounts, saved deck versions, admission and the durable result ledger.
Purrgil owns browser-bound seat sessions. Baize owns private game journals and
accepted actions. Each repository builds and deploys independently.

Purrgil requires its own persistent `/data` volume, exact `PUBLIC_ORIGIN` and
`HOST_ORIGIN`, issuer and independent host/backend service keys. Baize requires
its own `/data` volume, service key, issuer and exact `BAIZE_ENGINE_REVISION`.
Never give either key to browser JavaScript or prefix it with `VITE_`.
Use private Railway networking between services. Both containers drop privileges
and lock their volume; configure one replica and stop-before-start replacement.
Separate volumes do not provide distributed fencing or horizontal scaling.

PTP settings are listed in `src/services/play/native/README.md`. Keep
`PTP_NATIVE_PLAY_ENABLED=false` until the reviewed support manifest exactly
matches the deployed engine revision. The initial authored SOR inventory is an
internal test aid, not the reviewed release allowlist.

Apply migrations 096–100 through the existing startup migration runner before
serving this code. These are additive tables/locks; legacy outcomes are isolated
from authoritative native results. Migration 100 is also required for signed-in
solo sealed creation, independently of the native-play admission flag. Preserve
old table data during rollback; do not reverse migrations while games exist.

## Initial deployment and health

1. Deploy Baize with `Dockerfile.pvp`, private networking, `/readyz` health check,
   and its persistent volume. Configure the explicit Dockerfile path on the
   service; a generic Rust/Railpack autodetection cannot infer the PvP binary.
2. Deploy Purrgil with `Dockerfile`, its separate volume and `/health` process
   check. Verify `/ready` also returns 200 after reaching the private Baize API.
3. Configure the exact canonical PTP host origin (currently the `www` host) for
   the handoff callback. A redirect to a different host must not silently change
   the authentication origin.
4. Establish DNS/certificate for `play.protectthepod.com`, then change both
   Purrgil `PUBLIC_ORIGIN` and PTP `PURRGIL_PUBLIC_ORIGIN` together. Initial testing
   uses the assigned Railway hostname; do not mix audiences.
5. Deploy the PTP feature branch only after integration/review and policy gates
   pass. Existing production PTP has not been changed by this milestone.

Railway's deployment settings are authoritative. Verify their effective values
and exact deployment ID after each update rather than assuming a checked-in
configuration file was applied. As of this implementation, both independent
services have successful deployments and the public readiness chain passes.

## Recovery and upgrades

Every accepted engine action is journaled and fsynced before acknowledgement.
Clients retry an ambiguous failed request with the same command ID and expected
revision; they never submit an old action index against a new revision. Restart
replays only committed actions and refuses corrupt or mismatched-revision data.

Do not change `BAIZE_ENGINE_REVISION` while its data directory retains games from
a different revision. Stop new admissions, finish/reconcile existing games,
archive their journals privately outside the active directory, then upgrade.
Restore the matching binary and journal backup together for rollback. Never
rewrite a journal revision to make it load. Keeping old versioned workers during
upgrades requires additional routing work and is not implemented yet.

A persistence failure fences a service until restart. Diagnose storage health
before restarting; do not delete lock files or journals to force readiness.
Lock ownership ends when the owning process exits. Purrgil restarts recover its
hashed session store, while Baize restarts recover game state independently.

PTP reconciles terminal outcomes and retries logout revocation with leased
PostgreSQL jobs every 30 seconds in `server.ts`. Status reads also reconcile.
Do not delete terminal journals until their host result has been committed.
No browser-submitted winner is accepted. Loss of a socket is not a concession.

## Capacity and retention

Baize currently retains at most 1,000 matches and 20,000 normal gameplay commands
per match; concession remains possible at the command cap. Completed games count
toward capacity. The service serializes operations and writes a full journal per
accepted action. Measure representative load before broad matchmaking.

Purrgil retains at most 1,000 launch codes and 2,000 sessions; expiry bounds
credentials and pruning. These are operational bounds, not a scale guarantee.
Back up volumes with access controls: journals contain hidden hands and seeds.
Session stores, test account cookies and local fixture environments are private.

Solo sealed artifacts expire unopened after 24 hours. Retention and account erasure
must deliberately cover artifacts, immutable source evidence, deck snapshots and
runtime journals; deleting an editable pool does not delete its game history.
No automated retention job or competitive inactivity outcome is introduced here.

## Reproducible verification

- PTP `scripts/native-play/create-local-fixture.ts` (see the actual script arguments)
  creates a uniquely named local test database and private fixture files. The
  verification scripts reject non-loopback targets. Never point them at production.
- `verify-local-http.ts` exercises actual PTP → Purrgil → Baize create/join,
  browser-bound seat authorization, retry, concession/result, rematch and logout.
- `verify-local-solo.ts` checks real server generation and PostgreSQL evidence,
  ownership, card-injection rejection and idempotent finalization.
- Purrgil `npm test`, `npm run build`, `npm run test:browser`; its independent
  real-engine integration accepts `BAIZE_BINARY=/path/to/baize-pvp`.
- Baize `cargo test -p baize-pvp` and
  `python3 crates/baize-pvp/tests/http_smoke.py` after building the binary.

The automated browser suite uses desktop and phone emulation. Current Karabast
interaction comparisons and physical iPhone/iPad performance remain release gates.

## Public matching and durable records

`/play` uses one native public waiting list for Find game and Join. Admission
freezes the chosen deck; set, sealed/draft format, pack count and validated
engine revision must match. A player has one active reservation across private
and public native play. Cancelling is permitted before another player joins.

Apply migrations 101–103 before deploying this host. Migration 103 retires only
unstarted external waiting entries; completed history and active external games
must not be assigned fabricated results. New limited Karabast discovery,
launch and monitoring admissions are retired by the host routes.

Baize journals every accepted command together with both projected seat views.
After terminal result reconciliation, a separate leased host job archives the
complete record in `ptp_native_game_records`, checks its match/deck/revision/result
identity, and hashes canonical JSON with SHA-256. Duplicate archival is safe;
record updates are rejected. A failed archive retries without deleting runtime
journals. The initial host download bound is 128 MiB; oversized games remain on
the engine and require an operational export path before any upgrade/cleanup.

**An engine journal is not eligible for removal until its host archive exists
and its hash has been verified.** Back up both PostgreSQL and engine volume.
Snapshot-rich journals grow with decisions, and the engine currently rewrites
the journal each command; representative long-game load is a release gate.

Members can read `/api/play/native/matches/:id/record` and open a bound replay
through `POST .../:id/replay-launch` after completion. Replays use host archives
and remain available when the matching engine binary is offline. The gateway
strips setup/seed/commands from browser replay data and rejects game mutations.
The internal archive route requires the shared host service credential and
checks subject membership; live games cannot expose either player's full record.

Administrators can export `GET .../:id/training`. Each JSON example includes
only the acting seat's pre-action observation, its legal actions, chosen action,
terminal reward and record hash/revision. Concessions are not ordinary policy
actions. Full authoritative records retain setup and both seat frames for audit
and reconstruction, separately from this restricted policy-training projection.
No external training service is invoked. Retention/account erasure policy must
include this immutable archive; immutability does not replace a deletion policy.

`verify-local-public.ts` tests real PostgreSQL matching races and immutable
reservations. `verify-local-records.ts` exercises public pairing through real
engine action, completion, immutable archive, member replay and admin training
privacy using isolated loopback fixtures.
