---
title: Architecture refresh — post-foundations delta audit, exemption retirement, contract pinning, subsystem debt
type: fix
status: active
date: 2026-07-07
supersedes-audit-of: docs/plans/2026-06-11-001-fix-foundations-hardening-plan.md
---

# Architecture Refresh Plan (2026-07-07)

## Overview

Four weeks and 467 commits after the foundations hardening plan shipped (2026-06-11),
this plan re-audits the codebase, verifies every I-C unit against the current tree,
and maps the debt introduced by the new subsystems: live Swiss Practice orchestration,
the ASH/LAW collation engine, import-pool dual extraction pipelines, personal/per-deck
stats, Patreon gating, and the (unstarted) Forceteki limited runtime.

**Headline verdict: the foundations plan genuinely shipped and held.** All 8 units are
verifiable in code today, and — the strongest possible signal — the new Swiss Practice
subsystem *adopted* the primitives rather than routing around them (`withTransaction` +
`pg_advisory_xact_lock` at `src/services/matchmaking/liveGames.ts:567,729,948,1209`).
The debt that remains is concentrated in three places the old plan explicitly deferred
"temporarily" and that then calcified: the DeckBuilder bundle exemption, the
`@ts-nocheck` ratchet's tolerance for deliberate baseline bumps, and the cross-repo
contract surfaces that grew without pinning.

## Delta Audit — I-C unit-by-unit verification (evidence, 2026-07-07 tree)

| Unit | Claim (plan, status: done) | 2026-07-07 verdict | Evidence |
|------|---------------------------|--------------------|----------|
| U1 `withTransaction` | Shipped `ce3e3b9` | **HELD** | `lib/db.ts:101` `withTransaction<T>`; nesting rejected `lib/db.ts:106`; typed (no `@ts-nocheck`); `lib/db.test.ts` present. Bonus: a `withAdvisoryLock` session-lock helper also exists (`lib/db.ts:184`). |
| U2 Atomic draft advance | Shipped `becaa26` | **HELD + PROPAGATED** | `src/utils/draftAdvance.ts:175,626,756` take `pg_advisory_xact_lock(hashtext($podId))` inside `withTransaction`. `bot_processing_since` fully retired — the only remaining reference in the tree is the concurrency regression test (`app/api/draft/draft-advance-concurrency.test.ts`). The NEW live-games state machine reuses the exact pattern (`liveGames.ts:567,729,948,1209`) — the primitive became the house style. |
| U3 Socket auth + CORS | Shipped `980752f` | **HELD, and better** | Socket logic extracted from server.ts (now 210 lines) into `src/lib/socketServer.ts` (313 lines, typed, tested — `socketServer.test.ts`). `io.use()` at `socketServer.ts:147` derives `socket.data.user` from the `swupod_session` cookie; `presence:join` ignores client payload (`:161-172`); `chat:send` builds identity from the verified session only (`:215-230`). CORS allowlist at `server.ts:112` (`cors: { origin: allowedOrigins, credentials: true }`). |
| U4 JWT/OAuth hardening | Shipped `53842a7` | **HELD** | Prod boot-throw when no secret (`lib/auth.ts:9-19`); `auth_version` claim minted (`:80`) and compared to `users.auth_version` in privileged gates (`:233-237`); OAuth nonce via `crypto.randomBytes` (`app/api/auth/signin/discord/route.ts:44`, cookie `swupod_oauth_state`), verified double-submit in callback (`app/api/auth/callback/discord/route.ts:64-80`) with a one-shot cookie-missing retry; `sanitizeReturnTo` closes the open redirect (`callback/discord/route.ts:44`). |
| U5 cards.json out of client | Shipped `2e8f793` | **HELD — with one calcified asterisk** | `GET /api/cards` + `src/utils/cardDataClient.ts` exist and are tested; LandingPage is summary-backed (`src/components/LandingPage.tsx:27-28` comment documents the rule); bundle guard runs in CI (`.github/workflows/ci.yml:33-49`). **BUT** `scripts/check-bundle-size.ts:35-50` still carries the `/deckbuilder/build` exemption at **7.5 MB** because `DeckBuilder.tsx` imports `cardData` directly — the "temporary, mid-refactor in a parallel branch" freeze. The parallel refactor never happened; DeckBuilder.tsx instead **grew** 2,847 → 2,962 lines. The heaviest interactive surface in the app still ships the whole card database, now 9.5 MB (`src/data/cards.json`, up from 7.99 MB at plan time). |
| U6 `@ts-nocheck` ratchet | Shipped `ba4f1a5` | **MECHANICALLY HELD, CULTURALLY LEAKING** | Ratchet + `tsc --noEmit` both in CI (`ci.yml:26-28`); baseline file current (576 = live count, verified by replicating the scan). But the baseline was **bumped upward four times**: 551 → 571 (`b66636bf` "reconcile"), 570 → 572 (`fbfcb378` deck-image renderer), 577 → 578 (`6ac76cfa` "Swiss integration"), then 578 → 576 (`5d4e41ca` middleware removal). Net: **+25 files of new unchecked code since the ratchet landed.** The guard blocks accidental drift; it does nothing about deliberate `--update` bumps, and new feature files routinely ship with the header. |
| U7 Migrations fail-fast | Shipped `1217b57` | **HELD, and better** | Both layers fail fast in prod (`server.ts:42-73`; `scripts/migrate-on-deploy.ts` tail), `ALLOW_STALE_SCHEMA=1` break-glass documented in both, and the decision function was extracted to a tested module (`lib/migrationPolicy.ts` + `lib/migrationPolicy.test.ts`) exactly as the plan's test scenario asked. |
| U8 N+1 + rate-limit IP | Shipped `993829b` | **HELD** | Draft GET uses single LEFT-JOIN queries (`app/api/draft/[shareId]/route.ts:39,65,86`); `lib/rateLimit.ts` reads the rightmost `TRUST_PROXY_HOPS` XFF entry (`:7-9,45,52-65`) with the per-process limitation documented. |

