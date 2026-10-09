# Alpha integration

This is the PTP companion to Purrgil's `codex/alpha` integration branch.

- PTP: `/Users/lee/Repos/ledwards/swupod/.worktrees/codex/alpha`
- Purrgil: `/Users/lee/Repos/ledwards/purrgil/.worktrees/codex/alpha`
- Full integration ledger and process: Purrgil `docs/integration/alpha.md`.
- Start from Purrgil with `npm run alpha:start`; inspect both with `npm run alpha:status`.
- This branch preserves the October 8 local homepage/API source snapshot `12f27cc8`. Purrgil's shared homepage bundle and release notes are synced by `scripts/sync-play-home.mjs`.
- Keep `.env*`, `.alpha-local/`, and runtime credentials untracked. Admission metadata is regenerated from the actual local engine on every startup.
- The local Next server uses webpack to support linked development dependencies across worktrees. Production startup is unchanged.
- Integrate source changes here before refreshing the generated homepage. Do not deploy an older snapshot over newer production work. Publishing requires its own authorized release step.

October 8 reservation recovery: synced Purrgil source `528ff82`. The homepage now describes experimental Leebo and offers reservation-specific cancellation/forfeit/leave actions after blocked admission. These generated bundle files are for alpha; PTP production was not redeployed by this change.

Homepage first render: Purrgil `fb28223` generates the actual route-specific initial HTML. The PTP wrapper serves it with styles before importing the interactive bundle; it must not regress to a loading sentence or blank interstitial. Four desktop/mobile checks cover delayed JavaScript, JavaScript disabled, Eternal route selection, and working Settings after mount. Local alpha only.

Draft-table restoration: the draft source and circular seating layout still matched the preserved production baseline. Local alpha was missing `PTP_BETA_EXPERIENCE_ENABLED`, which disabled that presentation. The alpha launcher now sets it explicitly; the running local environment was updated without restarting the user's draft. Draft authorization now matches the endpoint's alpha/admin gate. Draft reads and writes the homepage's cookie-first theme preferences, listens for its change event, preserves other settings, and defaults to Purrgil Passage when no choice exists. Explicit legacy Default remains respected. Thirteen focused browser checks passed, including desktop/phone picking, four viewport sizes, rollout revocation, alpha access, and theme persistence. Actual local waiting draft inspected read-only; active drafting tested with isolated API fixtures. Production unchanged.
