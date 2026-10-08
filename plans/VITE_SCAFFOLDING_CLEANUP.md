# Vite Scaffolding Cleanup (`src/index.css`)

## Overview

`src/index.css` (the global stylesheet loaded by `app/layout.tsx`) still carries
leftover defaults from the original Vite/React starter template. These contradict
the app's documented dark-only identity (see `DESIGN.md` → "The app is dark-only")
and are mostly — but not entirely — overridden by component CSS. This is a low-risk
hygiene pass, not a redesign. **Do not change the visual identity; only remove
scaffolding that fights it.**

## Why this matters

- The `@media (prefers-color-scheme: light)` block flips `:root` to a **white
  background** and dark text. Any surface that isn't explicitly painted (errors,
  unstyled fallbacks, future pages) can render light-on-light for users whose OS is
  in light mode. The app has no light theme — this block is a latent bug, not a feature.
- The `#646cff` / `#535bf2` link colors are the Vite purple, not a brand color. The
  global `a:hover { color: #535bf2 }` is exactly why `.claude/rules/ui-components.md`
  has to tell every Discord-styled link to re-override `color: white` on all states.
  Fixing the root removes that recurring footgun.
- The base `button { ... }` block (border-radius 8px, `#1a1a1a` bg, `#646cff` hover
  border) is dead weight — the `Button` component and `.btn` classes set their own
  everything. It only affects raw `<button>` elements that bypass the component.

## Target lines (current `src/index.css`)

1. **Lines 16–23** — `a` / `a:hover` using `#646cff` / `#535bf2`.
2. **Lines 48–65** — base `button` / `button:hover` / `button:focus` Vite defaults.
3. **Lines 67–78** — the entire `@media (prefers-color-scheme: light)` block.

Lines 1–14 (`:root` Barlow + dark base), 25–46 (`body` near-black bg, headings,
`p`), and 80–101 (mobile overflow guards) are **legitimate and stay.**

## Plan

### Step 1 — Decide link treatment (the only real decision)
Pick an intentional link color consistent with `DESIGN.md`:
- **Recommended:** inherit/white in-content (`a { color: inherit }` or a white-alpha),
  letting buttons and explicitly-styled links own their color. This matches the
  "Light-Not-Paint" posture and kills the purple-link footgun at the source.
- Verify no surface depends on the old `#646cff` link blue as an affordance (grep
  `646cff` / `535bf2` across `src/` and `app/` — expect only `index.css` + the
  `--glow-*` defaults, which are unrelated RGB channel values).

### Step 2 — Remove the base `button` block (lines 48–65)
Confirm there are no raw `<button>` elements relying on the `#1a1a1a` fill /
`#646cff` hover border (audit non-`.btn` buttons; most go through the `Button`
component). Remove the block, or reduce it to a minimal `cursor: pointer` reset if
any bare buttons remain.

### Step 3 — Remove the `prefers-color-scheme: light` block (lines 67–78)
Delete it outright. The app is dark-only; there is no light theme to preserve.
Confirm `color-scheme` on `:root` (line 6, currently `light dark`) should become
`dark` so form controls / scrollbars render dark consistently.

### Step 4 — Verify
- `npm run build` and `npm run lint` clean.
- Spot-check in light-mode OS setting: landing, sealed pool, deck builder, a modal,
  and an error page — no white flashes, links look intentional, buttons unchanged.
- Quick pass over Discord buttons (auth widget, login) — still white text; ideally
  the per-component `color: white` overrides are now redundant (leave them, but note
  the footgun is gone at the root).

## Risk & scope

- **Low risk.** No component restyle; this removes overrides that mostly already lose
  to component CSS. The one behavioral change users could notice is link color — hence
  Step 1 is a deliberate choice, not a silent delete.
- **Out of scope:** the `Button`/`Modal`/`Card` systems, the `--glow-*` variables, and
  anything in `DESIGN.md` proper. This is strictly the `index.css` Vite residue.

## Done criteria
Move this file to `docs/` once merged. Update `DESIGN.md`'s final "Don't restore the
residual Vite scaffolding" note to past tense (or drop it) since the residue is gone.