**Corrected status for the prior plan: `status: done` stands.** The reconciliation note
added to that doc (this pass) records the two asterisks: the U5 exemption and the U6
baseline creep — both now owned by units N1 and N2 below.

## Delta Audit — what's NEW since 2026-06-11 and the debt it carries

Churn hotspots (commits touching file since 2026-06-11): `cards.json` ×46 (bot syncs),
`app/pool/[shareId]/deck/play/page.tsx` ×46, `YourStats.css` ×45, `MatchCard.tsx` ×28,
`MetaDashboard.tsx` ×24, `MatchmakingPanel.tsx` ×21, `stats/me/gameplay/route.ts` ×19,
`liveGames.ts` ×17.

1. **Live Swiss Practice orchestration** — `src/services/matchmaking/` (7,234 lines
   total; `liveGames.ts` 2,345), migrations 054/055/072 (`practice_rounds`,
   `practice_matches`, `practice_match_games`), plugin routes under
   `app/api/plugin/v1/`. **Well-built**: typed (not in the nocheck baseline), heavily
   tested (`liveGames.claim.test.ts` 822 lines, `liveSwissJourney.test.ts` 766, plus 3
   dedicated e2e specs), uses U1/U2 primitives. Debt: (a) `liveGames.ts` is already the
   repo's largest service file with a state machine, claim logic, recovery, and
   broadcast concerns interleaved; (b) the extension→hub→PTP HTTP pipeline
   (`SWISS_PRACTICE_HANDOFF.md`) crosses three deploys with hand-duplicated payload
   shapes and **no pinned contract** — unlike the swuapi boundary, which got exactly
   this treatment in June (see 3). Session-long live-debugging was needed to find
   env/migration mismatches between the repos; a pinned fixture would have caught the
   shape halves cheaply.
2. **Collation engine (ASH/LAW line+stacking)** — `src/belts/` (~30 files incl. new
   `BaseBelt`, `Set7PlusUc3OutcomeBelt`, common-belt assignments), calibrated against
   real ASH box data with deterministic distribution guards in `npm run qa`
   (`87e45b04`). Parity-mode knob removed (`7fff9339`) — duplication now emergent.
   This is swupod's legitimate own domain (per the family megaplan) and it's guarded.
   Debt is typing only: the belts are in the nocheck baseline.
