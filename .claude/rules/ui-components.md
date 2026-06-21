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
<Button variant="back">Go Back</Button>       // Back nav with arrow
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
