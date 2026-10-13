---
name: Protect the Pod
description: Star Wars Unlimited draft & sealed simulator — your own holotable, re-skinned by the table you sit at
colors:
  # ── Theme roles ────────────────────────────────────────────────────────────
  # Every site theme supplies all sixteen (src/presentation/purrgil/themes.json,
  # contract in theme-contract.ts) and they reach CSS as --theme-<role>. The
  # values below are the DEFAULT theme, Purrgil Passage: reference values for
  # previews and specs, never hexes to paste. Components consume the roles.
  # tokens.test.ts asserts these match the purrgil entry in themes.json.
  theme-canvas: "#141128"
  theme-surface: "#1C1930"
  theme-surface-raised: "#252239"
  theme-surface-hover: "#2D2A41"
  theme-text: "#F5F3EF"
  theme-text-muted: "#C0C9CE"
  theme-accent: "#C7B0FA"
  theme-accent-hover: "#D3BCFF"
  theme-on-accent: "#10151B"
  theme-highlight: "#8CDDDF"
  theme-border: "#859399"
  theme-focus: "#C7B0FA"
  theme-success: "#A4E4B5"
  theme-warning: "#F3D38B"
  theme-danger: "#FFB0AD"
  theme-info: "#ABD6FF"
  # ── Game data (theme-invariant, --pt-*) ────────────────────────────────────
  aspect-vigilance: "#4A90E2"
  aspect-command: "#27AE60"
  aspect-aggression: "#E74C3C"
  aspect-cunning: "#F1C40F"
  aspect-villainy: "#1A1A1A"
  aspect-heroism: "#F0F0F0"
  aspect-none: "#888888"
  rarity-common: "#999999"
  rarity-uncommon: "#4CAF50"
  rarity-rare: "#2196F3"
  rarity-legendary: "#FF9800"
  rarity-special: "#9C27B0"
  kind-ground: "#C58B4E"
  kind-space: "#6F8CFF"
  kind-event: "#B07CD8"
  kind-upgrade: "#4FC3B0"
  keyword: "#D0545A"
  positive: "#3DDC84"
  discord: "#5865F2"
  discord-deep: "#4752C4"
  # ── Legacy palette (--pt-*) ────────────────────────────────────────────────
  # The original near-black palette. Under the site theme, site-theme.css
  # re-points each of these at a theme role (trailing comment). Only the deck
  # builder and un-themed pages see the raw values. Never use in new code.
  bg-void: "#0A0A0A"               # → canvas
  surface-base: "#000000"          # → surface
  surface-modal-from: "#1A1A1A"    # → surface
  surface-modal-to: "#2A2A2A"      # → surface-raised
  page-base: "#4C4D51"             # → canvas
  ink: "#FFFFFF"                   # → text
  ink-base: "#FFFFFFDE"            # → text
  ink-muted: "#FFFFFFCC"           # → text-muted
  ink-subtle: "#FFFFFFB3"          # → text-muted
  border: "#FFFFFF4D"              # → border
  border-strong: "#FFFFFF80"       # → border
  border-subtle: "#FFFFFF33"       # → border mixed 40% transparent
  glow-primary: "#00FF00"          # → accent
  glow-interactive: "#2196F3"      # → highlight
  glow-danger: "#FF0000"           # → danger
  amber-paused: "#FFC107"
  gold-warning: "#FFD700"
typography:
  page-title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1
  meta:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  # UI-chrome scale: buttons, inputs, panels, dialogs.
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  # Card art corners are percent-based (see Components); this is the legacy
  # fixed fallback for .canvas-card.
  card: "11px"
  full: "50%"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.theme-accent}"
    textColor: "{colors.theme-on-accent}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.5rem"
  button-primary-hover:
    backgroundColor: "{colors.theme-accent-hover}"
    textColor: "{colors.theme-on-accent}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.theme-surface-raised}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.5rem"
  button-secondary-hover:
    backgroundColor: "{colors.theme-surface-hover}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.sm}"
  button-danger:
    backgroundColor: "{colors.theme-surface-raised}"
    textColor: "{colors.theme-danger}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.5rem"
  button-toggle-active:
    backgroundColor: "{colors.theme-surface-raised}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.8rem"
  button-discord:
    backgroundColor: "{colors.discord}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.5rem"
  header-tool:
    backgroundColor: "transparent"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.sm}"
    size: "36px"
  header-tool-hover:
    backgroundColor: "{colors.theme-surface-raised}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.theme-surface}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  panel:
    backgroundColor: "{colors.theme-surface}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.lg}"
    padding: "12px"
  dialog:
    backgroundColor: "{colors.theme-surface}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.lg}"
    padding: "2rem"
