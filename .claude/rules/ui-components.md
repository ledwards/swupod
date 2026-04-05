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
- Copy from existing working code — don't invent new patterns
- Packs: `.cards-grid` flex-wrap. Leaders/bases: `.leaders-bases-container`
