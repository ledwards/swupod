---
target: whole app (everything)
total_score: 20
p0_count: 4
p1_count: 4
timestamp: 2026-06-14T05-57-08Z
slug: protectthepod-whole-app
---
# Critique: Protect the Pod — whole app

## Design Health Score (global)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No connection/sync state during a live draft; some blank-screen loading (sealed) |
| 2 | Match System / Real World | 3 | Fluent SWU language; but "Tournament" jargon (also a legal problem) |
| 3 | User Control and Freedom | 2 | No undo on bulk deck ops; no mid-draft leave/reconnect; hidden re-roll |
| 4 | Consistency and Standards | 1 | 3 button vocabularies, 2 modal systems, 3 filter UIs; Button/Modal bypassed app-wide |
| 5 | Error Prevention | 3 | Good confirms on delete; but destructive bulk moves have no guard |
| 6 | Recognition Rather Than Recall | 2 | Filters hidden behind modals; color-only state cues |
| 7 | Flexibility and Efficiency | 1 | Zero keyboard support anywhere — power users AND a11y blocked |
| 8 | Aesthetic and Minimalist Design | 2 | Stats/deck-builder drift into the spreadsheet-y SaaS look the brief rejects |
| 9 | Error Recovery | 2 | Developer-facing error/empty states (raw JSON, err.message) |
| 10 | Help and Documentation | 2 | Tooltips/reference tabs good; no newcomer onboarding |
| **Total** | | **20/40** | **Acceptable (bottom of band)** |

Per-surface subtotals: Component System 30 · Landing 26 · Sealed 25 · Draft 24 · Deck Builder 23 · History & Stats 23. The primitives are well-built; the *system-level* failures (no keyboard, fractured consistency) drag the lived experience below the per-surface average.

## Anti-Patterns Verdict

**LLM assessment:** Not generic AI slop in spirit — this is a real, opinionated, domain-deep tool, and the holotable identity (dark canvas, glow-on-interaction, the hand-built pack-crack) is genuine. But specific banned tells leak in, concentrated on the data surfaces: the **Stats page is a four-identical-panel SaaS dashboard** with ALL-CAPS metric labels, big-number cards, and side-stripe borders — every named DESIGN.md "Don't" in one place.

**Deterministic scan (detect.mjs, 32 findings, all warnings):**
- **15 × side-stripe border** (`border-left` color stripe — absolute ban): LandingPage.css:151 (public!), stats.css ×7, qa.css ×3 (dev), rotisserie, SubscribeModal ×2, AdminGrantPanel. Agrees with the design reviews.
- **10 × layout-property transition** (jank): DeckBuilder.css max-height/height ×6, ChatPanel width/height, set-catalog width.
- **1 × bounce easing**: showcases.css:180 (`cubic-bezier(…1.275)`).
- **5 × broken/placeholder `<img>`**: likely dynamic/upload previews — flagged to verify, probably false positives.
- **1 × single-font**: FALSE POSITIVE — Barlow-only is the intentional "One-Family Rule."

## Overall Impression

The bones are good and the identity is real — but the app is **built like a great component library wrapped around an inaccessible core interaction**. The single biggest finding is systemic: **the card itself (`Card` / `DraftableCard`) is a click-only `<div>` with no keyboard, no focus ring, no ARIA — across draft, deck builder, everywhere.** Picking a card *is* the product, and right now a keyboard or screen-reader user cannot do it, and a power user gets no speed path either. That one fact tanks H4, H6, H7 and three personas at once. Fix the card primitive and the global score jumps.

## What's Working

- **The holotable identity holds.** Dark translucent surfaces, glow-on-interaction, the radial draft `PlayerCircle`, and the hand-built `PackOpeningAnimation` (with sound, foil shimmer, AND a working `prefers-reduced-motion` collapse) are genuine, on-brief craft — not template work.
- **Trust-through-accuracy shows up where it counts.** Observed/expected counts, small-sample warnings, honest fraction labels, live player counts — PRODUCT.md's accuracy principle is visibly served on landing and stats.
- **`Button` and `Countdown` are exemplary primitives** — complete variant/size/state APIs, SSR-safe timer with `role="timer"` and tabular-nums.

## Priority Issues (cross-surface, ranked)

**[P0] The core card primitive is keyboard- and screen-reader-inaccessible.** `Card.tsx:152` and `DraftableCard.tsx:146` are bare `<div onClick>` — no `role`, `tabIndex`, `onKeyDown`, or `aria-pressed`. Blocks drafting and deck-building entirely by keyboard/AT, and denies power users a fast path. Violates PRODUCT.md's "full keyboard navigation for core flows." *Fix:* make the card `role="button" tabIndex={0}` with Enter/Space + roving arrow focus and `aria-pressed`. → **harden**

**[P0] No global `:focus-visible` ring.** `Button` strips the native outline and never restores one; Modal close, SearchInput, CollapsibleSection, toggles have no visible focus. Keyboard users are flying blind even where elements are focusable. *Fix:* shared `:focus-visible { outline: 2px solid <semantic-glow>; outline-offset: 2px }`. → **harden**

