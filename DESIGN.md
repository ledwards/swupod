---
name: Protect the Pod
description: Star Wars Unlimited draft & sealed simulator — a dark holotable lit by interaction
colors:
  bg-void: "#0A0A0A"
  surface-base: "#000000"
  surface-modal-from: "#1A1A1A"
  surface-modal-to: "#2A2A2A"
  page-base: "#4C4D51"
  ink: "#FFFFFF"
  ink-muted: "#FFFFFFCC"
  ink-subtle: "#FFFFFFB3"
  ink-base: "#FFFFFFDE"
  border: "#FFFFFF4D"
  border-strong: "#FFFFFF80"
  border-subtle: "#FFFFFF33"
  glow-primary: "#00FF00"
  glow-danger: "#FF0000"
  glow-interactive: "#2196F3"
  discord: "#5865F2"
  discord-deep: "#4752C4"
  amber-paused: "#FFC107"
  gold-warning: "#FFD700"
  aspect-vigilance: "#4A90E2"
  aspect-command: "#27AE60"
  aspect-aggression: "#E74C3C"
  aspect-cunning: "#F1C40F"
  aspect-villainy: "#1A1A1A"
  aspect-heroism: "#F0F0F0"
  aspect-none: "#888888"
typography:
  display:
    fontFamily: "Barlow, system-ui, Avenir, Helvetica, Arial, sans-serif"
    fontSize: "3.2rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "normal"
  headline:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
  title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  card: "8px"
  full: "50%"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-secondary:
    backgroundColor: "{colors.surface-base}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.5rem"
  button-primary:
    backgroundColor: "{colors.surface-base}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.5rem"
  button-primary-hover:
    backgroundColor: "{colors.surface-base}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  button-danger:
    backgroundColor: "{colors.surface-base}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.5rem"
  button-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ink-subtle}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.8rem"
  button-discord:
    backgroundColor: "{colors.discord}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.5rem"
  modal-content:
    backgroundColor: "{colors.surface-modal-from}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "2rem"
  card-box:
    backgroundColor: "{colors.surface-base}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.5rem 1.5rem"
---

# Design System: Protect the Pod

## 1. Overview

**Creative North Star: "The Holotable"**

Protect the Pod is a dark room lit by a glowing tabletop. Surfaces rest in
near-black (`#0A0A0A`) over a faint textured starfield; nothing announces itself
until you reach for it. Color is treated as *light*, not paint — a control sits
quiet and translucent at rest, then a colored glow and a small lift bloom the
instant you hover or focus it. That single move (flat dark → glow on interaction)
is the whole personality: cinematic where it counts, calm everywhere else. It
reads unmistakably Star Wars-adjacent — deep space, holographic glow, the
anticipation of cracking a booster — without ever imitating official Fantasy
Flight / Disney branding. The fan-made character is a feature, not an apology.

Density is purposeful, not maximal. The cards and the act of playing come first;
data (counts, odds, history) supports from the edges and never buries the table.
A player should go from landing to opening their first pack in seconds and trust
that what they're practicing against mirrors the real game. One typeface (Barlow)
carries everything — display through data — so the system stays coherent across
the simulator, deck builder, and dashboards.

This system explicitly **rejects** the light, flat, gray-on-white SaaS dashboard
look; spreadsheet-density UIs that drown the cards in controls; anything that
looks officially licensed; and childish, toy-like, over-animated styling. It is
for players who take limited seriously.

**Key Characteristics:**
- Near-black canvas; color enters only as interactive light (glow + lift).
- One family, Barlow, from ExtraBold display to 400-weight body.
- Spectacle is a *budget* — spent on the pack-crack, withheld from routine surfaces.
- Semantic glow vocabulary: green = go, red = destructive, blue = interactive.
- SWU aspect colors are domain data, never decoration.

## 2. Colors

A near-black canvas where the only saturated color is light: semantic glows on
interaction, and the six SWU aspect colors as functional game data.

