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
