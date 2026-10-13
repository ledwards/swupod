# SWUPOD Style Guide

How to build UI that fits the site theme. **`DESIGN.md` (repo root) is the
design system**: theme roles, type, elevation, and the rules behind them. This
guide covers the practical side: which components to use, which classes and
variables to reach for, and the patterns that keep coming up.

**See it live at `/style-guide`** (alpha only): every role, every theme side by side, and the real components, with a theme switcher and a numbered list of known issues (`src/components/StyleGuide/`).

The one idea to hold onto: **every page is themed.** Players pick one of 32
table themes (Purrgil Passage is the default). Each theme fills the same 16
color roles, and your CSS must use those roles. Never hard-code a color.

---

## Theming

### How a page gets its theme

- `app/layout.tsx` turns the site theme on when `PTP_SITE_THEME_ENABLED` is
  set and the viewer has alpha access (`viewerHasAlphaAccess()` in
  `lib/viewerAccess.ts`; locally, `PTP_LOCAL_ALPHA_PREVIEW`).
- The chosen theme id comes from the `purrgil-table-v1` cookie. `<body>`
  receives `data-site-theme="<id>"` and an inline style holding every
  `--theme-*` variable plus `--table-art`.
- `src/components/SiteTheme` renders the shared header and re-applies the theme
  when the player changes it in the Themes dialog.
- Themes are data: `src/presentation/purrgil/themes.json`, validated by
  `src/presentation/purrgil/theme-contract.ts`. Only `purrgil` and `ffg` are
  free; the rest are supporter themes.

### The variables to use

| Role | CSS variable | Use |
|------|--------------|-----|
| Canvas | `--theme-canvas` | Page color where the art fades; full-bleed backdrops |
| Surface | `--theme-surface` | Panels, dialogs, inputs, drawers |
| Surface raised | `--theme-surface-raised` | Secondary buttons, emphasis inside a panel, tool hover |
| Surface hover | `--theme-surface-hover` | Hover for anything on surface-raised |
| Text | `--theme-text` | Headings and body copy |
| Text muted | `--theme-text-muted` | Subtitles, metadata, placeholders |
| Accent | `--theme-accent` | Primary-action fill, selected state, checkbox accent |
| Accent hover | `--theme-accent-hover` | Primary fill on hover |
| On accent | `--theme-on-accent` | Text and icons on an accent fill |
| Highlight | `--theme-highlight` | Second hue: info emphasis, callouts in data |
| Border | `--theme-border` | 1px strokes. Subtle dividers: `color-mix(in srgb, var(--theme-border), transparent 40%)` |
| Focus | `--theme-focus` | Keyboard focus rings |
| Success / Warning / Danger / Info | `--theme-success` … `--theme-info` | Win / draw / loss, status, destructive text |

Game data keeps fixed colors in every theme: `--pt-aspect-*`, `--pt-rarity-*`,
`--pt-kind-*`, `--pt-keyword`, `--pt-positive`, `--pt-discord`.

**Legacy `--pt-*` UI tokens** (`--pt-ink`, `--pt-surface-base`,
`--pt-glow-primary`, …) still work. Under the theme, `site-theme.css` re-points
them at roles, so older CSS stays themed. Don't use them in new code; name the
role directly.

### Checking your work

- View every new surface in **Purrgil Passage**, **Tatooine** (warm, light
  accent) and **FFG** (neutral gray, the old look). Switch with the palette
  icon in the header.
- `npm run check:design-tells` flags raw hexes, uppercase, side stripes, bounce
  easing and gradient fills in component CSS. Escape a deliberate exception
  with a same-line `/* design-ok: <reason> */` comment.
- `npx tsx --test src/styles/tokens.test.ts` keeps DESIGN.md, tokens.css and
  themes.json in sync, and checks every theme for AA contrast.

### Adding a theme

Add an entry to `themes.json` with all 16 roles and a background that follows
`public/table-environments/THEME-AUTHORING.md` (uniform cover, equal X/Y
scale). Follow the recipe the existing themes use: surfaces about +8, +17 and
+25 per RGB channel above the canvas, a pastel accent with `#10151b`
on-accent ink, and a highlight that contrasts with the accent. Run the token
test, which fails any theme that misses AA.

