---
paths:
  - "src/components/**"
  - "**/*.css"
  - "**/*.jsx"
  - "**/*.tsx"
---

# UI Component Rules

**IMPORTANT: Always use the style guide for UI work. Read `docs/STYLE_GUIDE.md` first.**

## Button Component (ALWAYS USE)
Use `src/components/Button.jsx` for ALL buttons:
```jsx
import Button from '@/src/components/Button'

<Button variant="primary">Save</Button>       // Green glow CTA
<Button variant="secondary">Cancel</Button>   // Neutral
<Button variant="danger">Delete</Button>      // Red glow
<Button variant="back">Back</Button>       // Back nav with arrow
<Button variant="icon" size="sm">&times;</Button>  // Icon-only
<Button variant="toggle" active={isActive}>Option</Button>  // Toggle
<Button variant="primary" textOnly>Add All</Button>  // Text-only
```

**Exceptions** (keep custom): Landing page mode buttons, deselect button, editable title pencil, auth widget avatar, showcase share icon.

## Card Component
Use `src/components/Card.jsx`. Key CSS classes: `.canvas-card`, `.canvas-card.selected`, `.canvas-card.disabled`, `.canvas-card.foil`.

## Modal Component
Use `src/components/Modal.jsx` with `<Modal.Body>` and `<Modal.Actions>`.

## Plugin CTA — Wayfinder Companion (ALWAYS USE)
Use `src/components/PluginCTA.tsx` for EVERY "install the Wayfinder Companion" pitch. **Never** hand-roll an install block, and never drop `WayfinderStoreButtons` straight into a surface — it lives inside `PluginCTA`.

```jsx
import PluginCTA, { usePluginCTA } from '@/src/components/PluginCTA'

<PluginCTA />                       // card (default) — empty states, /me, deck stats
<PluginCTA variant="autodetect" /> // single install button for the current browser (play page columns)
<PluginCTA variant="compact" />    // just the browser logos (tight nudges)
```

- **Self-gating** — the component decides what to show: the install pitch for users in the rollout (`isCompanionBeta` = admin), a neutral "Coming soon" for everyone else, and **nothing** for users who already have the Companion (detected OR have recorded games). Call sites pass only a variant.
- **To branch a surface** (e.g. show a "Play deck" prompt to users who already have it), read `usePluginCTA()` → `{ state, shouldShow, hasPlugin }`. Never re-implement the gating.
- The hero is the OFFICIAL single combined lockup (`/branding/wayfinder_companion.svg`) — never a bare mark beside a separate wordmark.
- QA override: `?plugincta=install|soon|hide` forces the state on any session.

## Design Tokens
- Dark backgrounds: `rgba(0, 0, 0, 0.7)`
- Borders: `rgba(255, 255, 255, 0.3)`
- Primary glow: green, Danger glow: red, Interactive glow: blue
- Font: Barlow, weights 400/600/700
- Hover lift: `translateY(-2px)`

## Type Spacing (headers & copy)
- **NEVER pull content up over text with negative margins** (`margin-top: -Npx`) — it overlaps/clips the copy. Shrink the gap-creating margins instead.
- Section header stacks (eyebrow → h3 → subtitle → content) need minimum gaps: 0.25rem / 0.5rem / 1rem. Subtitles get `line-height: 1.4+`.
- Cropped card-art tiles (leader grids): reuse `.your-stats-wr-cell-art` (`object-position: center 0; transform: scale(1.8)`). **No card chrome may show; never translateY the art.** Verify crops visually. See STYLE_GUIDE "Cropped Card-Art Thumbnails".

## Icon + Text Spacing
**Every button/element with an icon and text MUST have a gap.** Use `gap: 8px` in flex containers, or a space character between inline SVG and text.

## CSS Simplicity
- Use simplest possible CSS for simple elements
- Badges: `display: inline-block`, solid background, padding, done
- If clipping: check parent `overflow: hidden`, flex shrink, fixed widths

## Discord Buttons
Global CSS `a:hover { color: #535bf2 }` turns all link text purple. **Every Discord-styled link/button MUST override** with `color: white` on all states: `a.class, a.class:visited, a.class:hover, a.class:active { color: white; }`

## Nested Buttons
HTML does not allow `<button>` inside `<button>`. Use `<div role="button" tabIndex={0}>` with keyboard handler instead.

## Always Use Existing Implementations
- Check existing components and style guide BEFORE implementing UI
- Search the codebase for prior art before creating any new action, link, button, badge, or row treatment; reuse the existing component/classes when the user-facing action is the same.
- Copy from existing working code — don't invent new patterns.
- For replay/watch/match-view actions, reuse `src/components/ReplayWatchLink.tsx` and the `.your-stats-watch-btn` prior-art styling instead of creating bespoke Watch/Replay button CSS.
- Packs: `.cards-grid` flex-wrap. Leaders/bases: `.leaders-bases-container`

## Loading UI — mandatory skeletons

Always use content-shaped skeletons for loading and pending UI. Never display standalone loading copy such as “Loading your saved deck…”, “Loading…”, or “Checking access…”, and never substitute a spinner for the skeleton. This applies to initial data, authentication checks, navigation, and pending actions. Match the final layout and known counts; use a neutral skeleton when the shape/count is not yet known. Keep loading announcements accessible with `aria-busy` and an accessible status label, without visible loading text. Respect reduced motion. Errors and actionable empty states remain explicit text; they are not loading states. Verify the pending state before shipping UI changes.

## Bordered Panel Labels

For a named, thin-bordered content box, place its compact title on the top border with an opaque black/dark surface behind the text, interrupting the line like a fieldset legend. Do not spend a separate full-width header row or an inline content column on the title. Keep modest horizontal label padding, preserve heading/region semantics, and leave enough interior clearance for content. Use a real `legend` for grouped form controls; use a heading or accessible region label for other panels. Check that overflow and stacking do not clip the label at narrow widths. This applies to card holders, leader packs, drafted leaders, and similar titled panels; page headings and unboxed section headings keep their normal hierarchy.

Draft examples: `Your Leaders`, `Your Leader Pack`, `Your Drafted Leaders (X/Y)`, and `Pack X Pick Y`. Pack and pick numbers come from the draft state, not the cumulative drafted-card count.

### Even panel insets
Use equal padding on all four sides of compact bordered panels (default: 12px). Size the panel to its content rather than stretching its height and creating unequal apparent spacing. Remove nested wrapper margins/padding that double up one edge. Border-mounted labels sit across the border; the content still gets the same inset beneath them. Check the visible content-to-border gap on every edge, including card images and action buttons.


## Page shell consistency

- Show the Protect the Pod site logo only on the homepage. Interior pages use their title and back navigation; do not add a centered mini logo.
- Under the site theme (`PTP_SITE_THEME_ENABLED`), the page h1 is mirrored into the shared site header, centered, and the parent section becomes a plain chevron back link beside the logo. Pages still render exactly one h1 and never build their own header row; mark an h1 `data-site-title="keep"` if it must stay visible in the page (see `src/components/SiteTheme/pageTitle.ts`).
- Back navigation always uses `Button variant="back"`. The component supplies one left arrow and the label **Back**; destinations remain in the click handler. Do not use destination-specific visible labels or duplicate arrows.
- Use `variant="icon"` with an accessible label for modal close actions, never the back variant.
- Short pages keep the shared footer at the viewport bottom using a full-height flex column. Long pages let it follow content; never fix the footer over content.