3. **swuapi boundary (megaplan I-F) — materially improved, one leg missing.**
   - **F4 contract pinning: done and exceeded.** `contract/swuapi-contract.json`
     pinned; `scripts/fetchCards.ts` validates every `/export/cards` row against it
     before writing (`fetchCards.ts:6-11,157-178`); an **hourly GitHub Actions sync**
     (`.github/workflows/sync-swuapi-cards.yml`) fetches, validates
     (`npm run test:data` + ASH placeholder catalog test), diffs semantically, and
     commits `chore(cards): sync from swuapi`. The frontText/unique bug fix landed
     (megaplan decisions-queue 6).
   - **F1 fix-layer upstreaming: the megaplan's framing is stale.** The "fix layer" is
     not ~3,750 hand-entries; it is **0 individual fixes, 8 batch variant-flag
     derivations, and 3 transforms** (`scripts/cardFixes.ts:76-222` — variant→flag
     mapping, promo-variant filtering, token filtering, boolean normalization). The
     ~3,750 was rule-application count. What remains is honestly borderline: variant
     flags *should* come from upstream, but the local layer is 150 declarative lines
     with tests. Low-priority upstream candidate, not a canonicalization emergency.
   - **F2 set-metadata single-sourcing: NOT done.** `src/utils/setConfigs/` is 1,068
     hand-maintained lines across 9 sets (ASH.ts added since the audit);
     `isBeta`/`isPrerelease`/`isReleased` remain local date comparisons
     (`setConfigs/index.ts:131-152`). Collation config (belts, pack rules) is
     legitimately local; `prereleaseDate`/`releaseDate`/card counts duplicate swuapi.
   - **F3 ASH placeholder containment: followed.** `src/services/cards/
     ashPlaceholderCatalog.ts` + `cardCatalogResolver.ts` are the single resolver
     chokepoint, both tested, and the sync workflow tracks real-vs-placeholder counts.
4. **Import-pool dual extraction** — deterministic OMR pipeline in production
   (`src/services/importPool/`, 13 files, all `@ts-nocheck`) plus an agentic
   prototype (`lib/agenticExtract.ts`, 415 lines) selectable via `EXTRACT_ARCH`
   (`d27d29b7`) with an eval harness. Two pipelines, one owner unclear; the cost plan
   (`plans/IMPORT_POOL_COST_PLAN.md`) parked the $1+/sheet agentic path. Acceptable as
   a deliberate A/B — but it needs an explicit sunset criterion, not indefinite dual
   maintenance.
5. **Personal / per-deck stats** — `app/api/stats/me/gameplay/route.ts` (1,175 lines,
   19 commits), `src/components/YourStats/` (large, see design plan). In-process TTL
   caches added (`lib/queryCache.ts`, `lib/statCache.ts`) — correct at single-container
   scale, documented. Debt: per-deck vs personal query logic duplicated across routes;
   the gameplay route is a god-file growing by accretion.
6. **Privacy unification — plan active, NOT implemented.** Five independent
   visibility flags across three tables still live
   (`pods.is_public`, `pods.is_log_public`, `pod_players.is_log_public`,
   `card_pools.is_public`, `card_pools.report_public`); the log read path ignores
   `pods.is_public` entirely (`app/api/draft/[shareId]/log/route.ts:79-96`) and the
   report path requires a five-way AND. Meanwhile migration 075 added a **sixth**
   flag (`observer_public`). This is live user-facing confusion and the flag count is
   going the wrong way.
7. **Forceteki limited runtime — plan-only, 0% implemented.** Zero `forceteki`
   references outside `docs/` and `plans/`. The 8-unit plan
   (`2026-06-23-001`) is `status: active` with nothing started; the interim
   architecture is the extension→hub→PTP pipeline (1). Biggest open architecture
   decision in the repo.
8. **Housekeeping drift.** `plans/` (31 informal docs) and `docs/plans/` (16 dated)
   still coexist — megaplan G5 unexecuted. Several dated plans are stale-`active`:
   live-swiss orchestration (shipped), live-swiss e2e strategy (specs exist), per-deck
   stats (shipped per release notes) all still say `active`. `middleware.ts` →
   `proxy.ts` migration is complete (no `middleware.ts` remnant).

