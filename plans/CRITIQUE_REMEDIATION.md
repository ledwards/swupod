# Critique Remediation Plan

Backlog from the whole-app `/impeccable critique` run on 2026-06-13 (score **20/40**,
snapshot at `.impeccable/critique/2026-06-14T05-57-08Z__protectthepod-whole-app.md`).
User direction: fix **all P0s**, full scope **incl. P2/minor**, and **pull the data
surfaces (stats/history/deck-builder) back to the holotable system** in `DESIGN.md`.

Worked in priority batches. Build before commit; never push without explicit "push".
Re-run `/impeccable critique` after each batch to watch the score move.

---

## Batch 1 — Accessibility core (P0) ✅ DONE (build-verified)
The single highest-leverage fix; unblocks draft + deck builder and Sam/Alex at once.
- [x] `Card.tsx` — clickable `<div>` → `role="button"`, `tabIndex`, Enter/Space `onKeyDown`, `aria-pressed`, `aria-disabled`, `aria-label` (only when `onClick` provided).
- [x] `DraftableCard.tsx` — same keyboard/ARIA treatment on `.draftable-card`.
- [x] Global `:focus-visible` ring — `.btn` (Button.css), `.canvas-card`, `.draftable-card`; interactive-blue outline + offset. Restores the focus state `Button` was stripping.
- [ ] Follow-up (rolled to Batch 7): `CollapsibleSection` header + `SearchInput` focus states; `Modal` already focus-managed via Batch 7 focus-trap item.

## Batch 2 — Other P0s ✅ DONE (build-verified)
- [x] **Live-draft connection status** — `app/draft/[shareId]/page.tsx` now consumes `connected`/`reconnect`; persistent amber "Reconnecting…" pill (aria-live) with a Retry button in both active phases, shown only after a real drop (no initial-load flash). *Follow-up: grey the timer while offline (Batch 5).*
- [x] **"Tournament" legal copy** — renamed all user-visible strings to "Competitive" in `app/stats/page.tsx` + `app/stats/StatsCharts.tsx` (+ dependent `startsWith` color check); identifiers/API `tournamentOnly` param left intact; ToS "No Tournaments for Prizes" disclaimer intentionally kept. See memory `feedback_no_tournament_language.md`.

## Batch 3 — Consistency (P1)
- [ ] Route modal/confirm actions through `Button` + `Modal.Actions`; delete `.modal-btn-*` (Modal.css) and `.delete-confirm-*` (confirmModal.css) bespoke button systems.
- [ ] Replace hand-rolled tabs/buttons/confirms in Sealed (`sealed/new`), History, Stats with `Button`/`Modal` (History already imports `Button` unused).
- [ ] Deck builder: converge the **three filter UIs** on one vocabulary (the visible arena pip-grid); surface active-filter state on the grid filter button.
- [ ] Fix `SectionHeader.tsx:136` `className="marginLeft: '0.5rem'"` bug; wire the Arena Aspect-Penalties toggle (undeclared state).

## Batch 4 — Banned tells + motion (P1) 🔶 PARTIAL
- [x] **Side-stripes eliminated (detector 15 → 0):** LandingPage promo, stats.css ×7 (metric cards + qa items → full colored borders), SubscribeModal ×2, AdminGrantPanel, rotisserie (redundant stripe dropped), qa.css ×3. Full borders / tinted borders per DESIGN.md.
- [x] **Landing promo resting fill removed** — no more saturated `hexToRgba(setColor,0.14)` bg; set color now a subtle uniform border (Light-Not-Paint).
- [x] **Bounce easing fixed** — showcases.css flip → ease-out `cubic-bezier(0.22,1,0.36,1)` (detector 1 → 0).
- [x] **Stats ALL-CAPS removed** — `.stat-label`, `.qa-summary-label`, `.metric-stat-label`, `.stats-chart-panel-label` lose `text-transform`/`letter-spacing` (+ contrast bumped to 0.72).
- [x] **Global `prefers-reduced-motion` guard** added to `src/index.css` (animations collapse, transitions near-instant).
- [x] **Draft rainbow-border replaced** — `DraftableCard` selection is now the holotable green glow/ring (CSS), no more always-on infinite rainbow animation. Keyframe kept for showcase emphasis only.
- [x] **Blue toggle-active fill fixed** — `.view-mode-toggle-button.active` → white-0.15 fill / white text (Light-Not-Paint, matches DESIGN.md toggle vocabulary).
- [ ] Remaining ALL-CAPS: sealed badges (SetSelection.css, PackOpeningAnimation.css), deck-builder `AspectFilterModal` + "ACTIONS:" (need JSX case check).
- [ ] Green modal-confirm resting fill — folds into Batch 3 modal consolidation.

## Batch 5 — Error/empty states + mobile (P1/P2)
- [ ] Human error/empty states: sealed no-data + pool-not-found, history per-widget degrade (no whole-page blank, no raw `err.message`).
- [ ] Layout-matched skeletons for sealed pool generation (`pools/new`).
- [ ] Mobile: tap-to-zoom on dense card grids (sealed + draft); enforce ≥44px tap targets; wrap all `:hover` lifts in `@media (hover:hover)`; reconsider `userScalable:false`.
- [ ] Solo sealed pool: add a Copy-Link button (reuse the lobby clipboard+toast).

## Batch 6 — Data surfaces → holotable (P1/P2)
- [ ] Re-skin Stats: drop the four-identical-panel dashboard + big-number metric cards; reconcile the three colliding color systems (dataset hue vs aspect-is-data vs delta) onto a non-blue, non-aspect dataset hue; chart text ≥12px ≥0.8 alpha; keyboard-sortable headers + aria-labels.
- [ ] History: `overflow-x:auto` on tables for mobile; card/visual treatment over raw rows; consolidate the 4 redundant lock affordances.

## Batch 7 — Polish + housekeeping (P2/P3)
- [ ] Bump `#888` body copy on error/not-found/maintenance to `#FFFFFFB3`; AuthWidget muted labels ≥0.7 alpha.
- [ ] Replace emoji UI icons (🔒 🔍 ▼) with the SVG system.
- [ ] Refresh `docs/STYLE_GUIDE.md` (`.tsx` names, `warning` variant, `xs` size, `glowColor`).
- [ ] Modal focus-trap + restore-focus-on-close.
- [ ] Verify the 5 `<img>` detector hits (likely dynamic/upload false positives).
- [ ] Fold in the separate **VITE_SCAFFOLDING_CLEANUP.md** plan (index.css residue) — overlaps Batch 1's focus-ring work and Batch 4's motion guard.
- [ ] Final `/impeccable polish` pass + re-run `/impeccable critique`.