---

# Design System: Protect the Pod

## 1. Overview

**Creative North Star: "The Themed Holotable"**

Protect the Pod is a table you sit down at. Every page rests on a photographed
tabletop: Purrgil Passage by default, or any of 31 other scenes the player
picks. The art is darkened under a radial scrim and fades, below the first
screen, into the theme's solid canvas. Interface surfaces are laid on that
table like opaque play mats, tinted to the scene. The theme's pastel **accent**
is the one lit thing on the table: the primary action, the selected state, the
focus ring. Everything else is calm and legible, so the cards and the act of
playing stay in front.

**Theming is the system, not a skin on top of it.** There is no single
palette. There is a sixteen-role contract (canvas, three surfaces, two inks,
accent / accent-hover / on-accent, highlight, border, focus, and four status
colors) that every theme fills, and every component is written against those
roles. A screen that only looks right in Purrgil Passage is a broken screen.
The aspect, rarity and card-kind colors are the one exception: they are game
data and never change with the theme.

One family, Barlow, carries everything. One header carries every page: the
logo mark pinned top-left, the page title at the true centre, the tools
(release notes, Themes, Settings, account) on the right. Spectacle is a budget
spent on the pack crack and the table art itself; the deck builder, history,
stats and settings stay quiet. The system rejects the light, flat,
gray-on-white SaaS dashboard; cluttered, spreadsheet-y walls of controls;
anything that reads as official FFG / Disney branding; and childish, toy-like,
over-animated styling.

**Key Characteristics:**
- Photographic table art under a scrim is the page background; panels are opaque theme surfaces on top of it.
- Sixteen theme roles, thirty-two themes, zero hard-coded UI colors.
- The accent is a solid fill for the one primary action per view, and the selected/focus color everywhere else.
- Surfaces climb in fixed tonal steps above the canvas (about +8 / +17 / +25 per RGB channel), never by drop shadow.
- Barlow only: 800 for titles, 600 for controls, 400 for prose.
- Aspect, rarity and card-kind colors are data, identical in every theme.

## 2. Colors: The Sixteen-Role Contract

A dark, scene-tinted canvas; three opaque surface steps; warm off-white ink;
one pastel accent and one contrasting highlight per theme; four soft status
colors. The frontmatter shows Purrgil Passage. Other themes swap the values,
never the roles. Every theme clears WCAG AA on every text/surface pairing, and
`src/styles/tokens.test.ts` keeps it that way.

### Primary
- **Accent** (`--theme-accent`; lavender in Purrgil): the primary-action fill
  (with `--theme-on-accent` ink), the selected/pressed border on toggles,
  checkbox `accent-color`, and the source of the hover glow. Pastel in every
  theme, so the dark on-accent ink clears 9:1 on it.
- **Accent Hover** (`--theme-accent-hover`): the primary fill on hover, one
  step lighter, never darker.
- **Focus** (`--theme-focus`): the keyboard focus ring. It equals the accent
  in every current theme; reference the `focus` role anyway so a theme can
  split them.

### Secondary
- **Highlight** (`--theme-highlight`; teal in Purrgil): the contrasting second
  hue for informational emphasis, the legacy "interactive" glow, and callouts
  inside dense data. Each theme picks it to oppose the accent (lavender ↔ teal,
  ice-blue ↔ sand), so never put both on one control.

### Tertiary
- **Success** (`--theme-success`): wins, completed states, "go" in the pod hub.
- **Warning** (`--theme-warning`): draws, paused timers, caution.
- **Danger** (`--theme-danger`): destructive actions, losses, errors. A soft
  coral in every theme, used as text on a neutral surface, never as a red fill.
- **Info** (`--theme-info`): neutral notices.
- **Discord Blurple** (`discord` / `discord-deep`): Discord sign-in only. An
  external brand handshake, never a generic accent.
- **Game data:** aspects (Vigilance, Command, Aggression, Cunning, Villainy,
  Heroism, none), rarities (common → special), card kinds (ground, space,
  event, upgrade), keyword red, positive green. Identical in every theme.