---

## Page Shell

- **One header everywhere.** The logo mark sits top-left on every page, the
  page title is centered, and the tools sit on the right. On `/`, the corner
  logo gives way to the large centered masthead. Never build a page header row
  or add a mini-logo.
- **One h1 per page.** The header mirrors it and hides the in-page copy. An h1
  with controls (EditableTitle) renders through `SiteTitle` from
  `src/components/SiteTheme`. Mark an h1 `data-site-title="keep"` if it must
  stay visible in the page (see `src/components/SiteTheme/pageTitle.ts`). A
  short subtitle `<p>` passed to `SiteTitle` appears under the title.
- **No back buttons.** `Button variant="back"` is hidden under the theme;
  navigation is browser history plus the header. Don't add destination-labelled
  back links.
- **Modal close** uses `variant="icon"` with an accessible label, never the
  back variant.
- **Footer:** the shared `SiteFooter`. Short pages keep it at the viewport
  bottom with a full-height flex column (use
  `min-height: calc(100dvh - var(--site-header-height))`). Long pages let it
  follow the content. Never fix it over content.
- **Page background:** the body draws the table art. Pages stay transparent;
  don't paint a page background or put art inside panels.

---

## Button Component

Use `src/components/Button.tsx` for every button.

```jsx
import Button from '@/src/components/Button'
```

| Variant | Under the site theme | Use |
|---------|----------------------|-----|
| `primary` | Solid accent fill, on-accent text | **The one** main action per view |
| `secondary` (default) | Surface-raised fill, border, text color | Everything else: Cancel, general actions |
| `danger` | Secondary chrome, danger-colored text | Destructive actions. Cancel-that-discards adds a trash icon |
| `toggle` | Neutral; `active` adds an accent border plus an inset accent ring | Segmented / filter options |
| `icon` | Square icon-only (28 / 36 / 44px) | Toolbars, close buttons. Always give it an `aria-label` |
| `discord` | Solid blurple, white text | Discord sign-in only |
| `interactive` | Secondary, highlight glow on hover | Info actions (prefer `secondary`) |
| `warning` | "Action required" look with no hover | Locked / action-required states |
| `back` | Hidden under the theme | Legacy pages only |

Sizes: `xs` (28px tall, matches icon buttons), `sm`, `md` (default), `lg`.

```jsx
<Button variant="primary" onClick={startDraft}>Start Draft</Button>
<Button onClick={close}>Cancel</Button>
<Button variant="danger" onClick={discard}><TrashIcon /> Discard Pool</Button>
<Button variant="toggle" active={view === 'grid'} aria-pressed={view === 'grid'}>Grid</Button>
<Button variant="icon" size="sm" aria-label="Close" onClick={close}>&times;</Button>
```

Rules:
- **One primary per view.** Two accent buttons side by side means one isn't
  primary.
- **Icon plus text always gets a gap** (the component sets `gap: 0.5rem`; keep a
  real flex gap in custom markup).
- **Avoid `glowColor`.** It takes fixed RGB values that don't follow the theme.
- **Anchors styled as buttons** use the classes directly
  (`<a className="btn btn--primary">`) and keep the button's text color in every
  state, never link blue.
- **No nested buttons.** Use `<div role="button" tabIndex={0}>` with a keyboard
  handler instead.