**[P0] No connection/sync status during a live draft.** `useDraftSocket` exposes `connected`/`reconnect` but `page.tsx` never uses them — a silent socket drop looks identical to "waiting on others," timer keeps ticking. Worst possible moment for invisible failure. *Fix:* surface a persistent "Reconnecting…" pill, pause the timer while offline, expose manual reconnect. → **harden**

**[P0] "Tournament" in user-visible copy (legal).** Panel labels, upsell heading, tooltips in Stats (`StatsCharts.tsx:399,430`; `stats/page.tsx` multiple). Project rule forbids the word in UI. *Fix:* rename visible strings to "Competitive"/"Ranked"; identifiers can follow. → **clarify**

**[P1] The component vocabulary is fractured.** Three button systems (`Button` + `.modal-btn-*` + `.delete-confirm-*`), two modal systems, three different filter UIs across the three deck-builder views, hand-rolled tabs/buttons/confirms across Sealed, History, and Stats (History even imports `Button` and never uses it). This is why H4 = 1. *Fix:* route every action through `Button`/`Modal`; pick one filter vocabulary (the visible arena pip-grid) and reuse it. → **distill** / **harden**

**[P1] Banned DESIGN.md tells across surfaces.** Side-stripe `border-left` (LandingPage promo, stats ×7), ALL-CAPS letter-spaced labels (sealed badges, deck-builder filter modal + "ACTIONS:", stats labels), saturated *resting* fills (landing promo banner, blue toggle-active fill, green modal-confirm) violating Light-Not-Paint, and squared `border-radius:0` promo. *Fix:* stripes → pip/icon + glow-on-hover; Title-Case the labels; neutral translucent rests. → **quieter** / **typeset**

**[P1] `prefers-reduced-motion` is absent system-wide.** Only `PackOpeningAnimation` honors it. Skeleton/foil/slide/glow-lift animations and — worst — an **always-on rainbow-border on every selected draft card** (DESIGN.md reserves rainbow "for showcase emphasis only") have no fallback. *Fix:* global reduced-motion guard + crossfade fallbacks; replace draft rainbow with the standard green-glow selection. → **animate** / **quieter**

**[P1] Developer-facing error & empty states.** Sealed no-data dumps "populate src/data/cards.json" + a JSON schema; History blanks the page on any one of five fetch failures and shows raw `err.message`; pool-not-found silently bounces after 2s. *Fix:* human messages + a Button back to safety; degrade per-widget, not whole-page. → **harden**

**[P2] Mobile can't inspect a card on the dense grids.** Hover-zoom is correctly disabled on touch — but nothing replaces it, so on the stated primary device, tapping a card in a sealed pool or draft pack does nothing. Plus sub-44px tap targets (SearchInput clear, InfoTooltip) and unguarded `:hover` lifts that fire on tap (AuthWidget avatar, modal actions). *Fix:* tap-to-zoom on touch; enforce 44px; wrap hover in `@media (hover:hover)`. → **adapt**

## Persona Red Flags

- **Sam (a11y):** Cannot pick cards or expand sections by keyboard (click-only divs); no focus ring; chart/seat/legality meaning conveyed by color alone; `#888` body copy on error/not-found pages and `rgba(255,255,255,0.4)` AuthWidget labels fall below the 4.5:1 / 0.7-alpha floor; hand-rolled modals have no focus trap or Escape.
- **Casey (mobile):** No tap-to-zoom on dense card grids; history's 6–7-col tables don't `overflow-x:auto`; landing mode tiles collapse to flat black boxes (art hidden); pinch-zoom disabled globally (`userScalable:false`, WCAG 1.4.4); hover-lifts fire on tap.
- **Alex (power user):** Zero keyboard shortcuts or batch-by-keyboard anywhere; deck-build speed falls back to clicking each card; sealed re-roll is a hidden full-page reload.
- **Jordan (first-timer):** No "start here" on landing (7–9 tiles, insider labels, Discord blurple reads as a gate); stats greet newcomers with SHOUTED labels and an unexplained 🔒; sealed pool gives no "what now / share this" cue.

## Minor Observations

- Solo sealed pool has **no Copy-Link button** despite the whole value prop being a shareable URL (the multiplayer lobby has a polished one — solo never got it).
- `SectionHeader.tsx:136` passes `className="marginLeft: '0.5rem'"` — a real bug (broken style as class name).
- Arena Aspect-Penalties toggle is wired to undeclared state — the signature mechanic is unreachable in the default desktop view.
- STYLE_GUIDE.md has drifted from code (`.jsx` names, missing `warning`/`xs`/`glowColor`).
- Emoji used as UI icons (🔒 🔍 ▼) instead of the in-system SVG approach.
- Layout-property transitions (DeckBuilder max-height ×6) risk jank; prefer transform/opacity or `content-visibility`.
- `not-found.tsx` uses a raw `<a class="btn">` while `error.tsx` uses `Button` — align them.

## Questions to Consider

- If picking a card is the product, what would the *keyboard-first* version of a pack feel like — arrow to move, Enter to pick?
- The data surfaces (stats/history) drifted into dashboard-land. What would they look like if they obeyed the holotable rules as strictly as the pack-open does?
- Three filter UIs exist because three views grew separately. Which single filter vocabulary deserves to win?
- Is there one "open your first pack, no login" path prominent enough that a first-timer never has to read a label?
