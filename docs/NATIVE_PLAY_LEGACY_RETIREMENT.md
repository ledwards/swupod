# External limited play retirement

Native play at `/play` replaces generic Karabast limited matchmaking. Old tabs and plugins receive HTTP 410 (`legacy_play_retired`) from the old queue, public listing, join, eligible-deck discovery, Karabast lobby proxy, and plugin pool launch-metadata endpoints. Service admission guards also reject direct internal calls. The Karabast lobby proxy makes no upstream requests.

Migration 103 cancels unclaimed legacy queue entries and open listings without active lobby attempts. Existing external lobby attempts are hidden from discovery, not deleted. It does not set winners, results, or terminal outcomes on active games. Existing seated players can reopen their external lobby URLs; claims cannot create replacement lobbies. Existing lifecycle callbacks cannot mint new attempt rows. The old periodic external-game expiry sweep is no longer scheduled, and disconnect cleanup does not delist a pre-created active lobby.

Generic plugin result ingestion now requires an existing correlated open-game attempt or an already-recorded casual match. Uncorrelated monitoring reports receive 410. Correlated ongoing games may still finish, retry results, and retain historical records. Result retraction and deck JSON export remain available.

## Deliberate migration boundary

Swiss Practice tournaments continue using their existing authorized lifecycle and result callbacks, including their ongoing tournament progression. Native tournament launch, round progression, and tournament results are a separate remaining migration; this change does not convert those events. The pool launch-metadata endpoint is retired for generic pool, Pack Wars, and Pack Blitz launches. Native play currently supports eligible draft/sealed decks only.

Installed Companion versions may still attempt retired calls until their own client release removes that behavior. PTP rejects those calls without starting monitoring. A previously running generic external game with no PTP correlation cannot safely be attributed to a deck; its uncorrelated report is rejected rather than creating a new tracked match. Existing external games can still hold their legacy admission reservation until they finish or are explicitly cancelled; no timeout victory is inferred.

Validation: focused retirement tests check 410 before database/runtime admission, no upstream fetch, and disposable PostgreSQL checks migration rerun safety, active/historical preservation, seated URL access, unauthorized access rejection, and prohibition on new lobby attempts.

Run the affected regression files with `npx tsx scripts/native-play/verify-local-legacy-tests.ts`. This creates and drops an isolated local PostgreSQL database, executes existing-game lifecycle/result coverage and retired-route expectations, and explicitly imports the bracketed plugin-route test (Node's test globbing otherwise misses Next.js `[format]/[shareId]` paths). The migration-103 preservation test is `src/services/play/legacyRetirement.db.test.ts`.
