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

## Batch 3 — Consistency (P1) 🔶 MODAL/BUTTON SYSTEMS DONE
- [x] **Confirm-dialog consolidation** — new `ConfirmModal` (built on the focus-trapped `Modal` + standard `Button` variants) replaces all 7 bespoke hand-rolled confirms (`PoolBuilds` delete; `history` delete/cancel; `draft` list delete+drop; draft room cancel+drop; `formats` delete; sealed pod delete+leave). One modal system now.
- [x] **Dead button CSS removed** — `.modal-btn-*` (unused) and the generic `.modal-actions button` overrides deleted from Modal.css; orphaned `confirmModal.css` deleted. All modal action buttons are now the `Button` component.
- [x] `SectionHeader.tsx:136` `className` bug fixed (earlier commit).
- [ ] **Converge the 3 deck-builder filter UIs** (grid checkbox-modal vs arena pip-grid vs list table-sort) onto one vocabulary — this is a genuine **UX redesign / design decision**, not a mechanical migration, and the deck builder is hard to verify headless (needs a saved pool). Left for a deliberate pass with a chosen direction. Smallest win within it: surface active-filter state on the closed grid filter button.
- [ ] Wire the Arena Aspect-Penalties toggle (undeclared state) — P0 from the original critique, lives inside the arena filter UI above.

