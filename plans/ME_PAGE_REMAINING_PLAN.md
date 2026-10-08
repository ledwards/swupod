# /me Page — Remaining Work Plan

Branch: `design/critique-cleanup`. Companion: `/Users/lee/Repos/ledwards/wayfinder`.
See `plans/ME_PAGE_SESSION_LOG.md` for what already shipped.

Three workstreams remain, independent and rankable. Recommended order: **C (Luck) → A (art) → B (lobby buttons)**, because C is the highest user value and A/B are smaller plumbing tasks that touch the extension.

---

## A. Pool card artwork

**Goal:** no-deck pools use **set art**; built-deck pools use **unit-side hyperspace** (landscape) leader art instead of the portrait default.

**Why it's not a one-liner:** `/api/me/pool-history` (and `PoolHistoryItem`) currently send only the leader's default image URL. The unit-side hyperspace variant and the set art are separate URLs.

**Steps**
1. **API** — in the pool-history route (find via `grep -rn "pool-history" app/api`), add to each build:
   - `leaderArt`: the leader's **unit-side hyperspace** image (landscape). Source from `cards.json` by leader card id; pick the hyperspace + unit-side variant. Confirm such a URL exists for every leader; fall back to current portrait if not.
   - For the **pool** (no-deck case): `setArt` — the set's pack/box art. There's existing pack art per set (see `reference_pack_art_sourcing` memory / `public/` set art used elsewhere). Reuse the same asset the pack-opening UI uses.
2. **Type** — extend `PoolHistoryItem` / build type in `PoolHistoryDashboard.tsx` with `leaderArt?: string` and `setArt?: string`.
3. **Component** — `PoolBuildCard`: built-deck card backgrounds use `leaderArt` (landscape crop); `--empty` no-deck card uses `setArt`. Keep the existing `LeaderThumb`/placeholder fallback.
4. **Verify** both old and new sets; verify a leader with no hyperspace variant falls back cleanly.

**Files:** `app/api/.../pool-history*`, `src/components/YourStats/PoolHistoryDashboard.tsx`, `YourStats.css`.

---

## B. Wayfinder Private/Public Lobby buttons on pool cards

**Goal:** when the Companion is detected, each built-deck pool card shows two buttons: **(wf) Private Lobby** and **(wf) Public Lobby**.

**Why it's not a one-liner:** the create-lobby postMessages (`wayfinder:create-lobby` / `wayfinder:join-lobby`) are only listened for by the extension's **play-page** content script. `/me` is not a play page, so the buttons would no-op there.

**Steps**
1. **Extension** (`/Users/lee/Repos/ledwards/wayfinder`): make the site-wide `content-ptp-detect` script (or a new lightweight one matching `/me`) also handle `wayfinder:create-lobby` for a given pool/deck, OR have the buttons deep-link to the play page which already wires the message. **Deep-link is simpler and needs no extension change** — prefer it unless the user wants in-place lobby creation.
2. **Component** — in `PoolBuildCard`, gate the two buttons behind `useWayfinderDetection()`. Use `Button` with the wayfinder icon (see `WayfinderCompanionLockup` / existing wf icon asset). Private → create private lobby; Public → create/join public lobby.
3. **Verify** with the extension reloaded; `?wayfinder=1` to force-show for screenshotting.

**Decision needed from user:** deep-link to play page (no extension change) vs. in-place lobby creation (extension change). Default to deep-link.

**Files:** `src/components/YourStats/PoolHistoryDashboard.tsx`, possibly wayfinder `packages/extension-shared/src/content-ptp-detect.ts`.

---

## C. Luck tab redesign (largest)

