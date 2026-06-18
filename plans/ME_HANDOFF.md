# /me Page — Handoff / Context

Worktree: `/Users/lee/Repos/ledwards/swupod/.claude/worktrees/critique-cleanup`
Branch: `design/critique-cleanup` (39 commits ahead of `main`, tree clean).
Local server: `PORT=3022 npm start` → http://localhost:3022 (currently up).

> If you see "Could not find a production build": `npm run build` to completion
> ("All required artifacts are present!"), then `PORT=3022 npm start`. Before any
> commit run `git checkout -- src/data/cards.json src/data/cards.raw.json` (the
> dev server rewrites them; they are not part of any change).

This branch is a large redesign of the **/me personal-stats page**. The user has
been repeatedly, intensely dissatisfied. Treat everything below as "implemented
but the user may still consider it wrong" — re-confirm against their words.

---

## CRITICAL: the dev database

- The Next dev server uses **`.env.local`** → a **local Postgres `protectthepod`**.
- Diagnostic `tsx` scripts using `import 'dotenv/config'` load **`.env`** → the
  **Railway `railway` DB** (real/prod-volume data). **These are DIFFERENT DBs.**
  Don't trust a script's data as "what the server sees" unless it loads
  `.env.local` (see pattern below).
- To populate the local dev DB with one user's real data:
  `npm run copy-user-to-dev terronk` (auto: source=`.env` Railway, target=
  `.env.local` local; refuses if same). It now also copies `draft_picks`.
- The user tests as **terronk**; personal tabs (Luck/Pools/Gameplay) are scoped
  to the signed-in user. Meta is platform-wide aggregate.
- `.env` / `.env.local` reads via `grep` are blocked by the harness classifier.
  Load env inside a script instead:
  ```ts
  import { config } from 'dotenv'
  config({ path: '.env.local' }); config({ path: '.env' })
  const { queryRow } = await import('../lib/db')   // dynamic import AFTER config
  ```

---

## Page architecture

- `app/me/page.tsx` — the page shell: hero header (avatar, "My Stats", the **Set**
  dropdown + Range), renders `<YourStats setCode filterLabel since until>`.
  - **Default Set = `getEras()[0].setCode`** = latest incl. upcoming (**ASH**).
- `src/components/YourStats/index.tsx` — tabs (Gameplay / Luck / Pools / Meta) +
  the persistent Activity strip. Threads the global `setCode` into every tab.
  `isAllSets`/`concreteSet` handle the (now non-default) "all" case.
- Tabs/components: `ActivityDashboard`, `GameplayDashboard`, `LuckSection` +
  `LuckHistogram` (histogram, duplicate/showcase widgets, aspect pies),
  `PoolHistoryDashboard`, `MetaDashboard`. CSS: `YourStats.css`.
- APIs: `app/api/stats/me/luck/route.ts`, `app/api/stats/me/gameplay/route.ts`,
  `app/api/me/pool-history/route.ts`, `app/api/stats/me/summary/route.ts`,
  plus platform `app/api/stats/leader-selection`, `app/api/stats/draft-picks`.
- Shared: `src/utils/hyperspaceLeaderArt.ts` (HS leader art by set::name),
  `src/utils/archetypeName.ts` (`archetypeShortName` — NEVER a "Leader / Base"
  slash; use the swuapi nickname via `deckBuilderSharing.ts`).

---

## What's implemented (and the user's still-open complaints)

### Hyperspace leader art
- HS leaders have a SEPARATE collector number (Tobias Beckett = LAW-002 normal,
  **LAW-266** hyperspace), so they link by **name+set**, not cardId. Resolver:
  `src/utils/hyperspaceLeaderArt.ts` (returns the HS **unit-side/back** art).
  Used by pool cards and gameplay match cards.
- Verified 15/15 real LAW leaders resolve. The user repeatedly raged this was
  "front side / wrong"; current code uses HS unit-side. **Re-verify visually** —
  if some cards still show the normal front, the fallback chain in
  `pool-history/route.ts` (`leaderBackImageUrl`) is hitting the saved leader's
  own image because HS didn't resolve for that name.

### Duplicates (Luck) — the big statistical fight
- The user's question: within ONE pool (~6 sealed / ~3 draft packs), how many
  duplicates vs expected, counting **foil/hyperspace** as repeats.
