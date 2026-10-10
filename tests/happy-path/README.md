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
