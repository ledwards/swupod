# Solo BO3 sideboarding

Migration `108_solo_sideboarding.sql` must run with the matching application update. It adds a BO3 conversion flag without rewriting immutable run preparation, and backfills previously requested games with their original participant decks.

A completed practice game can become game one of a BO3 match. Conversion preserves its result and opponent. Before later BO3 games, `/limited/sideboard?run=<run-id>` lets the owner move pool cards, change leader/base, or select an owned alternate build. The server validates card multiplicities, original pool membership, supported cards, and base-specific Limited deck sizes before committing the next game. Common bases come from the pinned support manifest.

Changing a leader or base creates a normal child `card_pools` build under the original source pool. Choosing a saved alternate reuses that build when its leader/base match. Card swaps alone update that build's deckbuilder state. The save and next-game deck snapshot are one transaction; retries reuse the committed snapshot and do not create another build.

Use `ptp_solo_ai_games.deck_snapshots[0/1]` (JSON indexes) for per-game deck identity. Each snapshot retains `sourcePoolId` for pool aggregation, `poolId`/`poolShareId` for build aggregation, and `contentHash` for the precise version. Participant decks remain the immutable starting decks and must not be used to identify later sideboarded games. Record and training APIs include these snapshots. Runtime creation and archived-record verification use the same snapshots.

Verification:

- `npx tsx --test src/services/play/solo/sideboard.test.ts`
- `NATIVE_LOCAL_DB_TEST=1 npx tsx --test lib/play/soloSideboard.db.test.ts` creates and drops only its own disposable local database.
- `TEST_BASE_URL=http://127.0.0.1:4484 npx playwright test --config=playwright.sideboard.config.ts` uses a running development server and mocked browser API responses.

After deployment, verify a BO3 conversion retains game one's result, an invalid 29-card deck cannot continue, and a leader/base change appears in the pool's normal build picker. Confirm each requested game has two snapshots and that the second game's `sourcePoolId` matches the first while its changed build has a different `poolId`. Investigate repeated `invalid_deck`, `stale_game`, or `native_unavailable` responses during confirmation; retrying after a gateway outage must resume the already saved deck.