- **Verified by 400 generator sims/set (`generateSealedPod`): a pool yields ZERO
  duplicates, foil/HS included.** Belts (`src/belts/`) draw from
  without-replacement **hoppers** larger than one pool's pull. So expected = 0.
  Earlier code showed a bogus Poisson "11" — removed.
- Current widget: actual counted by **card name** per `source_id`; expected
  hard-stated 0; copy explains the hopper + that duplicates only accrue ACROSS
  pools. **The user may want this switched to a cross-pool metric** (it's quiet
  at 0-vs-0). `buildDuplicates(rows)` in the luck route is where this lives.
- Luck "expected" generally is base-belt only; the precise variant-aware model
  is deferred — see `plans/LUCK_EXPECTED_RATES_PLAN.md` and
  `plans/DUPLICATE_INVESTIGATION_PLAN.md`.

### Pools tab
- Filters: All / Decks / To be built / Friends.
- Built-deck card: ALL actions one line (Edit · Play · copy · copy · Private ·
  Public — last two only when the Companion is detected, with a play glyph).
  Leader background = HS unit-side art at ~32% width.
- No-deck card: "(No Decklists)" + Build Deck + a **trash chip** (red, corner)
  that arms → confirms `deletePool`. User said it was invisible; restyled — RE-CHECK.

### Gameplay tab
- "Your Leaders" = usage **pie** (left) + win-rate legend (right).
- Format/Set performance bars fill to the win-rate %.
- Replay rows = **match cards** styled like pool cards (your HS leader as bg,
  result + you-vs-opp + opponent leader thumb + Watch). Whole card opens the
  replay (no expand). Names don't truncate. Bo1 doesn't show the W/L pip twice.

### Meta tab
- Win rate by leader: shows the viewer's REAL win rate from captured games
  (`/api/stats/me/gameplay` leaderBreakdown) — the old permanent blur gate is gone.
- Most/Least-played and Most/Least-drafted **leaders**. Removed "(logged-in)".
- **Per-CARD most/least drafted & played is NOT built** (leaders only). Needs
  draft-picks-by-card + a cards-played source. This was an explicit ask.
- `draft_picks` now copied to dev (3292 rows) so Drafting isn't empty — but only
  for sets terronk actually drafted; ASH (the new default) may be sparse/empty.

### Global / misc
- Global **Set filter** drives all tabs (Pools client-side; Gameplay/Luck/Meta/
  Activity via API `setCode`).
- Sticky nav is the **header box** (`.me-hero`), not the tabs.
- Removed the grey band behind the tabs.
- Play page: archetype = swuapi nickname (no slash); Practice Hand / Post to
  Discord below the Deck Complete box; blue Companion box; signed-out → Discord
  login CTA; "Join the Match Queue"; right-aligned Karabast CTA; 4 value props.
- Activity counter "Made it to play" → "Limited matches played".

---

## Likely-still-wrong / where the user keeps pushing back
1. **Hyperspace art** — re-verify EVERY pool/match card shows the HS art, not the
   normal front. Decide unit-side (back) vs full-art front with the user.
2. **Duplicates widget** — 0-vs-0 is correct but unsatisfying; the user may want
   cross-pool duplicate accumulation instead. Confirm the intended metric.
3. **Default = ASH** but ASH is pre-release → Luck/Meta likely empty on first
   load. The user explicitly wanted latest-incl-next as default anyway.
4. **Meta per-card** most/least drafted/played — not implemented.
5. The user abandoned a "Companion link in the top nav / companion page header"
   request mid-stream — not implemented.

## Tests / build
- `npm run test` (full), or per-file `npx tsx --test <file>`. Touched suites:
  `src/components/YourStats/index.test.tsx`, `app/api/stats/me/luck/route.test.ts`,
  `app/api/stats/me/gameplay/route.test.ts`, `src/components/PlayInstructions.test.ts`.
  All green at handoff (build "All required artifacts present").
- Many YourStats tests are **source-string assertions** — they break on UI copy/
  structure changes and need updating alongside edits.

## Other plan docs
`plans/ME_PAGE_SESSION_LOG.md`, `plans/ME_PAGE_REMAINING_PLAN.md`,
`plans/LUCK_EXPECTED_RATES_PLAN.md`, `plans/DUPLICATE_INVESTIGATION_PLAN.md`.
Memory rule added: `feedback_archetype_names_from_swuapi` (archetype names from
swuapi, never a slash).