## Design-decision items (user-approved, done)
- [x] **Chart dataset palette** — All-dataset recolored blue → teal `#4DB6AC` (chart panel + legend + row), and the skeleton/panel "You"-colour mismatch fixed. Verified live (teal). Login-link blues left as-is (separate concern).
- [x] **Demoted the big-number metric cards** — `.metric-value` 2rem → 1.4rem. (The 4 lock affordances were left: each serves its own surface — legend = which datasets are locked, CTA = the unlock action, chart = the blurred-panel indicator, cell = the value — so they're contextual, not truly redundant.)
- [x] **Draft long-press to zoom** — 450ms hold opens a full-screen zoom; quick tap still picks; movement cancels; a click-guard stops a long-press from also picking; iOS image-callout suppressed. Build-verified (live draft not reachable headless).
- [ ] Emoji → SVG icons (🔒 🔍 ▼): cosmetic, low value; the SVG icon system exists. Left as optional.

## Still open: the one genuine redesign
- [ ] **Converge the 3 deck-builder filter UIs.** This is the single remaining item and it is NOT mechanical: it rewrites how filtering works in the grid + list views to match the arena pip-grid, with real regression risk, and the deck builder can't be verified headless (needs a logged-in saved pool). Needs a chosen direction + manual click-testing. See the Batch 3 note above.

## Batch 4 — Banned tells + motion (P1) 🔶 PARTIAL
- [x] **Side-stripes eliminated (detector 15 → 0):** LandingPage promo, stats.css ×7 (metric cards + qa items → full colored borders), SubscribeModal ×2, AdminGrantPanel, rotisserie (redundant stripe dropped), qa.css ×3. Full borders / tinted borders per DESIGN.md.
- [x] **Landing promo resting fill removed** — no more saturated `hexToRgba(setColor,0.14)` bg; set color now a subtle uniform border (Light-Not-Paint).
- [x] **Bounce easing fixed** — showcases.css flip → ease-out `cubic-bezier(0.22,1,0.36,1)` (detector 1 → 0).
- [x] **Stats ALL-CAPS removed** — `.stat-label`, `.qa-summary-label`, `.metric-stat-label`, `.stats-chart-panel-label` lose `text-transform`/`letter-spacing` (+ contrast bumped to 0.72).
- [x] **Global `prefers-reduced-motion` guard** added to `src/index.css` (animations collapse, transitions near-instant).
- [x] **Draft rainbow-border replaced** — `DraftableCard` selection is now the holotable green glow/ring (CSS), no more always-on infinite rainbow animation. Keyframe kept for showcase emphasis only.
- [x] **Blue toggle-active fill fixed** — `.view-mode-toggle-button.active` → white-0.15 fill / white text (Light-Not-Paint, matches DESIGN.md toggle vocabulary).
- [x] Sealed badges Title-Cased (`.beta-badge` covers Beta + Pre-Release, `.coming-soon-badge`, the coming-soon note, and the pack-open prerelease badge) — verified live ("Coming Soon"). AspectFilterModal dialog title + "Filtered cards:" label de-capped. Set-code acronyms (`.placeholder-code`) intentionally kept uppercase. Functional aspect pills left (defensible label convention).
- [ ] Green modal-confirm resting fill — folds into Batch 3 modal consolidation.

## Batch 5 — Error/empty states + mobile (P1/P2) 🔶 PARTIAL
- [x] **Human error/empty states:** SealedPod no-data (dropped the JSON-schema dev dump → "This set isn't available yet"); pool-not-found (was a spinner + silent 2s bounce → real "Pool not found" message + Back button); History now uses `Promise.allSettled` so one failed endpoint degrades only its section, friendly message + Try-Again retry only if all fail (also uses the previously-unused `Button` import).
- [ ] Layout-matched skeletons for sealed pool generation (`pools/new`).
- [x] **Mobile tap-to-zoom (sealed pool)** — additive: tapping a card on a touch device opens a full-screen centered overlay (role=dialog), tap to dismiss. Hover logic untouched. Verified live on a 390px viewport (overlay shows the card, dismisses on tap).
- [ ] Remaining mobile: tap-to-zoom in the live draft grid; ≥44px tap targets (InfoTooltip, SearchInput clear); broader `:hover`-guard audit; reconsider `userScalable:false`.
- [x] **Solo sealed pool Copy-Link button** — added next to Build Deck (interactive variant + copy icon, "Copy Link"/"Copied!"), copies `/pool/{shareId}`. Verified live in the browser (renders + wired); clipboard write itself can't be exercised headless. Reuses the lobby's clipboard pattern.

## Batch 6 — Data surfaces → holotable (P1/P2) 🔶 PARTIAL
- [x] Stats patron CTA: dropped the `border-image` amber gradient + squared corners → clean amber border at the 12px system radius (verified live, 12px).
- [x] Chart text legibility: bumped pie labels, small-slice legend, bar Y-axis, X-axis ticks, and bar value labels to ≥12px and ≥0.8 alpha.
- [x] History mobile tables: `min-width: 600px` so the 6-7 columns scroll inside the overflow-x:auto container instead of crushing on a phone.
- [ ] Reconcile the 3 chart color systems (dataset hue vs aspect-is-data vs delta) onto a non-blue, non-aspect dataset hue — genuine data-palette decision, left for a deliberate pass.
- [x] Keyboard-sortable `<th>` (tabIndex + Enter/Space + aria-sort) on the 5 stats sort headers — verified live (tabindex=0, aria-sort present).
- [ ] Consolidate the 4 redundant lock affordances; demote big-number metric cards (visual judgment — deliberate pass).

## Batch 7 — Polish + housekeeping (P2/P3)  *(worktree: design/critique-cleanup)*
- [x] Bump `#888` body copy on error/not-found/maintenance to `rgba(255,255,255,0.7)`. *(AuthWidget muted labels still pending.)*
- [x] **Section-header ALL-CAPS removed** — `SectionHeader.tsx` + `CollapsibleSectionHeader.tsx` (Title-Case rule); also fixed the `SectionHeader.tsx` `className="marginLeft: …"` bug.
- [x] AuthWidget muted text labels (5 rules, 0.4–0.6 alpha) → 0.72; also wrapped the `.auth-widget-avatar-button:hover` lift in `@media (hover:hover)` (was firing on tap — mobile.md).
- [ ] Replace emoji UI icons (🔒 🔍 ▼) with the SVG system.
- [x] Refresh `docs/STYLE_GUIDE.md` (`.tsx` names, `warning` variant, `xs` size, `glowColor`).
- [ ] Deferred (visual judgment — do with browser review): sealed status badges + deck-builder functional pill/label ALL-CAPS (aspect names, "In/Out of Aspect", "ACTIONS:").
- [ ] Modal focus-trap + restore-focus-on-close.
- [ ] Verify the 5 `<img>` detector hits (likely dynamic/upload false positives).
- [ ] Fold in the separate **VITE_SCAFFOLDING_CLEANUP.md** plan (index.css residue) — overlaps Batch 1's focus-ring work and Batch 4's motion guard.
- [ ] Final `/impeccable polish` pass + re-run `/impeccable critique`.