### Primary
- **Go Green** (`#00FF00`): The primary-action glow. Appears as a hover border and
  `box-shadow` halo on confirm / continue / save buttons, and as the green text of
  text-only "Add" actions. Never a fill at rest — it's the light a primary control
  emits when touched.

### Secondary
- **Interactive Blue** (`#2196F3`): The glow for informational / interactive
  controls and the default custom-glow (`--glow-r/g/b` = 33/150/243). Used for
  toggle emphasis and info actions, never for destructive or confirming ones.
- **Danger Red** (`#FF0000`): The destructive / back glow — delete, cancel-that-
  discards, back navigation. Text-only danger uses a softened `#FF6464`.

### Tertiary
- **Discord Blurple** (`#5865F2`, deep `#4752C4`): Reserved exclusively for Discord
  auth actions. It is a brand handshake, not part of the app palette — never reuse
  it for generic UI.
- **Paused Amber** (`#FFC107`) / **Warning Gold** (`#FFD700`): Timer-paused state and
  danger-modal titles. Caution, not action.
- **SWU Aspect Colors** — functional game data, used for card theming, deck aspect
  tracking, and per-set accents (via `--set-color`):
  Vigilance `#4A90E2` (blue), Command `#27AE60` (green), Aggression `#E74C3C` (red),
  Cunning `#F1C40F` (yellow), Villainy `#1A1A1A` (black), Heroism `#F0F0F0` (white),
  No-aspect `#888888` (grey). Heroism lightens / Villainy darkens a paired aspect.

### Neutral
- **Void** (`#0A0A0A`, `hsl(0 0% 4%)`): The body background — the dark of the room.
- **Page Base + Texture** (`#4C4D51` under stacked black gradients + a starfield
  texture image): the `.page-background` atmosphere that sits behind content.
- **Surface Black** (`#000000` at 0.5–0.7 alpha, `backdrop-filter: blur(10px)`):
  translucent panels, card-boxes, and resting buttons. The blur is what makes them
  read as glass laid on the table, not opaque blocks.
- **Modal Gradient** (`#1A1A1A` → `#2A2A2A`, 135°): the one place a surface is
  opaque and lifted, to pull focus above the dimmed table.
- **Ink** — white at descending alpha: headings pure `#FFFFFF`; base text `0.87`
  (`#FFFFFFDE`); body `0.8` (`#FFFFFFCC`); muted / placeholder `0.7` (`#FFFFFFB3`).
- **Borders** — white at low alpha: `0.3` default (`#FFFFFF4D`), `0.5` hover
  (`#FFFFFF80`), `0.2` subtle (`#FFFFFF33`).

### Named Rules
**The Light-Not-Paint Rule.** Saturated color is emitted by controls on
interaction (hover/focus border + glow), never used as a resting fill on a button
or panel. If an accent is sitting still and colored, it's wrong — make it a glow.

**The Aspect-Is-Data Rule.** The six aspect colors are reserved for representing
SWU card aspects and set identity. Never borrow Command-green or Aggression-red for
generic UI accents; that's what the semantic glows are for. And never rely on
aspect color *alone* to convey meaning — always pair with icon, pip, or label.

## 3. Typography

**Display / Body / Label Font:** Barlow (fallback: `system-ui, Avenir, Helvetica,
Arial, sans-serif`), weights 400 / 500 / 600 / 800.

**Character:** One humanist-leaning grotesque doing all the work. The drama comes
from *weight contrast* — ExtraBold (800) headings against 400 body — not from a
second family. Barlow's slightly condensed, mechanical edge suits a sci-fi game
tool without tipping into novelty.

### Hierarchy
- **Display** (800, `3.2rem`, line-height 1.1): page `h1` titles. Tight leading for
  a confident, poster-like stack.
- **Headline** (800, `~1.25–1.5rem`, line-height 1.1): section and modal-scale `h2`/`h3`.
- **Title** (600, `1.5rem`): modal titles and prominent labels — heavy but not ExtraBold.
- **Section header** (600, `1rem`, white, title case): card-box headers ("Leaders",
  "Your Deck (28 cards)") — title case with counts in parens, never ALL-CAPS.
