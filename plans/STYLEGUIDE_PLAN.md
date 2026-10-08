# Living Style Guide Implementation Plan

## Overview

Create an interactive style guide page at `/styleguide` that renders actual components with documentation, serving as both documentation and visual regression testing.

## Page Structure

```
/styleguide
├── Header: "SWUPOD Style Guide"
├── Navigation: Jump links to sections
├── Sections:
│   ├── Colors & Design Tokens
│   ├── Typography
│   ├── Buttons
│   ├── Cards
│   ├── Modals
│   ├── Form Elements
│   ├── Effects (Rainbow, Foil, Glow)
│   └── Layout Patterns
└── Footer: Version info
```

## Section Details

### 1. Colors & Design Tokens

Display color swatches for:
- Aspect colors (Command, Vigilance, Aggression, Cunning, Heroism, Villainy)
- Background colors (dark variants)
- Glow colors (green/primary, red/danger, blue/interactive)
- Text colors (white, muted, accent)

### 2. Typography

- Font: Barlow (weights 400, 600, 700)
- Heading sizes (h1-h4)
- Body text
- Card text sizing

### 3. Buttons

Render actual `<Button>` component with all variants:

```jsx
<Button variant="primary">Primary (Green Glow)</Button>
<Button variant="secondary">Secondary (Default)</Button>
<Button variant="danger">Danger (Red Glow)</Button>
<Button variant="back">Back (Red Glow)</Button>
<Button variant="interactive">Interactive (Blue Glow)</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="discord">Discord</Button>
```

With sizes:
```jsx
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
```

Show disabled states and hover effects.

### 4. Cards

- DraftableCard in different states (selectable, selected, disabled)
- Card hover/enlarge behavior
- Foil shimmer effect
- Showcase leader cards
- Aspect coloring on cards

### 5. Modals

- Standard Modal component
- Confirmation dialogs
- Image preview modal (from showcases)

### 6. Form Elements

- Input fields
- Dropdowns/selects
- Checkboxes (toggle states)

### 7. Effects

#### Rainbow Border
```css
/* Animated rainbow border pattern */
background: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3, #ff0000);
animation: rainbow-border 3s linear infinite;
```

#### Foil Shimmer
Showcase the foil card effect with animation.

#### Glow Effects
- Green glow (primary actions)
- Red glow (danger/back)
- Blue glow (interactive)
- Aspect-colored glow (using color-mix)

### 8. Layout Patterns

- Wallpaper container pattern
- Card grid layouts
- Responsive breakpoints

## Implementation

### File Structure

```
app/styleguide/
├── page.jsx        # Main style guide page
├── styleguide.css  # Style guide specific styles
└── components/     # Section components (optional)
```

### Component Rendering

Each section renders the actual component, not a mock:

```jsx
import Button from '@/src/components/Button'
import Modal from '@/src/components/Modal'
// etc.

export default function StyleGuidePage() {
  return (
    <div className="styleguide-container">
      <section id="buttons">
        <h2>Buttons</h2>
        <div className="styleguide-example">
          <Button variant="primary">Primary</Button>
          <pre>{`<Button variant="primary">Primary</Button>`}</pre>
        </div>
        {/* ... more examples */}
      </section>
    </div>
  )
}
```

### Interactive Features

1. **Live code display**: Show the JSX for each component
2. **Props table**: Document available props
3. **Interactive playground** (optional): Toggle props to see changes
4. **Copy to clipboard**: Click to copy component usage

## CSS Classes to Document

From the codebase:
- `.btn--*` (all button variants)
- `.wallpaper-container`
- `.card-*` (card-related classes)
- `.modal-*` (modal classes)
- `.rainbow-*` (rainbow effects)
- `.foil-shimmer`
- `.glow-*` (glow effects)

## Existing Patterns to Extract

Based on the deviation report, document these patterns that appear multiple times:

1. **Icon buttons** - circular or square icon-only buttons
2. **Toggle buttons** - active/inactive state buttons
3. **Text buttons** - minimal text-only buttons
4. **Dropdown triggers** - buttons that open menus
5. **Close buttons** - × dismiss buttons

## Timeline

1. Create basic page structure with navigation
2. Add Buttons section (most complete documentation)
3. Add Effects section (rainbow, foil, glow)
4. Add Cards section
5. Add remaining sections
6. Add interactive features (code display, copy)

## Notes

- Page should be accessible at `/styleguide` in development
- Consider hiding in production or adding auth
- Use the actual CSS imports to ensure styles match
- Test on mobile for responsive documentation