## Second-guessing the prior plans (what their authors got wrong)

1. **"Done" was accurate but under-guarded on its own terms.** The repo philosophy
   says every fix ships a guard against the *class*. U5's guard (bundle budget) was
   correct, but the exemption mechanism it introduced had no expiry — a "temporary"
   entry survived 4 weeks and the refactor it was waiting on regressed (DeckBuilder
   grew). Exemptions need the same monotonic treatment as baselines: they may only
   shrink, and they should carry an owner/date that ages loudly.
2. **The ratchet was aimed at the wrong threat.** U6 assumed the risk was *accidental*
   `@ts-nocheck` reintroduction. The actual behavior: authors of new features run
   `--update` and commit "bump baseline" — four times in four weeks, +25 files. The
   binding rule Lee actually wants is "**new files ship typed**"; the ratchet should
   hard-fail when `--update` would *add* paths to the baseline (removals stay free),
   with an explicit env escape for the rare justified case.
3. **The contract-pinning lesson wasn't generalized.** The June work proved the
   pattern (swuapi contract pin caught the frontText/unique bug that had been silently
   wrong "since forever"). The Swiss Practice pipeline then built a *new* three-hop
   cross-repo boundary with zero pinning — and burned a long live-debug session on
   exactly the class of mismatch pinning prevents. Per Lee's standing rule the
   wayfinder⇄swupod integration stays hand-duplicated (no shared package, swupod wins
   ties) — but hand-duplicated is compatible with *fixture-pinned*: each side commits
   the same golden request/response fixtures and tests against them.
4. **The megaplan's I-F numbers went stale and nobody corrected the thesis.** The
   "~3,750-entry card-fix layer" framing overstates today's reality (11 declarative
   rules); conversely it *understates* setConfigs duplication, which grew a set. Update
   the thesis when facts change: F1 is now small-upside, F2 is the real remaining leg.
5. **Plan statuses are rotting again** — the same failure the 2026-06-11 megaplan G1/G2
   sweep fixed once. Statuses are cheap; stale ones are expensive (this audit spent
   real time re-deriving what shipped).

## New Initiatives (root-cause mapped)

| # | Initiative | Root cause it fixes |
|---|-----------|---------------------|
| N1 | Retire the DeckBuilder bundle exemption | "Temporary" exemption with no expiry; refactor-freeze inversion |
| N2 | Ratchet v2: no new `@ts-nocheck` files | Guard aimed at accidental drift, not deliberate bumps |
| N3 | Execute the privacy unification plan | Five (now six) visibility flags, read paths disagree |
| N4 | Pin the swupod⇄wayfinder practice contract | New 3-hop boundary shipped unpinned despite fresh proof of the pattern |
| N5 | God-file ratchet (megaplan H1, swupod leg) | DeckBuilder 2,962 / liveGames 2,345 / stats page 1,893 / play page 1,734 / gameplay route 1,175 — growth by accretion with no brake |
| N6 | setConfigs metadata single-sourcing (I-F F2) | Set dates/counts duplicated downstream; isBeta drift risk each set |
| N7 | Forceteki runtime: decide or park | `status: active` plan with 0% progress hides the real decision |
| N8 | Plan hygiene sweep (G5 + statuses) | Two plan conventions; stale `active` statuses misinform audits |

## Execution Order & Implementation Units

Order: **N2 → N1 → N4 → N3 → N5 → N6 → N8**, with N7 as a decision (not code).
Rationale: N2 is a 1-day guard that immediately stops the biggest ongoing leak; N1 is
the largest user-facing perf win; N4 protects the subsystem currently under heaviest
live iteration; N3 is user-facing correctness; N5/N6/N8 are structural hygiene that
can interleave.

- [ ] **N2. Ratchet v2 — new files ship typed.**
  - Files: `scripts/check-ts-nocheck.ts`, `scripts/check-ts-nocheck.test.ts`.
  - Change: baseline stays a *file list*; the check fails if any `@ts-nocheck` file is
    not in the baseline (as today), **and** `--update` refuses to add paths (only
    removals permitted) unless `RATCHET_ALLOW_NEW=1` with a `--reason "..."` recorded
    into the baseline header. CI unchanged otherwise.
  - Test-first: unit tests — new offending file fails with actionable message;
    `--update` with additions and no env fails; with env+reason succeeds and records;
    removals still demand baseline lowering.
  - Size: S (half-day).