- **Body** (400, `1rem`, line-height 1.5–1.6): prose and descriptions. Cap reading
  prose at 65–75ch; dense data (tables, lists) may run tighter.
- **Label** (600, `0.85–1rem`, line-height 1): button text and controls.

### Named Rules
**The One-Family Rule.** Barlow carries the entire interface. Do not introduce a
second typeface for "display" flavor — escalate weight (→ 800) or size instead.

**The Title-Case Rule.** Headers read "Leaders" and "Your Deck", never "LEADERS".
Pure white text, no top margin, counts in parens.

## 4. Elevation

Glow-as-elevation. Surfaces are **flat at rest** — translucent near-black panels,
distinguished from the background by `backdrop-filter: blur(10px)` and a 1px white-
alpha border, not by drop shadows. Depth is a *response to state*: on hover/focus a
control lifts `translateY(-2px)` and emits a colored `box-shadow` glow in its
semantic hue. Ambient resting shadows are reserved for the two surfaces that must
float above the table — modals and the highest overlays.

### Shadow Vocabulary
- **Interaction glow** (`box-shadow: 0 6px 16px rgba(<semantic>, 0.6)`): the bloom on
  hover for primary (green) / danger (red) / interactive (blue) buttons. Paired with
  the `-2px` lift. This is the system's primary depth cue.
- **Modal lift** (`box-shadow: 0 8px 32px rgba(0,0,0,0.5)`): the one ambient drop
  shadow, plus a `blur(4px)` backdrop over a `rgba(0,0,0,0.8)` scrim, to seat the
  modal above the dimmed page.
- **Text glow** (`text-shadow: 0 0 8px rgba(<semantic>, 0.5)`): for text-only actions
  (green "Add", red "Remove") whose only hover affordance is their own light.

### Named Rules
**The Flat-At-Rest Rule.** No element carries a colored shadow or lift until the
user interacts with it. If a button glows while idle, the spectacle budget is
being spent in the wrong place — routine surfaces stay quiet.

## 5. Components

Resting state is uniform across the system: translucent `rgba(0,0,0,0.7)` fill, 1px
`rgba(255,255,255,0.3)` border, white text, `0.2s ease` transition. Variants differ
only in the *glow they emit on interaction*.

### Buttons
- **Shape:** softly rounded (`6px`). Icon buttons are square (28/36/44px by size).
- **Secondary (default):** translucent black, white 0.3 border. Hover: border →
  0.5, background darkens, `-2px` lift. The neutral baseline for Cancel / general
  actions.
- **Primary:** same resting look with a heavier 2px border. Hover: border → Go Green
  `0.8`, green `0 6px 16px` glow, `-2px` lift. Confirms and CTAs only.
- **Danger / Back:** hover → Danger Red border + red glow. Destructive and back nav.
  (Cancel-that-discards-work uses danger + a trash icon, not secondary.)
- **Interactive:** hover → Interactive Blue border + blue glow. Info / interactive.
- **Toggle:** transparent, white-0.2 border, `0.7` ink. Active state fills
  white-`0.15` with white-`0.5` border + full white ink — the segmented/filter
  vocabulary (pair with `glowColor="blue"` for emphasis).
- **Discord:** solid Blurple fill (`#5865F2` → `#4752C4` hover) — the only solid-fill
  resting button, because it's an external brand handshake.
- **Text-only:** no chrome; green (primary) or red (danger) text that gains a text-
  shadow glow on hover. For inline "Add All" / "Remove All" actions.
- **Icon + text:** always a `gap: 0.5rem` (8px) — never jam icon against label.

### Cards / Containers
- **Card-box** (`.card-box`): translucent black (`rgba(0,0,0,0.5)`),
  `backdrop-filter: blur(10px)`, 1px white-0.2 border, `12px` radius, reduced top
  padding (`1rem 1.5rem 1.5rem`) so the title sits near the top edge. Center-aligned.