### Neutral
- **Canvas** (`--theme-canvas`): the theme's darkest tone. It shows where the
  table art has faded out and behind the pack-opening reveal.
- **Surface** (`--theme-surface`): panels, dialogs, inputs, drawers.
- **Surface Raised** (`--theme-surface-raised`): secondary buttons, header-tool
  hover, emphasis inside a panel.
- **Surface Hover** (`--theme-surface-hover`): hover state for anything resting
  on surface-raised.
- **Text** (`--theme-text`): headings and body copy. Warm off-white, not pure
  white.
- **Text Muted** (`--theme-text-muted`): subtitles, metadata, placeholders,
  footer. It clears 8:1 on surface-raised in every theme: muted is a tone, not
  a whisper.
- **Border** (`--theme-border`): the 1px stroke on panels, inputs and
  secondary buttons. Subtle dividers mix it 40% toward transparent.

### Named Rules
**The Role-Not-Hex Rule.** UI CSS names a role (`var(--theme-surface)`), never
a color. A hex in component CSS breaks 31 of 32 themes, and
`npm run check:design-tells` flags it. Hexes live only in themes.json and
tokens.css.

**The Every-Theme Rule.** Before shipping a surface, view it in Purrgil Passage,
a warm theme (Tatooine) and FFG. If it only works in one, it's using a value
instead of a role.

**The One-Lit-Thing Rule.** One solid accent fill per view: the primary action.
Secondary actions sit on surface-raised. Two accent buttons side by side means
one of them isn't primary.

**The Aspect-Is-Data Rule.** Aspect, rarity and kind colors represent the game,
never UI state. Never borrow Command green for success; that's
`--theme-success`. Never convey any of them by color alone: aspects use the
aspect icon art (`public/icons/*.png`), rarities the rarity icons
(`RarityIcon` / `RarityLabel`), card kinds the kind glyphs (`KindIcon` /
`KindLabel`), all from `src/components/CardIcons.tsx`. No colored rarity text,
no dots, no C/U/R/L letters.

## 3. Typography

**Display / Body / Label Font:** Barlow (fallback `system-ui, sans-serif`),
weights 400 / 500 / 600 / 700 / 800.

**Character:** One slightly condensed, mechanical grotesque does all the work.
Hierarchy comes from weight contrast (800 titles against 400 prose) and from
the muted ink role, not from a second family or oversized type.

### Hierarchy
- **Page Title** (800, 1.625rem, or 1.125rem under 600px; line-height 1.15;
  −0.01em): rendered in the site header, centered, on one line with an
  ellipsis, with a dark text-shadow so it reads over table art. Pages render
  exactly one h1, and the header mirrors it.
- **Subtitle** (500, 0.875rem, or 0.75rem on mobile; text-muted): the page's
  one short line, carried into the header beneath the title.
- **Headline** (800, 1.5rem): dialog titles and major in-page section heads.
- **Title** (700, 1.125rem): panel and card-group headings.
- **Body** (400, 1rem, line-height 1.5): prose, capped at 65–75ch.
- **Body Small** (400, 0.875rem): dialog copy, descriptions, secondary list text.
- **Label** (600, 0.875rem): buttons, toggles, chips, tabs.
- **Meta** (500, 0.75rem, text-muted): footer, timestamps, counts.

### Named Rules
**The One-Family Rule.** Barlow only. Escalate weight before size, and size
before adding anything. The Orbitron load in `app/layout.tsx` is unused; don't
start using it.

**The Title-Case Rule.** Labels and headings read "Your Leaders" and "Deck
Stats", never "YOUR LEADERS". Counts go in parens: "Your Drafted Leaders
(2/3)". The one sanctioned uppercase style is the Play-home `.ph-kicker`
(11px, 700, 0.12em tracking) on Play-home rails. Never put it above every
section.

**The Header-Owns-The-Title Rule.** Never build a page-level header row or a
large in-page h1. The title lives in the shared header at page-title scale.

## 4. Elevation

Tonal layering, not shadows. Depth is the surface ladder: canvas → surface →
surface-raised → surface-hover, each a fixed step lighter. Panels are opaque,
or at most 12% translucent where the Play bundle uses "glass", so table art
never fights text. Shadows exist only to separate foreground from art, and as a
response to interaction.