- [ ] **N1. Retire the /deckbuilder/build exemption.**
  - Files: `src/components/DeckBuilder.tsx` (imports of `src/utils/cardData`),
    `src/utils/cardDataClient.ts` / `src/utils/cardCache.ts`, `scripts/check-bundle-size.ts`
    (delete `ROUTE_EXEMPTIONS['/deckbuilder/build']`), e2e `deck-builder.spec.ts`.
  - Approach: swap DeckBuilder's `getAllCards`-style static imports for the client
    loader (per-set fetch + cache) exactly as U5 did for the play page; loading state
    = skeleton (empty-state-vs-loading rule). Do NOT attempt the full
    REFACTORING_PLAN decomposition here — only the data-source seam.
  - Test-first: bundle-guard self-test asserting the exemption table is empty; e2e
    deck-builder spec stays green; record before/after first-load JS in the PR
    (expect ~7.5 MB → well under the 3 MB global cap).
  - Size: M (1–2 days; the import surface inside 2,962 lines is the risk).

- [ ] **N4. Pin the practice-pipeline contract (swupod side).**
  - Files: new `contract/wayfinder-practice-contract.json` (fixtures for
    `POST /api/plugin/v1/practice/match-game/lifecycle`, `POST /api/plugin/v1/match/result`,
    `GET /api/plugin/v1/practice/swiss-summary`, `GET /api/private/user-data` envelope),
    new `app/api/plugin/v1/contract-pin.test.ts`; mirror fixtures land in wayfinder
    (separate session — file a note, don't cross-commit).
  - Approach: golden request/response JSON per endpoint version; tests assert the
    route accepts the golden request and produces a response whose declared fields are
    present-and-typed. Include the **old-extension degradation case** as a first-class
    fixture (absent new fields ⇒ documented fallback), per the 0–48h forward-compat rule.
  - Test-first by construction. Size: M.

- [ ] **N3. Privacy unification (execute the existing 2026-06-21 plan).**
  - The plan is written; this unit is scheduling + one scope amendment: fold the new
    `pods.observer_public` (migration 075) into the same single-source model rather
    than leaving it as flag #6.
  - Test-first: the plan's own matrix tests (public pod ⇒ log+report visible without
    per-surface flag fiddling; private stays private; override paths).
  - Size: L (owned by that plan; tracked here for ordering only).

- [ ] **N5. God-file ratchet.**
  - Files: new `scripts/check-file-size-ratchet.ts` + baseline (top offenders pinned
    at current line counts: `DeckBuilder.tsx` 2,962, `liveGames.ts` 2,345,
    `app/stats/page.tsx` 1,893, `app/pool/[shareId]/deck/play/page.tsx` 1,734,
    `app/api/stats/me/gameplay/route.ts` 1,175), CI step.
  - Rule: listed files may only shrink; unlisted files may not exceed 1,200 lines.
    Decompose-when-touched, no big-bang.
  - Test-first: unit tests on the ratchet logic (same shape as N2). Size: S.

- [ ] **N6. setConfigs metadata single-sourcing (I-F F2).**
  - Files: `scripts/fetchCards.ts` (also fetch `/export/sets` or `/metas` per the
    pinned contract), `src/utils/setConfigs/*.ts` (dates/counts become consumed
    metadata; belts/pack-rules stay local), `src/utils/setConfigs/index.ts`
    (`isBeta`/`isPrerelease`/`isReleased` read consumed dates), contract pin extended.
  - Pre-req: upstream swuapi `/sets.release_date` null-clobber fix (megaplan S-R3) —
    verify upstream first; if unfixed, this unit blocks and says so loudly rather than
    adding a fallback (one path, no fallbacks).
  - Test-first: LAW/ASH config tests keep passing with consumed dates; a drift test
    asserting local config carries no date a consumed registry provides. Size: M.