**Intent (user's words):** "Think you're lucky or unlucky? Check here to find out." Replace the rarity panel + aspect line-graph mouseover with a card-number histogram, a search box, duplicate-rate and showcase-rate widgets, and aspect icons.

### C1. Remove rarity tracking
Rarity per pack is fixed (except foil/hyperspace/UC-upgrade slots), so a rarity-distribution panel is noise. Remove the `rarity` `LuckPanel` from `LuckSection.tsx` and stop computing/sending `rarity` in `/api/stats/me/luck`. Keep the slot-based variance (foil/hyperspace) if anywhere — that's the only rarity-ish thing with real variance.

### C2. Card-number histogram (the centerpiece)
- **X-axis:** card number (collector number) within the set.
- **Bars:** colored by the card's aspect; **multi-aspect → gradient** across the two aspect colors.
- **Height:** number of times the user has hit that card.
- **Tooltip (mouseover):** card name + **delta from normal** (observed count − expected count for that card given packs opened) + a **plain-language variance verdict** ("within normal", "luckier than ~95% of players", etc.). Delta text uses a **consistent contrast color (black)** regardless of bar color.
- **MOBILE (rule: `.claude/rules/mobile.md`):** mouseover is desktop-only. The histogram must be usable with **taps** — tap a bar to pin the tooltip, or render a tap-reveal panel below. Do NOT ship hover-only.
- **Search box above the histogram:** typeahead that **greys out non-matching** card titles/bars (keeps them in place, dims them) rather than filtering them out.

### C3. Duplicate-rate widget
- Show **actual duplicate rate vs expected duplicate rate**. "Duplicate" = same card seen more than once; **counts across treatments** (normal + foil + hyperspace of the same card all count toward duplicates).
- **Explanatory copy:** people wrongly expect zero duplicates; explain the birthday-paradox-style math — with N packs and a fixed pool, duplicates are expected and here's the expected number.

### C4. Showcase-rate widget
- Show **expected showcase rate vs actual showcase rate** (showcase pulls are rare; quantify expected vs observed).

### C5. Aspect panel cleanup
- **Remove the aspect line-graph mouseover.**
- Put **aspect icons to the left of the aspect words** (icon + label rows), not a hover graph.

### C6. Reconsider "Notable cards"
- The current "Notable cards" callout may be redundant once the histogram + tooltips exist. Decide: fold its "biggest delta" cards into histogram highlights, or drop it. **Ask user** if unclear.

### Backend (`/api/stats/me/luck`)
The histogram + widgets need new fields. Find the route (`grep -rn "stats/me/luck" app/api`). Add to the payload:
- `cardHits`: `[{ number, cardId, name, aspects: string[], count, expected, deltaSigma }]` — per card in the set the user has opened.
- `duplicates`: `{ actualRate, expectedRate, actualCount, expectedCount }`.
- `showcase`: `{ actualRate, expectedRate }`.
- Keep `aspect` (for C5) and `streaks`; **drop `rarity`** (C1).
- "Expected" math: derive from pack-slot composition per set (`src/belts/` / `src/utils/boosterPack*` define slot odds). Pure functions belong in `src/services/` per architecture rules; add tests (spec-first, red-green).

### Frontend
- New component `src/components/YourStats/LuckHistogram.tsx` (data-viz; aspect colors from the shared aspect color tokens; SVG or div bars).
- New `DuplicateRateWidget` + `ShowcaseRateWidget` (small stat-vs-expected widgets with explainer copy).
- Update `LuckSection.tsx`: drop rarity panel, add histogram + search + widgets, keep set/scope toggles + intro (already added).
- `LuckPayload` type: replace `rarity` with the new fields.

### Verify
- Tests for the expected-count service (`*.test.js`, run via `node src/.../X.test.js` or `npm run test:utils`).
- Manually: open packs as a test user, confirm histogram bars match real hits, tooltip deltas read sensibly, duplicate/showcase numbers are plausible, search greys non-matches, mobile tap works.

---

## Cross-cutting reminders
- Read `docs/STYLE_GUIDE.md` + `.claude/rules/ui-components.md` before UI work. Use the `Button` component, aspect color tokens, Barlow.
- Mobile: wrap all `:hover` CSS in `@media (hover: hover)`; no hover-only interactions (histogram tooltip).
- Per-set rules go in `src/utils/setConfigs/`; never change past-set behavior.
- Before each commit: `git checkout -- src/data/cards.json src/data/cards.raw.json`, then `npm run build`, then restart `PORT=3022 npm start`.
- **Never push without explicit "push".**