### Shadow Vocabulary
- **Interaction lift** (`transform: translateY(-2px)` plus `box-shadow: 0 6px 16px rgba(<role>, 0.6)`):
  buttons and Play tiles on hover. The glow takes the theme's accent, danger or
  highlight through the `--pt-glow-*-rgb` channels each theme writes.
- **Mark lift** (`filter: drop-shadow(0 6px 14px rgba(0,0,0,.55))`): the corner
  logo and homepage masthead, so the mark floats on any table art.
- **Title legibility** (`text-shadow: 0 1px 2px rgba(0,0,0,.85), 0 0 14px rgba(0,0,0,.6)`):
  the header title only.
- **Overlay** (`box-shadow: 0 12px 32px #0008`): toasts and floating menus.
- **Homepage ember** (`radial-gradient(closest-side, rgba(255,150,60,.22), transparent)`):
  the faint warm glow behind the homepage masthead. That one place only.

### Named Rules
**The Ladder-Not-Shadow Rule.** If two surfaces need separating, step one up
the ladder. A drop shadow on a resting panel is wrong.

**The Art-Is-Background Rule.** Table art appears only as the page background,
the pack-opening backdrop and the draft-table scene. Never inside a panel,
never as a texture, never stretched: uniform `cover` only (see
`public/table-environments/THEME-AUTHORING.md`).

## 5. Components

Controls are compact, softly rounded (6px) and opaque. Variants differ by which
role fills them, not by glow color.

### Buttons
Always use `src/components/Button`. Base: Barlow 600, 6px radius, 0.5rem gap
between icon and label. Sizes run xs (28px tall), sm, md, lg; icon buttons are
28, 36 or 44px square.
- **Primary:** solid accent fill with on-accent ink. Hover goes to
  accent-hover with the −2px lift and accent glow. One per view.
- **Secondary (default):** surface-raised fill, 1px border, text ink. Hover
  goes to surface-hover.
- **Danger:** secondary chrome with danger-colored text. A Cancel that discards
  work uses danger plus a trash icon.
- **Toggle / segmented:** neutral at rest. Active (`aria-pressed`) adds an
  accent border plus an `inset 0 0 0 1px` accent ring. Use `variant="toggle"`;
  never hand-roll one.
- **Discord:** solid blurple with white ink in every state.
- **Back:** hidden under the site theme. Navigation is browser history plus the
  header; don't add destination back buttons.
- **Focus / disabled:** focus is a 2px solid outline at 2px offset. Disabled
  buttons get no lift and no glow.

### Header (site shell)
- 3-column grid, max-width 1400px, 100px tall (68px under 600px), padding
  10px 32px.
- **Mark:** a 100px round logo (60px on mobile) pinned top-left on every page;
  hover scales 1.04. On `/` it gives way to a 188px centered masthead.
- **Title:** page-title type at the true centre. The side columns reserve
  equal width so the title never drifts.
- **Tools:** 36×36 transparent icon buttons with 22px, 1.6-stroke icons. Hover
  fills surface-raised; focus is a 2px outline at 3px offset. The account
  avatar sits 16px apart and follows scroll.
- **Active drafts:** the wallpaper is hidden and the header becomes surface at
  90% opacity.

### Panels / Containers
- **Panel:** surface fill, 1px border, 12px radius, equal 12px insets on all
  four sides, sized to its content.
- **Border-mounted label:** a titled panel puts its compact title on the top
  border over a surface-colored patch, like a fieldset legend. No separate
  header row.
- **Dialog:** surface fill, 12px radius, 2rem padding. Page scroll locks while
  it's open, and its own scroll never chains out to the page.
- **Tiles (Play home):** 12px radius, art under a bottom-weighted black
  gradient behind the caption, −2px lift and glow on hover.

### Inputs / Fields
- **Style:** surface fill, 1px border, text ink, text-muted placeholder, 8px
  radius. Checkboxes and radios use the accent as `accent-color`.
- **Focus:** exactly one ring, a 2px solid outline at `outline-offset: -1px`,
  drawn over the field's own border. Never a second ring around it. New code
  colors it with `--theme-focus`. Older rules draw it through
  `--pt-glow-interactive`, which resolves to highlight.
- **Search:** slim (about 30px tall, 0.82rem), width-capped
  (`flex: 0 1 ~220px`), 8px radius. Never a fat pill.

