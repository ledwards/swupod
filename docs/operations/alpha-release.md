# Alpha release — October 13, 2026

## Status

Alpha now includes production main through `f391f14e` in its Git ancestry. The snapshot-history gap is resolved: main's pack-generation and card-import fixes are retained, alongside the alpha design. The October 13 release was deployed through Railway CLI; Git branches have not been pushed.

This document supersedes the deployment directions in the October 8 integration notes. The audit below predates the production rollout recorded here.

## The sources to keep

- **PTP:** `swupod/.worktrees/codex/alpha`, branch `codex/alpha`, including application checkpoint `93fca7f5` and the subsequent main integration. Includes Claude's Draft Log / Friends of the Pod review work, the match-loading transition, IBH legality, dev-only terronk queue seats, and the tested recording-download fix. The new-build state and New sealed pool link fixes from production `f391f14e` were ported without replacing the alpha UI.
- **Game service:** `purrgil/.worktrees/codex/preserve-alpha-runtime`, branch `codex/preserve-alpha-runtime`, `47c04eb`. Contains fetched `origin/main` (`8bc1b4b`), including live undo notifications and human best-of-three conversion, plus the loading transition. **Purrgil `codex/alpha` is retired.**
- **Rules:** Purrgil pins Baize `ecc82e1b79556895b99ca725033352f919a518d4`; Baize main `00e75c88` has the same source tree. No separate Baize source update is needed for this release.
- PTP's generated website and vendored game presentation were refreshed from `47c04eb`. PTP owns the website; never rebuild it from retired Purrgil alpha.

## Before deploying

The merge uses `230afb89` (October 8 main) as the explicit three-way comparison base because alpha began as the independent snapshot `1f2cf87a`. Both actual histories are parents of the merge; no history was rewritten. Future merges can use ordinary `git merge origin/main`.

Pack source under `src/belts`, `boosterPack.ts`, and `packConstants.ts` matches main. Set configs retain alpha's additional base-trait metadata for deck statistics without changing pack generation. Main's legacy/alpha presentation gates are retained, with the latest alpha draft implementations behind them.

Fetch before publishing, merge any further main updates normally, and rerun checks affected by those updates. Use this reconciled alpha branch as the source for the normal main/PR release; do not force-push.

## Morning rollout

1. Push the saved PTP alpha and Purrgil work. Publish this reconciled PTP branch through the normal main/PR path; pushing alpha alone does not install it on production. A main push may auto-deploy—keep the order below.
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
- Main-integration checks: full unit suite 3,027 passed / 17 skipped; full pack QA passed. Website flow suite 35 passed initially and the one phone timeout passed on its isolated rerun (36 cases covered). Three draft browser checks passed: gate revocation, authenticated return, alpha access. Production Next build and TypeScript passed.
- No live production smoke, environment audit, push, or deployment was performed. The complete real-engine happy-path suite was not rerun in this merge audit.

## Production rollout — October 13

- Gateway source `47c04eb`, deployment `e3bd83a5-f531-49e2-af81-e406d32b0617`: SUCCESS; `/health` returned 200.
- Website source `858dd8e4`, deployment `d0f2f433-6805-4d3f-b994-4a224b17e74f`: SUCCESS. All 124 migrations were already applied; no pending migrations.
- Runtime deployment `adfd7b09-1592-4b83-add1-27242e1d2d1b` was already SUCCESS on the pinned engine revision with the newer AI fallback fix. It was retained.
- Enabled `PTP_SITE_THEME_ENABLED`; retained the existing alpha/native/AI admission flags. The cohort is 15 non-admin alpha users and one admin. No broad beta-user grant.
- Live browser testing exposed a proxy-origin mismatch in the homepage API relay. Fix `c48082dc` compares mutations to configured `PTP_PUBLIC_ORIGIN`, rejecting untrusted and internal origins. Regression test reproduced the 403 before the change and passed afterward; TypeScript passed. Running the patched relay locally against production also passed.
- Hotfix deployment `3cd45bfe-ff97-4a96-922b-9e54d5438993` failed during upload, before any build. Retry `c817325d-2c6a-4e5f-bdd1-a50947bd31e6` reached SUCCESS, with zero pending migrations and a passing health check. The cold builder compiled OpenCV and had a slow npm install; the deployment completed without changing the builder configuration.

Live checks completed:

- Signed-out browser retains the legacy homepage. A signed-in non-alpha account received 403 from native play before its invited alpha grant.
- Alpha homepage renders; both test accounts can fetch lobby state and validate constructed decks.
- Constructed AI, saved HMW sealed AI, and saved HMW draft AI games reached their live boards with both player areas visible.
- Private invitation and public matchmaking each put both test accounts into opposite seats of the same live table.
- Test games were ended through the normal concede flow; both accounts have no active reservation or queue afterward. Game records were retained.
- The reported SWUForge deck imports and validates as Premier against the live gateway, including its IBH cards.

These live checks used existing saved limited decks, API admission, and browser table handoffs. They do not replace a full fresh-draft or tournament E2E run. After the hotfix, the live browser flow also passed: saved sealed deck builder → Ready to Play → Leebo’s own pool → live board. The last test game was conceded normally.

Rollback before this release: PTP deployment `148869f6-f63f-4935-ad31-ddac2834e9fb`; gateway `1b40aab0-dc0b-4704-b664-4a2f4f9e859d`. Preserve database migrations and runtime journals.

Source commits remain local. Publish the reconciled alpha history through the normal main/PR path before the next source-driven production deploy, so an older main checkout does not replace this direct CLI release.