**Keep custom (don't replace with Button):** landing-page mode tiles, the card
deselect ✕, the editable-title pencil, the auth avatar, the showcase share
icon, and the header tool buttons (36×36 transparent, styled by
`site-theme.css`).

### TimerButton

`src/components/TimerButton.tsx`: `<TimerButton isPaused onClick disabled />`.
It shows pause while running and play while paused, using amber styling when
paused.

---

## Modal Component

```jsx
import Modal from '@/src/components/Modal'

<Modal isOpen={open} onClose={close} title="Delete Pool?" variant="danger">
  <Modal.Body><p>This can't be undone.</p></Modal.Body>
  <Modal.Actions>
    <Button onClick={close}>Keep It</Button>
    <Button variant="danger" onClick={confirm}>Delete</Button>
  </Modal.Actions>
</Modal>
```

Variants: `default`, `danger`, `image`. Under the theme the dialog is a
`--theme-surface` panel with a 12px radius and 2rem padding. On mobile the
actions stack full-width. Website dialogs lock page scroll while open.

---

## Panels

### Plain panels

```css
.my-panel {
  background: var(--theme-surface);
  color: var(--theme-text);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  padding: 12px;            /* equal on all four sides */
}
```

- **Equal insets.** Compact bordered panels use the same padding on every side
  (12px by default) and are sized to their content. Remove nested
  margins or padding that double up one edge. Check the visible
  content-to-border gap on every edge, including card images and buttons.
- **Separate by tone, not shadow.** A nested emphasis area steps up to
  `--theme-surface-raised`. No resting drop shadows, no translucent black glass.
- **Don't nest panels in panels.**

### Border-mounted labels

A named, thin-bordered panel puts its compact title on the top border, over a
`--theme-surface` patch, interrupting the line like a fieldset legend. Don't
spend a separate header row on it. Use a real `<legend>` for grouped form
controls; otherwise use a heading or an accessible region label. Make sure
overflow doesn't clip the label at narrow widths.

Draft examples: `Your Leaders`, `Your Leader Pack`, `Your Drafted Leaders (X/Y)`,
`Pack X Pick Y`. Pack and pick numbers come from the draft state, not from the
cumulative drafted-card count.

### Section header stacks (kicker → heading → subtitle)

Stats and dashboard sections use a header stack. Give it room:

- Minimum gaps: kicker → heading `0.25rem`, heading → subtitle `0.5rem`,
  subtitle → content `1rem`.
- Subtitles use `line-height: 1.4–1.5` and `--theme-text-muted`.
- **Never use negative margins** to pull content up over text. Shrink the
  margins that create the gap instead.
- Headings are Title Case with counts in parens ("Your Deck (28 cards)").

---

## Inputs

Under the theme, inputs, selects and textareas get a `--theme-surface` fill,
`--theme-border` stroke and text color automatically. Placeholders use
`--theme-text-muted`. Checkboxes and radios use the accent as `accent-color`.

- **Focus is one ring:** `outline: 2px solid var(--theme-focus); outline-offset: -1px;`
  drawn over the field's own border. Never add a second ring or a glow around
  it.
- **Search inputs are slim.** About 30px tall, ~0.82rem text, padding
  `0 0.7rem 0 1.85rem` with a 14px leading magnifier, 8px radius, and a capped
  width (`flex: 0 1 ~220px`, never `flex: 1 1 …`). Reuse `SearchInput`
  (`src/components/SearchInput.tsx`). Never a fat full-width pill.

---

## Tabs, Toggles and Segmented Controls

- Option groups use `Button variant="toggle"` with `active` / `aria-pressed`.
  Never hand-roll segmented CSS.
- The deck builder's view switch uses the themed `.view-mode-toggle-group`:
  a surface track, with the active item on surface-raised.
- Tab deep-links use `#hash` anchors through `useStickyTab`
  (`src/hooks/useStickyTab.ts`), never `?tab=` query params.

---

## Loading: Mandatory Skeletons

Always use content-shaped skeletons (`src/components/ContentSkeleton.tsx`) for
loading and pending UI. Never show standalone loading copy ("Loading…",
"Checking access…") and never use a spinner instead. This covers initial data,
auth checks, navigation and pending actions. Match the final layout and known
counts; use a neutral skeleton when the shape isn't known yet. Set `aria-busy`
and an accessible status label, with no visible loading text. The pulse stops
under reduced motion. Errors and actionable empty states stay explicit text.

---

## Toasts

`src/components/Toast.tsx`. Under the theme, the toast stack sits top-left
below the header. Toasts are hidden while a pack reveal is open.

---

## Cards and Card Art

- **Card component:** `src/components/Card.tsx`, with `.canvas-card`,
  `.selected`, `.disabled` and `.foil`.
- **Layouts:** packs use the `.cards-grid` flex-wrap; leaders and bases use
  `.leaders-bases-container`.
- **Corners scale with the card:** `3.5% / 2.5%` for portrait cards, `2.5% / 3.5%`
  for landscape leaders and bases. Selection rings and image clipping use the
  same silhouette. Don't use fixed pixel radii for card art.
- **Foil** uses the soft `foil-shimmer` (6s, blurred, one direction). The
  rainbow border is for showcase emphasis only.

### Cropped card-art thumbnails (leader grids)

Square leader tiles crop the card down to its illustration (the clean band runs
about 16–56% of card height):

```css
.your-stats-wr-cell-art {
  object-fit: cover;
  object-position: center 0;
  transform: scale(1.8);
}
```

- No card chrome may show: no name plate, stat badges or trait banner.
- **Never add `translateY(...)`.** Any Y offset drags chrome into the square.
- Verify against real card images before shipping.

### Rarity and card-kind icons

`src/components/CardIcons.tsx` is the only place rarity and card kind are
drawn:

```tsx
import { RarityIcon, RarityLabel, KindIcon, KindLabel } from '@/src/components/CardIcons'

<RarityLabel rarity={card.rarity} />            // icon + "Rare" (tables, previews, placeholders)
<RarityIcon rarity="Legendary" size={18} />     // icon only (filters, tight cells); carries alt/title
<KindLabel kind="space" />                      // rocket + "Space", tinted --pt-kind-space
<KindIcon kind="Ground Units" tinted={false} /> // inherits text color (headers, buttons)
```

Both accept loose input ("Rare", "rare", "R"; "Ground Units", "Upgrade",
"Events"). Never render rarity as colored text, a colored dot or a letter, and
never hand-roll a rarity map or kind glyph.

---

## PackSelector

Shared pack picker for Pack Wars, Pack Blitz, Chaos Draft and Chaos Sealed.

```tsx
import PackSelector from '@/src/components/PackSelector'

// Single select
<PackSelector sets={sets} selectedSet={code} onSelectSet={setCode} title="Choose a Pack" />

// Multi select
<PackSelector sets={sets} selectedSets={codes} onSelectSets={setCodes}
  maxSelections={6} showQuantityControls title="Select Packs (6)" />
```

The grid is 6 per row on desktop and 3 on mobile. Per-set accents come from
`--set-color`. Unselected packs go grayscale in single-select mode. Beta and
Carbonite badges appear; Carbonite packs sit below a separator. Sorting lives
in `src/utils/packSelectorSort.ts`.

---

## PackOpeningAnimation

The one place the motion budget is spent.

```tsx
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'

<PackOpeningAnimation packs={packs} packImageUrl={getPackImageUrl('SOR')}
  packImageUrls={perPackUrls /* optional, chaos sealed */}
  onComplete={done} onSkip={skip} />
```

Desktop shows a row of packs; mobile shows a swipe carousel. Tap to flip a card
(back to front), with Open All and Skip controls. Under the theme the reveal
sits below the header, repaints the table art behind it, and Skip is a quiet
text-muted control. It needs a reduced-motion path (crossfade or instant).

---

## Mobile and Hover

- Every `:hover` rule goes inside `@media (hover: hover) and (pointer: fine)`.
- Nothing may depend on hover alone. Mobile landscape is a primary use case.
- Headers shrink below 600px (68px header, 60px mark); test titles and toolbars
  at 375px wide.

---

## Never Use

- **Hard-coded colors** in UI CSS: hexes, `white`, `rgba(0,0,0,.7)`. Use theme
  roles.
- **The old holotable look:** green/red glow vocabulary, `#0A0A0A` voids,
  translucent black glass panels, the gray modal gradient.
- **Open-in-new-tab ↗ arrows** on buttons or links. "Play" or "Watch" is
  enough, even when it opens a new tab.
- **Link blue on buttons.**
- **ALL-CAPS headings**, uppercase eyebrows over every section, or
  `border-left` / `border-right` color stripes.
- **A second font.** Barlow only.

---

## AI Naming

Player-facing text refers to "the AI". There is one AI; don't offer style
choices. Never name an AI implementation after its author.
