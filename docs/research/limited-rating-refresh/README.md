# Limited rating refresh

`before/` is the public card-stats API and the committed ASH pick snapshot, frozen on 2026-10-02 before scope or rating changes.

`evaluation.json` is the read-only production audit: environment coverage, provisional performance letters, and held-out log loss. It has no player or build identifiers.

`impact-report.md` is the before/after reading of those files, including what was not published.

`src/data/activeLimitedRatings.json` is what bots and the active rating consume. A set is used only when its status is `published`. None are.