### Chips & Segmented Controls
- **Chip:** 28px tall, pill radius (half the height), 700 13px, on
  surface-raised.
- **Segmented group:** a recessed track (3px padding, 8px radius) of 6px
  buttons. The pressed segment is the one high-contrast fill.

### Feedback
- **Skeletons:** content-shaped blocks at `rgba(255,255,255,.09)` with a 6px
  radius and a 1.5s opacity pulse that stops under reduced motion. Never a
  spinner, never "Loading…" copy.
- **Toasts:** surface fill, accent border, 10px radius, overlay shadow.
  Bottom-left on Play, top-left below the header elsewhere, and hidden during
  the pack reveal.

### Footer
Centered, max-width 1160px, meta type. Links are text-colored at 0.7 opacity,
going to 1 with an underline on hover. Short pages pin the footer to the
viewport bottom with a full-height column; it is never fixed over content.

### Signature: Table Art, Pack Reveal, Cards
- **Table art:** the theme scene under a
  `radial-gradient(ellipse at 50% 30%, rgba(0,0,0,.35), rgba(0,0,0,.78) 80%)`
  scrim. It scrolls with the page and fades, through a 36px-blurred copy of its
  own lower edge, into the canvas. FFG reproduces the original textured
  background.
- **Pack opening:** the reveal sits under the header and repaints the table art
  behind it; Skip is a quiet text-muted control. This is where the motion
  budget is spent.
- **Card art:** corners are percent-based (3.5% / 2.5% for portrait cards,
  2.5% / 3.5% for landscape leaders and bases), shared by selection rings and
  clipping. Cropped leader thumbnails use
  `object-position: center 0; transform: scale(1.8)`, never a translateY.
- **Deck builder exception:** the deck builder deliberately keeps the legacy
  near-black palette (tokens.css re-asserts it under `.deck-builder`). Only its
  page background is themed.

## 6. Do's and Don'ts

### Do:
- **Do** write every UI color as a theme role (`var(--theme-surface)`,
  `var(--theme-accent)`), and check the result in Purrgil Passage, Tatooine and
  FFG.
- **Do** give each view exactly one accent-filled primary action. Everything
  else sits on surface-raised.
- **Do** separate surfaces by stepping up the ladder (surface → raised →
  hover), not with shadows.
- **Do** put the page title in the shared header: one h1 per page, `SiteTitle`
  for editable titles, and `data-site-title="keep"` only when the h1 must stay
  in-page.
- **Do** use equal 12px insets and border-mounted labels on titled panels.
- **Do** draw one focus ring per control: 2px in the focus role, offset −1px on
  fields and 2–3px on buttons.
- **Do** load with content-shaped skeletons, and honor
  `prefers-reduced-motion` on lifts, glows, the pack reveal and foil shimmer.
- **Do** wrap every `:hover` rule in `@media (hover: hover) and (pointer: fine)`.
- **Do** pair aspect colors with the aspect icon art, and show rarity and card kind with `RarityLabel` / `KindLabel` (icon plus name).

### Don't:
- **Don't** hard-code a hex, `white` or `rgba(0,0,0,.7)` in UI CSS. There is
  no single palette to hard-code against.
- **Don't** ship anything that looks like a **generic SaaS dashboard** (light,
  flat, gray-on-white), or anything **cluttered or spreadsheet-y**. Data
  supports the cards, never buries them.
- **Don't** look **official / affiliated** with FFG or Disney Star Wars:
  Unlimited branding.
- **Don't** go **childish or cartoonish**: no toy styling, no bounce or elastic
  easing, no always-on animation.
- **Don't** use the old holotable vocabulary: green "go" glows, red "danger"
  glows, `#0A0A0A` voids, translucent black glass panels, or the
  `#1A1A1A → #2A2A2A` modal gradient. Those are legacy values the theme
  re-points.
- **Don't** put table art inside panels, tile it, or scale it unequally.
- **Don't** build a page header row, a centered mini-logo or destination back
  buttons. The shared header owns all three.
- **Don't** use ALL-CAPS headings, uppercase eyebrows above sections, or
  `border-left` / `border-right` color stripes.
- **Don't** put ↗ open-in-new-tab arrows on links or buttons, or link-blue text
  on a link styled as a button.
- **Don't** use negative margins to pull content up over text.
- **Don't** reuse Discord blurple or the aspect, rarity or kind colors as UI
  accents.
