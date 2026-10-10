# Happy-path browser suite

Run `npm run test:happy-paths` from the PTP alpha worktree.

For the shorter Constructed/homepage launch checks, run `npm run test:happy-paths -- launch.spec.ts`. Run a single scenario with `--grep`, or a whole flow with its spec filename. Keep one suite invocation running at a time: they share dedicated ports and the artifact directory. The complete suite includes real timed drafts and takes several minutes.

The suite uses actual PTP routes, Socket.IO, the Purrgil gateway and the Rust game runtime. Authentication is seeded using disposable database users; drafting, pool generation, building and game admission are not mocked. No game actions are played after admission. Only Next’s development hot-reload WebSocket is kept inactive in seeded browser contexts, preventing framework reloads from clearing an imported deck while another player’s routes compile; application Socket.IO and game traffic are untouched.

Local prerequisites:
- PTP dependencies and its development database configuration (`.env.local`). Never point this suite at production.
- A sibling Purrgil alpha worktree, or `PURRGIL_SOURCE` pointing to it.
- Purrgil's built `target/debug/purrgil-runtime` and frontend `dist`; alternatively set `PTP_RUNTIME_BINARY`.
- Chromium installed with `npx playwright install chromium`.
- Free ports 3025 (PTP), 4335 (runtime), and 8085 (gateway). The ordinary local app remains on its own ports.

Every run gets fresh engine and gateway directories under `.happy-path-runtime/run-*`; old test journals are retained for inspection and are never replayed by a newer engine. Each browser account is test-only. Teardown deletes owned test data. Socket notifications to Discord and unrelated background jobs are disabled. Traces and screenshots stay in ignored `test-results-happy-path/`; they can contain test session cookies and should not be published.

Coverage:
- Homepage Constructed → Eternal → JSON import → Leebo board.
- Shared Play page → Constructed Eternal JSON import → AI board.
- Two accounts → matchmaking → same game, opposite seats.
- Private invitation URL → recipient import → same game, opposite seats.
- HMW six-pack and eight-pack sealed → opening → deck building → AI board.
- Limited saved decks → public matchmaking and private invitation.
- Complete HMW solo draft → all leader/card picks → deck building → AI board.
- Completed draft → elimination bracket and Swiss → first AI game.

- Eight human accounts → competitive HMW draft → all 45 picks each → deck building → Swiss round-one pairing → four real Purrgil games.

Competitive group Swiss launches directly in Purrgil. The test checks all four pairings for matching game IDs and opposite seats, rejects a different pairing’s launch, and verifies that rejoining preserves the game ID.

## Verification

2026-10-09, PTP `codex/alpha` with the sibling Purrgil alpha runtime/frontend:
- Full run: **12 passed in 12.7 minutes**, no retries or skips.
- All twelve scenarios now reach real Purrgil boards. After closing the competitive launch gap, the expanded eight-human competitive test passed in 11.5 minutes.
- `npx tsc --noEmit --pretty false`: passed.
- `npx tsx 'app/api/draft/[shareId]/ready/route.test.ts'`: 11 passed.
- Dedicated services shut down and disposable test accounts were removed.

The run exposed clickable draft cards before a pick was allowed; the card disabled state now matches the existing selection guard. Type checking also exposed unsupported Next route exports; ready validation helpers now live in `validation.ts`, with the existing unit tests preserved.

Competitive native follow-up verification: four launch regression tests passed in 1.2 minutes; 36 matchmaking UI tests, 19 game-claim database tests, two native Swiss regressions, and the private-reservation database regression passed. TypeScript checking passed.

### 2026-10-10 consolidated alpha verification

Purrgil source `60856fb`, Baize `7c8c24c43ee26ec915cefd2bf6885d72ad67e8bf`, and PTP integration `198e8329`:
- Eleven noncompetitive scenarios passed across two runs: six draft/direct-launch scenarios, then five homepage/limited/sealed scenarios after updating selectors for the redesigned pages. Both sealed sizes and public/private limited admission reached real boards.
- The eight-human competitive rerun is **not verified** on this stack. An initial run exposed overlapping full-draft reads during broadcast bursts. Reads now coalesce with a fresh trailing read; focused refresh/reconciliation tests pass. The subsequent competitive run progressed to 41 cards per player, but the local test server stopped before completion. Its termination cause was not established; the harness now logs unexpected child exits.
- Next emitted a transient webpack cache error during the passing sealed run. No claim is made that development-server stability is resolved.
- TypeScript checking, 46 focused API/session/cosmetic/admission tests, and 15 refresh/reconciliation checks passed. Purrgil passed 287 JavaScript tests, 27 runtime tests, 10 desktop/mobile browser tests, the pinned engine contract checks, and the real-engine gateway integration scenario.
- This supersedes the earlier full-green result for the newly consolidated stack; competitive end-to-end revalidation remains outstanding.

### 2026-10-10 competitive revalidation completed

The eight-human competitive scenario passed in **13.5 minutes** (13.7 minutes including setup), with no retries. Every participant completed three leader picks and 42 card picks, built a deck, and entered one of four real Swiss games. Pairing ownership, opposite seats, four distinct game IDs, and rejoining the existing game all passed. Together with the eleven shorter scenarios above, all twelve happy paths have passed on the consolidated stack across targeted runs.

The reproduced blockers were test-host timing limits: a full run reached 41 cards when the 15-minute scenario deadline expired; another trace showed successful pod creation followed by cold route compilation consuming the 20-second navigation allowance. The competitive scenario now has a 25-minute overall budget and 60-second allowances for pod navigation and opening the deck builder. Individual pick/progress assertions remain unchanged. Drafting and game admission still run concurrently for eight players; deck building runs sequentially to avoid eight competing cold page transitions. This is functional admission coverage, not a concurrency/performance benchmark. No game rules or competitive timers were changed. The earlier unexplained service exit was not reproduced and is not claimed as independently diagnosed.

Local desktop/phone review covered the homepage, draft/sealed entry pages, shared Themes/Settings, and theme persistence between pages. Screenshots are under untracked `artifacts/alpha-review-20261010/`. Live Melee linking was not verified with the seeded Discord account. Test services shut down after the passing run.