- **Canvas card** (`.canvas-card`): the card primitive — `8px` radius, with
  `.selected`, `.disabled` (grayscale/dim), and `.foil` (shimmer) states.
- **Modal** (`.modal-content`): opaque `#1A1A1A → #2A2A2A` gradient, 2px white-0.3
  border, `12px` radius, `2rem` padding, ambient drop shadow. `--danger` variant
  shifts the border and title to red/gold. Mobile: actions stack full-width.

### Inputs / Fields
- Dark translucent field, white-alpha stroke, modest radius. Focus is signalled by a
  border-color shift toward the relevant semantic hue (consistent with the glow
  language), not a default browser ring.

### Navigation — Tabs (Folder Pattern)
- Tabs have rounded *top* corners (`8px 8px 0 0`) and a flat bottom; the active tab
  hides its bottom border and overlaps the content container by `-1px` so it "sits
  on" the folder. Content area: flat top, `12px` bottom corners. Per-set tab accents
  via `--set-color`.

### Signature — Pack Opening & Foil
- **PackOpeningAnimation:** the spectacle moment. Full-screen pack row (desktop) /
  swipe carousel (mobile), tap-to-open card flip (back → front reveal), "Open All"
  and Skip. This is where the motion budget is spent.
- **Foil shimmer** (`foil-shimmer`, 6s): soft, diffuse, blurred (8–10px) rainbow wave
  on overlay blend, one-way top-left → bottom-right. The canonical foil treatment
  everywhere. (Rainbow-border, 3s, is reserved for special showcase emphasis only.)
- **Skeletons:** `.skeleton-line/-block/-tab/-row` shimmer (`1.5s`) — loading uses
  layout-matched skeletons, never a centered spinner.

## 6. Do's and Don'ts

### Do:
- **Do** keep surfaces flat and translucent at rest; let colored glow + a `-2px` lift
  appear only on hover/focus (`box-shadow: 0 6px 16px rgba(<semantic>, 0.6)`).
- **Do** use the `Button` component for every button, and match glow to intent:
  green = confirm, red = destructive/back, blue = interactive.
- **Do** keep one typeface (Barlow); escalate to weight 800 or larger size for
  emphasis instead of adding a display font.
- **Do** write section headers in Title Case with counts in parens ("Your Deck (28
  cards)"), pure white, no top margin.
- **Do** give every icon+text element an explicit `gap: 0.5rem`.
- **Do** reserve aspect colors for SWU card/aspect/set data, and always pair them
  with icon/label so color-blind players aren't excluded.
- **Do** load with layout-matched skeletons, and honor `prefers-reduced-motion` with
  a crossfade/instant fallback for the pack-open, foil, and glow animations.
- **Do** spend spectacle on the pack-crack; keep deck builder, history, and settings
  quiet.

### Don't:
- **Don't** ship the light, flat, gray-on-white **SaaS dashboard** look. This is a
  game tool, not a B2B analytics app. (No light mode — see below.)
- **Don't** drown the table in **spreadsheet density** — competing controls and dense
  data must support the cards, never bury them.
- **Don't** imitate **official Fantasy Flight / Disney** Star Wars: Unlimited
  branding. Stay distinctly fan-made.
- **Don't** go **childish or cartoonish** — no toy-like styling or gratuitous,
  always-on animation.
- **Don't** use a saturated accent as a *resting* fill (violates Light-Not-Paint).
  Discord Blurple is the single sanctioned exception.
- **Don't** reuse Discord Blurple, aspect colors, or amber/gold for generic UI accents.
- **Don't** use ALL-CAPS section headers, gray-on-black body text below `0.7` alpha,
  or `border-left`/`border-right` color stripes as accents.
- **Don't** restore the residual Vite scaffolding in `src/index.css` — the
  `#646cff` link color, the `button:hover { border-color: #646cff }`, and the
  `@media (prefers-color-scheme: light)` block are vestigial defaults, **not** part
  of this system. The app is dark-only.