- [ ] **N8. Plan hygiene sweep.**
  - Re-status stale dated plans (live-swiss orchestration, live-swiss e2e strategy,
    per-deck stats → verify each against code, mark done/superseded with a dated
    note); sweep `plans/` informal docs into dated/archived status per megaplan G5.
    CRITIQUE_REMEDIATION.md is superseded by the design refresh plan (002).
  - Size: S (doc-only).

- [ ] **N7. Forceteki runtime — decision gate (Lee).** No code. See Open Questions.

## System-Wide Impact

- N1 changes DeckBuilder's data timing (fetch vs bundled) — the play page already
  proved the loader path; risk is confined to initial-load skeletons and offline dev.
- N2/N5 add CI steps; both <10 s, both with escape hatches that leave an audit trail.
- N4 formalizes shapes the published extension already sends — no behavior change,
  pure regression armor; must encode old-extension fallbacks, never require new ones.
- N6 changes where set dates come from; a wrong consumed date would flip beta gating,
  hence the drift test and the loud-block posture on the upstream pre-req.

## Verification & Smoke Test

```bash
# Node (repo default node is too old elsewhere in the family; swupod handoff says 20.x)
nvm use 20

# Unit tests (node:test via tsx; DB-backed suites need POSTGRES_URL to a local pg)
npm run test

# Type + ratchet + bundle guards (same as CI)
npm run typecheck
npm run check:ts-ratchet
npm run build && npm run check:bundle-size

# Pack-generation distribution guards
npm run qa

# E2E (Playwright starts the dev server itself on :3000)
npm run test:e2e                      # full suite (34 specs)
npx playwright test deck-builder.spec.ts --project=chromium   # N1 focus
npx playwright test live-swiss-fake-companion.spec.ts         # N4 adjacency

# Dev server for manual click-through
npm run dev   # http://localhost:3000
```

Click-through smoke checklist (proves no regression + visible improvement):
1. Landing → create solo draft → open pack, pick to completion (U2 regression canary).
2. `/deckbuilder/build` cold-load with devtools Network open: first-load JS **< 3 MB**
   and no `cards.json`-sized chunk (N1's visible win); build a deck, filters work.
3. Two browsers, one incognito: chat in a pod lobby — identity shows the logged-in
   username regardless of client payload; anonymous socket can watch, not chat (U3).
4. Create a public pod → draft log and report visible to a logged-out viewer without
   touching per-surface toggles (N3's visible win; today this FAILS — that's the point).
5. Swiss practice: seed via `app/api/test/live-swiss/seed`, claim a game, post a
   lifecycle event with the golden fixture body, confirm 200 + opponent Join surfaces
   (N4 fixture doubles as the manual probe).
6. `git commit` a scratch file with `// @ts-nocheck` → `npm run check:ts-ratchet`
   fails naming it; `--update` refuses to add it (N2's visible win).

## Open Questions for Lee

1. **Forceteki runtime (N7):** commit to U1 (fork baseline + smoke gate) this cycle,
   or re-status the plan to `paused` until after ASH release? The interim
   extension→hub pipeline works but caps replay/analytics completeness — and its debt
   (N4) is worth paying either way.
2. **cards.json in git:** the hourly bot now writes ~19 MB of JSON (cards + raw) per
   changed sync — 46 commits in 4 weeks. Keep (simple, reviewable diffs, prebuild
   fallback) or move to build-time-fetch-only with the pinned contract as the
   committed artifact? Recommend keeping until it measurably hurts clone/CI times.
3. **Import-pool dual pipelines:** what's the sunset criterion for the deterministic
   OMR path vs the agentic path (`EXTRACT_ARCH`)? Cost target was <$0.10/sheet —
   pick a date to decide, or the dual maintenance becomes permanent.
4. **N6 pre-req:** is swuapi S-R3 (`/sets.release_date` null-clobber) fixed upstream
   yet? If not, does I-F F2 stay blocked or does swuapi work get scheduled first?
5. **liveGames.ts decomposition:** N5 pins it shrink-only; is the preferred seam
   state-machine vs recovery vs broadcast (my read), or defer entirely to the
   Forceteki decision since that plan reshapes match orchestration anyway?
