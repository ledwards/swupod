# Plan: Move the remaining pages onto the style guide

**Status:** draft, 2026-10-13
**Comps:** https://claude.ai/artifact/EKVRau8EqC6yJ9ptc2NyHF (55 page comps, theme switch on each)
**Out of scope:** play, Draft/Sealed setup, draft play and deck building (already done; see Workstream A). `/stats` and `/meta`. Done on main (Oct 15, `97a1e8c6`): alpha viewers get the themed `MetaPage` (`src/components/Meta/`); everyone else keeps `app/stats/LegacyStatsPage.tsx`. `/meta` re-exports `/stats`. Pages the Purrgil migration rebuilds (`/`, `/play`, `/history`, `/decks`, `/me`, `/watch`; see `plans/2026-10-12-purrgil-website-to-ptp.md` step 5).

## Decisions (Lee, 2026-10-13)

0. **Everything in this plan is alpha-only** (Lee, 2026-10-15). Every redesigned page, new flow, rename and redirect sits behind `viewerHasAlphaAccess()`; beta and regular users keep today's pages untouched until the alpha full rollout.

1. **Karabast comes back as a copy-link, not a flow.** Every "play" CTA goes to our table first. Next to it, a secondary **Copy deck link for Karabast**, with a light `PluginCTA` nudge ("get the Wayfinder plugin to keep your game data"). No plugin-driven navigation, no Karabast lobby creation, no paste-a-lobby-link UI. SWUDB stays dropped; import is SWUForge or JSON.
2. **Deck building is out of scope** (most delicate surface; Lee considers it done for now). Comps are reference only.
3. **"No Play for Prizes"** replaces "No Tournaments for Prizes" in the terms.
4. **One primary per view** as drawn in the comps (Rematch primary / Convert to Bo3 secondary; Find Opponent primary; Start New Swiss Rounds primary when it's the last action; Admin "Add" only).
5. **Removed controls stay removed:** Pack Wars "Peace", ← arrows, 🤖/🎉 emoji, scroll-to-top.
6. **Approved as drawn:** pools/import, draft follow-ups (observe, review, reports), Beta, Redeem, Gift, Support (badge fixed), Admin.
6a. **Out of scope, already done (Lee, 2026-10-15):** play pages, Draft/Sealed setup, draft play, deck building. See Workstream A.
7. **Alpha-dead pages aren't redesigned** and are removed at full alpha rollout (Workstream D3; the rollout plan owns it). Nothing is deleted before then.
8. **Needs a rethink before building:** `/formats`, Chaos Sealed / Chaos Draft, Rotisserie, Pack Wars / Pack Blitz, QA.

## Rules for every step

- Branch from current `origin/main`. The long-lived alpha branches are retired (Oct 15, `docs/operations/alpha-release.md`); main is the only integration and deploy source.
- Alpha-gated through `viewerHasAlphaAccess()` (`lib/viewerAccess.ts`); legacy pages keep serving everyone else until the alpha flow ships (`project_rollout_process_alpha_branches`). Prefer the existing `X` / `XLegacy` split the Draft and Sealed landings use.
- Theme roles only. `npm run check:design-tells` clean on every touched CSS file. View each page in Purrgil, Tatooine and FFG.
- Reuse before building: `Button`, `Modal`, `CardIcons`, `PluginCTA`, `ContentSkeleton`, `SearchInput` (now the one themed search field, `c5a67cf5`), `EntryShell`, `sp-*` landing classes, `ArtRows`, PodHub pieces.
- Page shell: title in the shared header via `SiteTitle`; no in-page header rows, no back buttons; `SiteFooter`.
- E2E through the UI only. Build before commit. No push without "push".

---

## Workstream A — Theme the remaining pages

The comp is the spec. Each wave is one branch/commit set, smallest blast radius first.

### Out of scope (Lee, 2026-10-15: already done, don't change)
- **Play:** `/play/*`, `/g/[shareId]`, `/pools/[shareId]/play` (+ `/ai`, `/swiss`, `/bracket`, `/practice`), `/runs/[runId]` (+ `/sideboard`), `/games/*`, `/play/runtime/*`.
- **Draft and Sealed setup:** `/draft`, `/sealed`, `/draft/setup`, `/sealed/setup`, `/draft/new`, `/draft/solo`, `/sealed/new`, `/sealed/pod`, `/sealed/[shareId]/pod`.
- **Draft play:** `/draft/[shareId]` (lobby, leader draft, pack draft), `/draft/[shareId]/pod`, `/draft/[shareId]/log`, `/draft/[shareId]/deck`, `/sealed/[shareId]`.
- **Deck building:** `/pool/[shareId]/deck` (+ `/[buildId]`, `/pools/…` aliases), `/deckbuilder`, `/deckbuilder/build`, `/pool/[shareId]/deck/stats`.

Their comps are reference only. **Shared stylesheets those pages use** (`SealedPod.css`, `ChatPanel.css`, `PackDraftPhase.css`, `LeaderDraftPhase.css`, `HostControls.css`, `EntryFlow/entry-flow.css`, `SharedPlay/shared-play.css`, `App.css`) **are not edited.** A page below that imports one of them overrides it in its own stylesheet, or switches to its own component.

### A1. Draft follow-ups
`/draft/reports`, `/draft/[shareId]/observe`, `/draft/[shareId]/review`.
- `/draft/[shareId]/review` is alpha-only but unthemed: it imports `App.css` and none of `draft-log.css`. Move it onto the Draft Log stylesheet.

### A2. Pools and import
`/pools/[shareId]` (+ `/pool/[shareId]`, `/draft_pool`, `/sealed_pool`), `/pools/new`, `/import`.
- Build cards: aspect icons instead of aspect-colored leader names.

### A4. Browse
`/comps`, `/showcases`, `/sets/[setCode]`. (`/deckbuilder` and `/sets` share `SetSelection` with deck building, so they stay as they are.)

### A5. Admin and misc
`/admin`, `/admin/game-notes`, `/beta`, `/redeem`, `/gift/gc2026` (+ `/black`), `/support-the-pod`, `/maintenance`, `/creator/voice-pack/[token]`, `/connections/melee`, `/privacy-policy`, `/terms-of-service` (with "No Play for Prizes").

---

## Workstream B — Redesign the alternate formats (new comps first)

**Problem.** Draft and Sealed walk players through one pattern; the alternate formats each break it differently (research, 2026-10-13):

| Format | Solo | Friends | What's wrong |
|---|---|---|---|
| `/formats` hub | — | — | Legacy card grid; decides solo vs live for Chaos Draft *before* setup (two cards); legacy history list |
| Chaos Sealed | yes | **no** | No "Who's playing?" step; straight to a pool |
| Chaos Draft | yes (`/formats/chaos-draft`) | yes (`/draft/chaos`) | Two separate pages with different limits (4 vs 12 packs), defaults, and Event Pack support; same localStorage key |
| Rotisserie | via Add Bot | via share link | **No setup step**: creates the draft on page load, then everything is edited in the lobby (why the comp looked empty) |
| Pack Wars / Blitz | pool only | **no** | Pool → Tabletop Simulator JSON; no in-app opponent (Workstream C) |

**Reuse, don't modify:** the formats compose the finished Draft/Sealed setup, lobby, pod and play components as they are. If a format needs something they don't do, it gets its own component; the done pages aren't changed.

**The canonical pattern** (Draft/Sealed alpha; `EntryShell`, `EntrySetup.tsx`, `DraftLanding.tsx`, `limited-landing.css`):
1. Pick the format → 2. pick set(s)/packs → 3. **Who's playing?** `Practice Solo` / `With Other Players` → 4. options (friends: Public/Private; format extras) → 5. summary sidebar (`EntryPackFan`, Format / Table / Next up) with one primary (`Start practice …` / `Create pod`) → 6. lobby / pod (`DraftLobby`, `SealedPodLobby`, `PodHub`) → 7. play (`OpponentChoice`, `PlayWorkspace`) → 8. history rows (`ArtRows`).

### B1. `/formats` hub → `/other-formats`
**Rename (Lee, 2026-10-15):** the hub moves to `/other-formats`, alpha-only. Alpha viewers hitting `/formats` or `/formats/*` are redirected to the same path under `/other-formats` (query string kept); non-alpha viewers keep `/formats/*` exactly as today. Update in-app links (`app/formats/page.tsx` card paths, `LandingPage`, `AuthWidget`, anything grepping `'/formats`) only on alpha surfaces, and grep `play-home/` and the Purrgil repo for `/formats` links before switching. When alpha reaches everyone, `/formats/*` becomes a permanent redirect shim (listed in D2's shims).
One tile per format (Chaos Sealed, Chaos Draft, Rotisserie, Pack Wars, Pack Blitz), each with its pack fan and a one-line "how it plays". Solo vs friends is **not** chosen here. Below: "Your Format Pools" as `ArtRows` (Resume / Build deck / delete), plus `LiveStrip` for live chaos/rotisserie pods.

### B2. Chaos Sealed + Chaos Draft → one setup each, on the canonical pattern
- **One Chaos Draft setup** (merge `/formats/chaos-draft` and `/draft/chaos`; redirect the loser). Who's playing? Solo → 7 bots + `startDraft`; Friends → `createDraft({draftMode:'chaos'})` with Public/Private, bot fill and `AFTER_DRAFT_CHOICES` like `DraftLanding`. One pack limit, one default, Event Packs in both.
- **Chaos Sealed gets Friends.** Solo → `/pools/new` style; Friends → a chaos pod. Needs chaos support in `POST /api/sealed` (check `playSetupPath({limited:'chaos'})`, which already exists for queueing).
- **Replace the PackSelector multi-select** with a "build your packs" picker that has one source of truth:
  - Pack count lives in the summary sidebar only (not in a subtitle, the grid title and a slot strip at once).
  - Tapping a set adds a pack; tapping a chip in the summary removes it. Order is the summary's order.
  - Shrinking the count never silently drops picks: block it, or ask.
  - Event Packs are just more packs in the same list, with the entitlement lock shown in place.
  - Keep `PackSelector` single-select for anything else that uses it.
- New comps for both before building (Lee hated the current ones).

### B3. Rotisserie gets a setup step
Setup on the canonical pattern: sets (multi), Who's playing? (Solo with bots / Friends), visibility, mode (Entire Pool / Fixed Picks), timer. Create only on the primary. The `[shareId]` lobby keeps seats, invite link and Add Bot, but stops being where settings are first chosen. Signed-out users see the setup and get sign-in on create, not a redirect on page load.

### B4. Pack Wars / Pack Blitz
Setup on the canonical pattern (pick set → Who's playing?). The room page becomes "your sealed packs → Play" and hands off to Workstream C. Until C lands, the Play step offers: **Play vs the AI** (when C1 ships) / Copy deck JSON for Tabletop Simulator / Copy deck link for Karabast.

*Done when:* every alternate format reaches play in ≤ 5 steps with the same step names as Draft/Sealed, and each supports Solo and Friends (Pack Wars/Blitz Friends arrive with C4).

---

## Workstream C — Pack Wars and Pack Blitz on our table (spec)

We own the engine, so these can be played on-platform. Integration seam (research, 2026-10-13): extend the **solo-AI run path** (`lib/play/soloAi.ts` `launchSoloAi`, `soloSideboard.ts` Bo3 runs), not a new launcher.

**Today's blockers**
- PTP refuses these pools in four places: `src/services/play/native/decks.ts:114` (`unsupported_format`), `savedDeck.ts` `validateSavedDeck` (`unverified_source`), `deckVersions.ts:115` (`deck_too_small` < 30), `formats.ts` (`poolType: draft|sealed`).
- The pack routes (`app/api/formats/pack-wars|pack-blitz/route.ts`) write no `ptp_native_pool_evidence`, so the pool isn't verifiable.
- **Purrgil runtime hard-codes a 30-card minimum** (`purrgil/crates/purrgil-runtime/src/main.rs:236-243`). `Create`/`Deck` are `deny_unknown_fields`, so format rules need a runtime change.
- **Baize always charges aspect penalties** (`rules.rs:631`); the only waivers are card grants. "No aspect penalties" needs a Baize matchup flag, journaled so `Match::restore` replays it. The AI's features assume penalties exist.
- Results today come only from the Wayfinder plugin; Bo3 is honor-system.

**Phases** (smallest shippable first)
1. **C1 — Pack Wars vs the AI, single game, penalties on (alpha, labelled "aspect penalties apply — beta").**
   PTP: write pool evidence at generation; snapshot builder = leader + base picked from the pool, deck = every other card; allow `pack_wars` in the AI single-game path.
   Purrgil: optional `minDeckSize` on `Create`, journaled; no 30 floor when set.
   Opponent: Leebo opens his own 2 packs (`leeboPoolDeck` variant).
2. **C2 — Best of three vs the AI.** Reuse `ptp_solo_ai_runs`; "sideboarding" becomes "choose leader/base for the next game" through the existing gateway sideboard hook. Record W/L on the pool (`WldBadge`).
3. **C3 — No aspect penalties.** Baize `ignore_aspect_penalty` matchup flag → runtime `Create.rules` → journal + replay. Spot-check AI strength.
4. **C4 — Play a friend.** `pack_wars` / `pack_blitz` contract kinds in `formats.ts` (`limitedCompatible` on set + pack count); private invitations + rematch (`privateMatches.ts`, `rematches.ts`); optional public queue.
5. **C5 — Pack Blitz.** Same path with 1 pack (~14 cards). Confirm whether the "4-card hand, no mulligan" rule in `CASUAL_MODE_PLAN.md` is real; the engine only has base-driven hand/mulligan deltas.

**Risks:** unsupported cards in a pack refuse the whole pool (needs a clear message, or a re-roll); tiny decks deck out fast (engine handles it); the Baize change crosses repos (Purrgil lands via PRs to main; Baize may need a fork or upstream PR).
**Docs to update when C1 lands:** `docs/operations/native-play.md`, `src/services/play/native/README.md` (both say draft and sealed only), `plans/CASUAL_MODE_PLAN.md`.

---

## Workstream D — Dead pages

**Rules (Lee, 2026-10-14):**
- **Nothing is deleted while legacy and alpha run side by side.** This section lists; it doesn't remove.
- **Alpha-dead pages (D3) are not redesigned.** They get bug fixes only, and they're removed when alpha rolls out to everyone. The **alpha full-rollout plan** owns that removal (not written yet; this list is its input).

Method: every `app/**/page.tsx` (119), scripted for redirects, alpha branches, legacy fallbacks and re-exports; then a grep for inbound links in `app/`, `src/`, `lib/`, `proxy.ts`, **and outside the app**: the homepage source (`play-home/`, now in this repo; built to `public/play-home/`), tests, and the Purrgil repo (the game table sends players back to PTP URLs). The first pass skipped the outside sources and wrongly marked `/meta`, `/limited/*` and `/play/ai` dead.

### D1. Bug for the Play owner (not fixed in this plan)
- **`/games/[matchId]/replay` leaks to production.** `playLedger` (464/563) uses the stub runner's replay URL as the default `replayUrl` when a match has none. Never fall back to it in production; real replays come from Purrgil records.

### D2. Dead now
Nothing is 100% dead today, so nothing is removed now.
| Route | Status | Why it isn't safe to remove |
|---|---|---|
| `/pools/[shareId]/play/practice` | **Only real candidate.** No inbound links anywhere | Added 5 days ago with "Competitive Practice Mode on Play" (22712843). Lee: is it unfinished, or superseded by EntryPlay's Swiss/Bracket buttons? |
| `/play/test`, `/play/runtime/[matchId]` (+ `/replay`), `/games/[matchId]` (+ `/replay`) | Dev-only by design (`PTP_NATIVE_PLAY_ENABLED`, `PTP_PLAY_LOCAL_RUNTIME_STUB`) | Local testing uses them, and D1 has to land first |
| `/draft/setup`, `/sealed/setup` | Unreachable: their only links are in `EntryFlow/EntryHome.tsx`, which isn't rendered, and `/limited/[mode]` | They're the canonical alpha setup step; Workstream B decides whether to wire them in |
| ~~`/meta`~~ | **Live:** the alpha homepage links it (`play-home/home/HomePage.tsx:54`, "Meta · Card and leader stats") | — |
| ~~`/limited/[mode]`~~, ~~`/play/ai`~~ | **Live:** Purrgil's `GameResult` "find opponent" sends players to `/limited/ai` → `/play/ai`, and `server/matches.mjs` allow-lists `/limited/swiss`, `/limited/bracket` as return URLs | — |

**Old-URL redirect shims** (no inbound links; external links may exist): `/formats/*` → `/other-formats/*` once B1 ships, `/casual`, `/casual/chaos-draft`, `/solo`, `/solo/draft`, `/solo/chaos-draft`, `/multiplayer`, `/sealed_pool/[shareId]`, `/lobby/[...view]`. Keep; check traffic before removing.
**Internal-only routes** (not dead): `/draft_pool/[shareId]` is rendered by `/pools/[shareId]`; `/style-guide` is the alpha design reference.

### D3. Dead once alpha is everything (not redesigned; removed at full rollout)
These serve only non-alpha users today: the alpha branch redirects away or renders something else.
| Route | Alpha users get | Goes away with |
|---|---|---|
| `/lobby` | Redirect to `/` or `/play` | Legacy lobby (`LobbyHome`, `LobbyBoardSection`) |
| `/lobbies`, `/lobbies/[lobbyId]`, `/matches/[matchId]`, `/play/native` | Redirect to `/play` (match links still open the old native table) | Legacy native play (`docs/NATIVE_PLAY_LEGACY_RETIREMENT.md`) |
| `/play/solo` | Redirect to `/limited/swiss` or `/play` | `SoloEntry`. First move its OAuth return-URL repair, and drop `/play/solo` from Purrgil's return allow-list (`server/matches.mjs`, `GameResult.tsx`) |
| `/draft/[shareId]/report`, `…/report/[poolShareId]` | Redirect to the Draft Log | Legacy report pages |
| `/pool/[shareId]/deck/play` (+ `/pools` alias) | Redirect to the play route | `LegacyDeckPlay` |
| `/sealed/pod` | Not linked from alpha Sealed (only `LandingPage` and `/sealed/new`) | Confirm alpha has its own create-pod path first |

**Legacy halves of alpha-branched pages** (the route stays, the legacy component goes): `LegacyHome` + `LandingPage` (`/`), `DraftLandingLegacy` (`/draft`), `SealedLandingLegacy` (`/sealed`), the legacy Draft Log and pod views (`/draft/[shareId]/log`, `/pod`), `HistoryPage`'s legacy view and `MePage` (`/history`, `/me`; these merge into the Purrgil-migration rebuilds), and `/qa`'s legacy branch.

**Effect on Workstream A:** nothing in D3 is themed or redesigned.

### D4. Other findings
- Two access gates disagree: `/play` gates server-side on `viewerHasAlphaAccess`, EntryFlow pages gate client-side on `useBetaExperience`. A user can pass one and fail the other. Pick one gate before alpha GA.
- After alpha GA, re-run this audit; the `PlayHomepage` routes (`/`, `/play`, `/history`, `/decks`, `/me`, `/watch`) change hands in the Purrgil migration and may leave more legacy behind.

## Workstream E — QA redesign (new comp first)

Inspiration from the stats pages. Reuse, don't redraw:
- **The new themed Meta page first** (on main Oct 15): `src/components/Meta/` — `MetaPage` shell (set tabs, sections), `MetaBits`, `LeaderTiles`, `CardArtList`, `MetaOverview`, `meta.css` (theme roles throughout), plus `YourStats/UsagePieChart.tsx` and `hooks/useStatsJson.ts`. Match its look so QA reads as Meta's sibling.
- **Observed vs expected bars** with the expected rate as a dashed outline: `OverlayRow` / `CostCurve` / `LabelChips` in `src/components/DeckBuilder/DeckStats/StatsCharts.tsx` (the A+++ overlay pattern; CSS `DeckStats.css:105-153`, still on legacy tokens).
- **Verdict badges and "show the math":** `RegimeBadge` + math table in `src/components/YourStats/LuckPanel.tsx`; `LuckHistogram.tsx` `DuplicateRateWidget`.
- **KPI tiles:** `Kpi` in `DeckStatsModules.tsx:26` (export it).
- **Shell:** stats set tabs + date range; skeletons from `SkeletonTableRows` etc.

**Page order:** set tabs (Overall first) → health strip of `Kpi` tiles (packs, quality score, rates in tolerance x/y, structure x/y, tests passing) → Overall: one pass/watch/fail tile per set (group test names by set prefix), failing tests listed, full list collapsed → per set: Rate Validation as overlay rows + `RegimeBadge` + math drawer → foil rarity distribution as overlay rows with `RarityLabel`, χ² verdict in the drawer → structural checks as a chip grid (table only on failure) → Duplicates (actual vs simulated headline, estimate ladder as overlay rows) → Packs evidence behind its own tab → Methodology (today's Reference tab) collapsed at the bottom.
**Cleanup with it:** `app/qa/page.tsx` is one 1,490-line `@ts-nocheck` file with inline hex colors and raw `<button>`s; split it into components and move styles to theme roles. Only the `pack_generation` suite writes `src/qa/results.json` today, so other `npm run qa` suites are invisible on the page (decide whether to wire them in).

---

## Order

1. D1: hand the replay-URL leak to whoever owns Play (it's in the play code, which this plan doesn't change).
2. A1 draft follow-ups → A2 pools/import → A5 admin/misc → A4 browse.
3. B and E: new comps → review with Lee → build.
4. C1 → C2 → C3 → C4 → C5, alongside B4.
5. No deletions here. At alpha full rollout, the rollout plan removes D3 (and any D2 entries confirmed dead), after re-running this audit.

## Open questions

- Chaos Sealed with friends: new `chaos` support in `POST /api/sealed`, or reuse the chaos draft pod with a "sealed" mode?
- Pack Wars/Blitz Friends play before C4: do we offer Karabast copy-link as the friends path in the meantime?
- QA: public (footer-linked today) or admin-only after the redesign?
- Exact copy for "Copy deck link for Karabast" and the plugin nudge.
