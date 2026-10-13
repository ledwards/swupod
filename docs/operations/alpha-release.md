# Alpha release — October 13, 2026

## Status

Local alpha is saved and the focused checks below pass. **Do not deploy PTP's alpha checkout directly over production yet.** PTP alpha and main have divergent histories and different shared pack-generation code. Alpha membership gates the new UI, not those shared algorithms. This is the remaining release preparation task, not a reason to add more rollout stages.

This document supersedes the deployment directions in the October 8 integration notes. Nothing was pushed or deployed during this audit.

## The sources to keep

- **PTP:** `swupod/.worktrees/codex/alpha`, branch `codex/alpha`, application checkpoint `93fca7f5`. Includes Claude's Draft Log / Friends of the Pod review work, the match-loading transition, IBH legality, dev-only terronk queue seats, and the tested recording-download fix. The new-build state and New sealed pool link fixes from production `f391f14e` were ported without replacing the alpha UI.
- **Game service:** `purrgil/.worktrees/codex/preserve-alpha-runtime`, branch `codex/preserve-alpha-runtime`, `ecfa383`. Contains fetched `origin/main` (`ca41fe2`), including live undo notifications and human best-of-three conversion, plus the loading transition. **Purrgil `codex/alpha` is retired.**
- **Rules:** Purrgil pins Baize `ecc82e1b79556895b99ca725033352f919a518d4`; Baize main `00e75c88` has the same source tree. No separate Baize source update is needed for this release.
- PTP's generated website and vendored game presentation were refreshed from `ecfa383`. PTP owns the website; never rebuild it from retired Purrgil alpha.

## Before deploying

Prepare a PTP release branch from current production `origin/main` and integrate the alpha experience there, preserving current production behavior for non-alpha users. Do not force-push alpha over main. In particular preserve production's `src/belts` and `src/utils/setConfigs` changes: alpha currently differs in leader printing, rare/legendary, and UC3 generation. Review the other production-only changes too; the two fixes ported today are not a claim of full production parity.

Run the production build and the happy-path suite on that reconciled release branch. The current audit did not run a full Next production build or the complete real-engine happy-path suite. Once this is done, replace this paragraph with the release branch and commit. **Until then, this is not an executable “deploy everything” checklist.**

## Morning rollout, once the release branch is ready

1. Push the saved PTP alpha and Purrgil work. Publish the reconciled PTP release through the normal main/PR path; pushing alpha alone does not install it on production. A main push may auto-deploy—keep the order below.
2. If the running engine revision differs from the pin, deploy the runtime first with Purrgil's `scripts/deploy-runtime.sh`; its `BAIZE_ENGINE_REVISION` must match `engine.lock.json`. Keep the existing persistent volume. Then deploy Purrgil with `npm run deploy` from the verified game-service branch.
3. Deploy the reconciled PTP branch through the existing Railway service. Its pre-deploy command runs migrations; require a successful migration step and `/api/health`. Preserve existing production origins/service keys. Enable `PTP_BETA_EXPERIENCE_ENABLED`, `PTP_NATIVE_PLAY_ENABLED`, `PTP_SOLO_AI_ENABLED`, and `PTP_SITE_THEME_ENABLED` for the intended experience. Never copy local preview/test variables or local credentials to production.
4. Grant **Alpha access** only to the invited friends through the admin panel; admins already qualify. Refresh their sessions. Verify a signed-out/ordinary account still gets the existing site.
5. Smoke with **terronk and realleebo**: sealed → AI board; draft → builder → Play; private invite → both seats; public queue → both seats. Check the transition never flashes the homepage. No full game required; cancel/forfeit the test games afterward.

If it breaks: roll back the PTP deployment to its previous successful revision. Disable native/AI admission if necessary. The native-play switch alone does **not** remove the alpha homepage. Keep game journals and database data; do not roll back migrations or delete sessions as a shortcut.

## Checks run in this audit

- Purrgil `npm test`: success; server portion 152 tests passed; engine/transport/preference tests also passed.
- Purrgil `npm run build`: passed.
- PTP `npm run typecheck` and website TypeScript project: passed.
- PTP focused database/card/dev-seat tests: 6 passed, none skipped. Covers immediate recording download, unauthorized download rejection, alpha migration, IBH legality, local-only admin seat isolation.
- Guest identity and rollout tests: 11 passed.
- PTP `shared-home.spec.ts`: 36 passed across desktop and phone, including queue/AI flows and no-homepage-flash regression. These use the browser harness, not production matchmaking.
- New-build browser regression was ported with the production fix but was not executed during this audit.
- No live production smoke, environment audit, push, or deployment was performed.
