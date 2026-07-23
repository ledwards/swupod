---
title: Design refresh — holotable tokens as code, banned-tells guard, new-surface reconciliation
type: fix
status: active
date: 2026-07-07
supersedes: plans/CRITIQUE_REMEDIATION.md
critique-baseline: .impeccable/critique/2026-06-14T05-57-08Z__protectthepod-whole-app.md (20/40)
---

# Design Refresh Plan (2026-07-07)

## Overview

The 2026-06-14 whole-app critique scored 20/40 and produced a 7-batch remediation
backlog (`plans/CRITIQUE_REMEDIATION.md`). This refresh verifies every remediation
item against the current tree, audits the surfaces built since (card tier list,
Swiss Practice matchmaking UI, draft slideshow/observer, personal-stats dashboards,
Patreon features box, foil shimmer), and identifies why the same drift class returned
three weeks after it was fixed.

**Headline verdict: the remediation genuinely shipped** — every P0 and nearly every
P1/P2 checkbox is verifiable in code — **but the fixes were per-instance, and the
class came back.** The critique's central complaint about the data surfaces ("stats
drift into the SaaS dashboard look the brief rejects") was fixed on the *old* stats
page and then rebuilt, bigger, in the *new* personal-stats dashboards and Swiss
matchmaking panel: 23 bespoke hex colors (Tailwind's palette, not ours) in
`YourStats.css`, a private `--swiss-*` palette in `MatchmakingPanel.css`, and 116
`text-transform: uppercase` occurrences across 30+ CSS files despite the Title-Case
rule. The root cause is structural: **DESIGN.md's palette exists only as prose** —
`src/index.css` defines essentially no CSS custom properties — and **no banned-tells
check runs in CI**, so every new surface re-derives its colors by hand and nothing
objects.

## Delta Audit A — CRITIQUE_REMEDIATION verification (2026-07-07 tree)

### Verified shipped (evidence)

| Item | Evidence |
|------|----------|
| Card keyboard/ARIA (P0) | `src/components/Card.tsx:182-186`, `DraftableCard.tsx:217-221` — `role="button"`, `tabIndex`, Enter/Space, `aria-pressed/disabled/label` |
| Global `:focus-visible` rings (P0) | `Button.css:34-36`, `Card.css:64-67`, `DraftableCard.css:33-36` |
| Live-draft reconnect pill (P0) | `app/draft/[shareId]/page.tsx` consumes `connected`/`reconnect`; amber aria-live pill + Retry |
| "Tournament" → "Competitive" (P0, legal) | `app/stats/page.tsx`, `StatsCharts.tsx` |
| ConfirmModal consolidation + dead modal CSS | `ConfirmModal.tsx` on focus-trapped `Modal`; `.modal-btn-*` gone |
| Modal focus-trap + restore-focus | `Modal.tsx:70-111` (Tab cycle, Escape, `previouslyFocusedRef`) — was still open in Batch 7; it shipped |
| Side-stripes 15 → 0; bounce easing 1 → 0 | grep `border-left: [34]px solid` clean; showcases easing `cubic-bezier(0.22,1,0.36,1)` |
| Global `prefers-reduced-motion` guard | `src/index.css:111-120` |
| Rainbow selection → green glow; rainbow reserved for showcase | `DraftableCard.tsx:204-225` + CSS |
| Old stats ALL-CAPS removal, chart teal `#4DB6AC`, patron CTA border, chart text ≥12px/0.8α, history `min-width:600px`, keyboard-sortable `<th>` | `app/stats/stats.css`, `StatsCharts.tsx` |
| Human error/empty states (SealedPod, pool-not-found, History `allSettled`) | per Batch 5 |
| Sealed-pool mobile tap-to-zoom; draft long-press zoom (450 ms); solo Copy-Link | `DraftableCard.tsx:94-128, 258-291` |
| Section-header Title-Case + `className` bug; AuthWidget 0.72α + hover-guard; STYLE_GUIDE refresh | Batch 7 items |

### Still open from the old backlog (carried into initiatives below)

| Item | State | Carried to |
|------|-------|-----------|
| Converge the 3 deck-builder filter UIs (the one genuine redesign) | Open — grid checkbox-modal vs arena pip-grid vs list table-sort all still live | D5 |
| Arena Aspect-Penalties toggle | Component + context wiring exist (`AspectPenaltyToggle.tsx`); needs live interaction verification | D5 |
| Reconcile the 3 chart color systems | Open — and worse: YourStats added a 4th ad-hoc palette | D4 |
| Layout-matched skeletons for `pools/new` | Not found in `app/pools/new/page.tsx` | D6 |
| Emoji UI icons 🔒 🔍 ▼ → SVG | Still present (`CollapsibleSection.tsx:78`, `DeckBuilder.tsx:2739+`, `SearchInput.tsx:93`, `SectionHeader.tsx:121`) | D6 |
| `userScalable: false` (WCAG 1.4.4) | Still set — `app/layout.tsx:84` | D6 |
| ≥44px tap targets (SearchInput clear, InfoTooltip) | Unaudited | D6 |
| Lock-affordance consolidation / metric-card demotion judgment items | Open (deliberate-pass) | D4 |

## Delta Audit B — new surfaces since 2026-06-11

| Surface | Verdict | Evidence |
|---------|---------|----------|
| Card tier list + card stats badges (`CardDataTierList.tsx`, `CardStatsBadge.tsx/.css`) | **On-system** | white-alpha borders, dark translucent fills, shared `Button`/`Modal`/`AspectIcon`; no banned tells |
| Draft slideshow/observer (`DraftSlideshow.css`, `SlideshowNav.css`, `SlideshowStage.css`) | **On-system** | white-alpha + system blue; `:focus-visible` at `SlideshowNav.css:112`; has its own e2e spec (`draft-slideshow.spec.ts`) |
| Foil shimmer everywhere (`78a270f4`) | **On-system** | canonical `foil-shimmer 6s` per DESIGN.md §5, reduced-motion covered by the global guard |
| **Swiss matchmaking panel** (`MatchmakingPanel.css` 942 lines, `MatchCard.css` 509) | **OFF-SYSTEM — worst new drift** | private palette `MatchmakingPanel.css:4-9` (`--swiss-blue:#93c5fd`, `--swiss-blue-bright:#bfdbfe`, `--swiss-violet:#c4b5fd`, `--swiss-premium:#f6d16b`); raw `#22c55e` (`:105`); resting `linear-gradient` panel fill (`:14`) vs flat-translucent rule; sub-0.7α text (`:39`); 12 `text-transform: uppercase` (+5 in MatchCard.css) |
| **Personal-stats dashboards** (`src/components/YourStats/` — `YourStats.css` **4,051 lines**, 45 commits) | **OFF-SYSTEM — largest mass** | 23 distinct bespoke hexes, mostly Tailwind palette imports (`#f87171`×5, `#60a5fa`, `#4ade80`, `#facc15`, `#fcd34d`×2, `#07101f`×5, `#1a2233`×4 …); 14 `text-transform: uppercase`; this is the SaaS-dashboard idiom the brief bans, rebuilt on the newest surface |
| Patreon "Friends of the Pod" box (`PatreonFeaturesBox.css`) | **Minor drift** | gold treatment defensible; `#ffb347` star off-palette; chevron rotate covered by global motion guard |
| Import-pool wizard CSS (`ImportPool.css`) | **Drift** | 10 `text-transform: uppercase` |

Cross-cutting counts (2026-07-07): `text-transform: uppercase` ×116 across ~30 files
(top: `YourStats.css` 14, `MatchmakingPanel.css` 12, `ImportPool.css` 10, rotisserie 8,
`DeckBuilder.css` 7, `stats.css` 6). Side-stripes remain 0. Bounce easing remains 0.
`src/index.css` defines ~1 custom property — there is no tokens file.

## Root causes (map every symptom before fixing)

1. **RC1 — The design system is prose, not code.** DESIGN.md names 30 colors, 5 radii,
   5 spacings; none exist as CSS custom properties. Every new surface hand-picks
   values, and authors under deadline reach for familiar Tailwind hexes. All of
   Audit B's palette drift is this one cause.
2. **RC2 — No deterministic guard.** The impeccable detector ran once (2026-06-14),
   found 32 issues, they were fixed per-instance, and nothing runs in CI. Per the
   house rule ("every shipped fix adds a guard"), the June remediation shipped fixes
   *without* the guard — so the class returned in 21 days. All ALL-CAPS/gradient/
   off-palette recurrence is this cause.
3. **RC3 — The two parked redesigns have no forcing function.** Filter-UI convergence
   and chart-palette reconciliation were correctly flagged as judgment calls needing a
   chosen direction — then nobody chose. Meanwhile a 4th chart palette shipped.
4. **RC4 — New-surface e2e coverage is behavioral only.** 34 Playwright specs, zero
   screenshot assertions; visual drift is invisible to CI even where a spec exists.

## Initiatives

| # | Initiative | Root cause |
|---|-----------|------------|
| D1 | `tokens.css` — encode DESIGN.md as CSS custom properties | RC1 |
| D2 | Banned-tells checker in CI (`check:design-tells`) | RC2 |
| D3 | Re-skin Swiss matchmaking surfaces onto holotable | RC1 (worst instance) |
| D4 | Personal-stats + chart palette reconciliation | RC1 + RC3 |
| D5 | Deck-builder filter convergence (the parked redesign) | RC3 |
| D6 | Mobile/a11y closeout (userScalable, 44px, skeletons, emoji→SVG) | backlog debt |
| D7 | Playwright visual baselines for the holotable surfaces | RC4 |

## Execution Order & Implementation Units

Order: **D1 → D2 → D3 → D7 → D4 → D6 → D5.** Tokens first (everything else migrates
onto them), guard second (locks each migration as it lands), then the worst offender,
then baselines so D4–D6 land with screenshot proof. D5 last — it is the only unit
needing a product decision from Lee before code.

- [ ] **D1. `src/styles/tokens.css` — the palette becomes code.**
  - Files: new `src/styles/tokens.css` (imported once from `app/layout.tsx` or
    `src/index.css`); DESIGN.md gains a one-line pointer ("tokens.css is generated
    truth; DESIGN.md frontmatter is its source").
  - Approach: `:root` custom properties mirroring DESIGN.md frontmatter exactly —
    `--pt-bg-void`, `--pt-ink`, `--pt-ink-muted`, `--pt-border`, `--pt-glow-primary/
    danger-interactive`, six `--pt-aspect-*`, `--pt-radius-xs..lg/card`,
    `--pt-space-xs..xl`. No visual change in this unit — definitions only, plus
    migration of `Button.css`/`Card.css`/`Modal.css` as the reference consumers.
  - Test-first: a small unit test (`src/styles/tokens.test.ts`) parses DESIGN.md
    frontmatter and tokens.css and asserts 1:1 value parity — the docs and the code
    can never diverge silently again.
  - Acceptance (screenshot-verifiable): Playwright — landing, a modal, and a draft
    card before/after are pixel-identical (this unit must be invisible).
  - Size: S–M.

- [ ] **D2. `npm run check:design-tells` + CI step.**
  - Files: new `scripts/check-design-tells.ts` (+ tests), `.github/workflows/ci.yml`.
  - Rules (all with a committed baseline so it lands green and ratchets down —
    same monotonic shape as `check:ts-nocheck`):
    1. `border-left|border-right: *px solid <color>` — side-stripe ban, baseline 0.
    2. `text-transform: uppercase` in `src/components/**` and `app/**` CSS —
       baseline 116, shrink-only. Escape: `/* design-ok: <reason> */` on the line
       (set-code acronyms, format stage labels).
    3. Raw 6-digit hexes in CSS outside `tokens.css` — baseline = current count per
      file, shrink-only.
    4. `cubic-bezier` overshoot (>1 param) — baseline 0.
    5. `linear-gradient` resting fills in component CSS — baseline = current, shrink-only.
  - Test-first: fixture CSS files (one violating each rule) pinned as failing;
    current tree passes at baseline.
  - Acceptance: CI red when a scratch CSS adds `#60a5fa`; green on main.
  - Size: M.

- [ ] **D3. Swiss matchmaking → holotable.**
  - Files: `src/components/MatchmakingPanel.css`, `MatchCard.css`,
    `MatchmakingPanel.tsx`, `MatchCard.tsx` (class renames only if needed).
  - Approach: delete the `--swiss-*` palette; interactive accents → `--pt-glow-interactive`
    (#2196F3), success → Go Green glow-on-interaction (not `#22c55e` resting text),
    premium/patron gold → `--pt-gold-warning`; panel resting fill → translucent black +
    1px white-alpha border (Flat-At-Rest), gradients removed; labels Title-Cased; all
    text ≥0.7α. Keep layout/spacing untouched — this is a palette/typography pass,
    not a redesign.
  - Test-first: D2 baseline for these two files drops to 0 raw hexes / 0 uppercase and
    is committed with the change (ratchet enforces it stays there).
  - Acceptance (screenshot-verifiable): Playwright `live-swiss-fake-companion.spec.ts`
    extended with `toHaveScreenshot('matchmaking-panel.png')` at desktop + Pixel 5;
    manual: matchmaking panel visually reads as the same family as the draft lobby
    (border, fill, glow vocabulary), match cards' live "Play/Join" buttons glow blue
    on hover, no violet anywhere.
  - Size: M.

- [ ] **D7. Visual baselines for holotable surfaces.**
  - Files: new `tests/e2e/visual.spec.ts` (or `toHaveScreenshot` blocks inside the
    owning specs), `playwright.config.ts` (add `expect.toHaveScreenshot` thresholds;
    keep it chromium-only to avoid cross-browser noise).
  - Surfaces: landing, draft pack grid (bot draft, deterministic seed), deck-builder
    grid view, stats page header+first panel, YourStats gameplay dashboard,
    matchmaking panel, card tier list, patreon box, a modal.
  - Approach: mask dynamic regions (counts, avatars, timers) via `mask:` option;
    seed data through the existing `app/api/test/*` seams so renders are stable.
  - Acceptance: `npx playwright test visual.spec.ts` green twice in a row locally
    (flake = bug); intentionally changing a button border fails the right snapshot.
  - Size: M.

- [ ] **D4. Personal-stats reconciliation (the big one).**
  - Files: `src/components/YourStats/YourStats.css` (4,051 lines),
    `MetaDashboard.tsx`, `GameplayDashboard.tsx`, `LuckHistogram.tsx`,
    `DistributionChart.tsx`, `app/stats/stats.css` remnants.
  - Decision to encode (proposal, needs Lee's sign-off — see Open Questions): **one
    dataset hue** for "you/your data" = the existing teal `#4DB6AC` (promoted to
    `--pt-data-you`), **one comparison hue** for "everyone/meta" = desaturated white
    (`--pt-ink-muted`), aspect colors only where the datum *is* an aspect, semantic
    red/green reserved for deltas (win/loss, up/down) at glow weights. This retires
    the Tailwind reds/blues/greens/yellows wholesale.
  - Approach: token migration + palette collapse per the decision; Title-Case the 14
    uppercase labels; demote any big-number metric cards that crept back to the 1.4rem
    standard; keep chart *shapes* untouched.
  - Test-first: D2 per-file baselines for `YourStats.css` → 0 raw hexes outside
    tokens; unit tests for any extracted chart-color helper (`chartPalette.ts`) so
    every chart pulls from one definition.
  - Acceptance (screenshot-verifiable): D7 snapshots for the two dashboards updated
    once, deliberately, in this PR — reviewer sees before/after side-by-side; manual:
    `/me` stats tabs contain no color not traceable to tokens.css (verify with
    devtools computed styles on the worst three panels).
  - Size: L (mechanical but wide; do it dashboard-by-dashboard in one PR series).

- [ ] **D6. Mobile/a11y closeout.**
  - Items: (1) `userScalable: false` → allow zoom (`app/layout.tsx:84`), verify no
    layout break at 200% on Pixel 5/iPhone 12 projects; (2) ≥44px tap targets on
    `SearchInput` clear, `InfoTooltip` trigger, collapsible headers (padding, not
    layout shift); (3) layout-matched skeletons for `pools/new` generation wait;
    (4) emoji 🔒 🔍 ▼ → existing SVG icon system (`CollapsibleSection`, `SearchInput`,
    `SectionHeader`, DeckBuilder actions); (5) hover-guard sweep for the remaining
    unguarded `:hover` lifts (grep `transform.*translateY` in css without
    `@media (hover:hover)` nearby).
  - Acceptance: `npm run test:e2e:mobile` green; axe/manual pass on the touched
    surfaces; D7 snapshots updated only where icons changed.
  - Size: M.

- [ ] **D5. Deck-builder filter convergence (needs direction pick first).**
  - The June backlog's one genuine redesign, still parked. Proposal: the **arena
    pip-grid wins** (it is visible, stateful, and already the signature interaction);
    grid view's checkbox-modal and list view's header-sort filters converge onto the
    same pip-grid component, rendered in the sticky bar. Includes wiring/verifying
    `AspectPenaltyToggle` and surfacing active-filter state when collapsed.
  - Test-first: component tests for the extracted `AspectFilterPips` (selection,
    penalties toggle, active-state summary); e2e `deck-builder.spec.ts` extended to
    filter in all three views and assert identical result sets.
  - Acceptance (screenshot-verifiable): one filter vocabulary across the three views
    in D7 snapshots; manual click-test with a saved pool (this surface can't be fully
    verified headless — schedule a browser session).
  - Size: L. **Blocked on Lee confirming the pip-grid direction.**

## Verification & Smoke Test

```bash
nvm use 20
npm run dev            # http://localhost:3000

# Guards (all also in CI)
npm run typecheck && npm run check:ts-ratchet
npm run check:design-tells        # new (D2)

# E2E — full and targeted
npm run test:e2e
npx playwright test visual.spec.ts --project=chromium          # D7 baselines
npx playwright test deck-builder.spec.ts stats-page.spec.ts your-stats.spec.ts
npm run test:e2e:mobile           # Pixel 5 + iPhone 12 projects (D6)
```

Click-through smoke checklist:
1. Landing → hover a mode tile and a primary button: flat at rest, green/blue glow +
   `-2px` lift on hover only (Light-Not-Paint holds after token migration).
2. `/stats` and `/me` stats tabs: no Tailwind blues/reds; the only saturated colors
   are the teal "you" hue, aspect pips, and semantic deltas; all labels Title-Case
   (D4's visible win).
3. Swiss practice pod → matchmaking panel: reads as holotable (translucent black,
   white-alpha border, blue interactive glow); no violet, no gradient slab (D3's win).
4. Draft a pack on a phone (or 390px viewport): long-press zooms, tap picks,
   pinch-zoom now works (D6); timers/labels legible.
5. Deck builder, all three views: same filter pips everywhere, aspect-penalty toggle
   visibly changes card badging (D5's win).
6. Add `color: #60a5fa` to any component CSS → `npm run check:design-tells` fails
   naming the file/line (D2's win); revert.
7. Keyboard-only lap: Tab to a card → focus ring visible → Enter picks; Escape closes
   the zoom/modal and focus returns (regression check on the June P0s).

## Open Questions for Lee

1. **Chart palette decision (D4):** confirm the "one dataset hue" proposal (teal for
   you, muted white for meta, aspects only when the datum is an aspect, red/green for
   deltas) — or name a different scheme. This unblocks the largest unit.
2. **Filter vocabulary (D5):** confirm arena pip-grid as the single filter UI, or
   pick another direction. Blocked otherwise.
3. **Uppercase allowlist (D2):** set-code acronyms and format stage labels were
   deliberately kept uppercase in June. Are rotisserie stage labels and import-wizard
   step labels in the allowed set, or should those 18 go too?
4. **Patreon gold:** is `#ffb347` a deliberate Patreon-brand nod (keep, tokenize as
   `--pt-patreon`) or drift (fold into `--pt-gold-warning`)?
5. **Visual-baseline blast radius (D7):** snapshots make design PRs noisier (every
   deliberate change touches PNGs). Comfortable with that trade at chromium-only, or
   prefer gating visual specs behind an opt-in tag?
