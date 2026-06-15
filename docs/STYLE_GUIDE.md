# SWUPOD Style Guide

This document describes the UI component library and design patterns used in SWUPOD.

## Button Component

The primary Button component (`src/components/Button.tsx`) should be used for all interactive button elements.

### Import

```jsx
import Button from '@/src/components/Button'
// or
import { Button } from '@/src/components/Button'
```

### Variants

| Variant | Description | Use Case |
|---------|-------------|----------|
| `secondary` | Default. Black background, white border, white text | General actions, Cancel buttons |
| `primary` | Green glow on hover | Main CTAs, confirmations, "Continue" |
| `danger` | Red glow on hover | Destructive actions, warnings |
| `back` | Red glow on hover (alias for danger) | Navigation back |
| `interactive` | Blue glow on hover | Interactive/info actions |
| `discord` | Discord purple (#5865F2) | Discord-related actions |
| `icon` | Square icon-only button | Toolbar icons, close buttons |
| `toggle` | For toggleable options | Sort/filter toggles |
| `warning` | Red "action required" look (no hover, reads as disabled) | Action-required / locked states |

### Sizes

| Size | Description |
|------|-------------|
| `xs` | Extra small - 28px height, matches icon button |
| `sm` | Small - compact UI, toolbars |
| `md` | Medium (default) - standard buttons |
| `lg` | Large - prominent CTAs |

### Props

```jsx
<Button
  variant="primary"       // Button style variant (see table)
  size="md"               // Size: 'xs' | 'sm' | 'md' | 'lg'
  disabled={false}        // Disabled state
  active={false}          // Active state (for toggle variant)
  textOnly={false}        // Text-only mode (no background/border)
  glowColor="blue"        // Custom hover glow: 'green' | 'red' | 'blue' | 'yellow' (overrides variant)
  className=""            // Additional CSS classes
  onClick={handleClick}   // Click handler
>
  Button Text
</Button>
```

### Examples

```jsx
// Primary CTA
<Button variant="primary" onClick={handleSave}>Save Changes</Button>

// Cancel/Secondary
<Button variant="secondary" onClick={handleCancel}>Cancel</Button>

// Danger action
<Button variant="danger" onClick={handleDelete}>Delete</Button>

// Back navigation
<Button variant="back" onClick={goBack}>Go Back</Button>

// Icon button (close)
<Button variant="icon" size="sm" onClick={onClose}>&times;</Button>

// Toggle button
<Button variant="toggle" active={isActive} onClick={toggleSort}>
  Sort by Name
</Button>

// Text-only primary (green text, no background)
<Button variant="primary" textOnly onClick={addAll}>Add All</Button>

// Text-only danger (red text, no background)
<Button variant="danger" textOnly onClick={removeAll}>Remove All</Button>

// Discord login
<Button variant="discord" onClick={signIn}>
  <DiscordIcon /> Login with Discord
</Button>
```

### Using with Anchors

For anchor elements styled as buttons, use the CSS classes directly:

```jsx
<a href="/page" className="btn btn--discord">
  Link styled as Discord button
</a>
```

## TimerButton Component

Specialized button for pause/play timer controls.

### Import

```jsx
import TimerButton from '@/src/components/TimerButton'
```

### Props

```jsx
<TimerButton
  isPaused={false}        // Whether timer is paused
  onClick={handleToggle}  // Click handler
  disabled={false}        // Disabled state
/>
```

### Behavior

- Shows pause icon when `isPaused={false}` (timer running)
- Shows play icon when `isPaused={true}` (timer paused)
- Has amber/yellow styling when paused

## Modal Component

Standard modal/dialog component.

### Import

```jsx
import Modal from '@/src/components/Modal'
```

### Usage

```jsx
<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Confirm Action"
  variant="default"       // 'default' | 'danger' | 'image'
  showCloseButton={true}
>
  <Modal.Body>
    <p>Are you sure you want to proceed?</p>
  </Modal.Body>
  <Modal.Actions>
    <Button variant="danger" onClick={handleConfirm}>Yes</Button>
    <Button variant="secondary" onClick={() => setShowModal(false)}>No</Button>
  </Modal.Actions>
</Modal>
```

## Design Tokens

### Colors

| Token | Value | Use |
|-------|-------|-----|
| Background (dark) | `rgba(0, 0, 0, 0.7)` | Button backgrounds |
| Border (default) | `rgba(255, 255, 255, 0.3)` | Subtle borders |
| Border (hover) | `rgba(255, 255, 255, 0.5)` | Hover state borders |
| Primary (green) | `rgba(0, 255, 0, 0.8)` | Primary glow |
| Danger (red) | `rgba(255, 0, 0, 0.8)` | Danger glow |
| Interactive (blue) | `rgba(33, 150, 243, 0.8)` | Interactive glow |
| Discord purple | `#5865F2` | Discord branding |
| Timer amber | `#FFC107` | Paused timer state |

### Typography

- **Font Family**: `'Barlow', sans-serif`
- **Font Weights**: 400 (normal), 600 (semibold), 700 (bold)

### Spacing

Button padding by size:
- Small: `0.5rem 1rem`
- Medium: `0.75rem 1.5rem`
- Large: `1rem 2.5rem`

### Effects

#### Hover Lift
Buttons lift on hover with `transform: translateY(-2px)`

#### Glow Effect
Primary/danger/interactive buttons have colored box-shadow on hover:
```css
box-shadow: 0 6px 16px rgba(COLOR, 0.6);
```

#### Rainbow Border
Used for special emphasis (showcases, badges):
```css
background: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3, #ff0000);
background-size: 400% 400%;
animation: rainbow-border 3s linear infinite;
```

## Section Headers (Card Boxes)

Headers inside card boxes (e.g., "Leaders", "Bases", "Your Deck") use a consistent style:

### Style

```css
h3 {
  font-size: 1rem;
  font-weight: 600;
  color: white;
  margin: 0 0 0.75rem 0;
}
```

### Box Container

Card boxes have reduced top padding to minimize space between header and box edge:

```css
.card-box {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 1rem 1.5rem 1.5rem;  /* Less top padding */
  text-align: center;
}
```

### Guidelines

- **Title case**: "Leaders", "Bases", "Your Deck" (NOT "LEADERS")
- **White text**: Pure white, not gray
- **Counts in parens**: "Your Deck (28 cards)"
- **No top margin**: Header sits close to box top edge

## Component Patterns

### Keep Custom (Do Not Replace)

These components have unique designs that should remain custom:
- Landing page mode buttons (large card-like CTAs)
- Deselect button (card overlay X button)
- Editable title button (inline edit pencil)
- Auth widget avatar button (circular avatar trigger)
- Showcase share button (circular icon)

### Standard Patterns

| Pattern | Component/Approach |
|---------|-------------------|
| Close buttons | `<Button variant="icon" size="sm">&times;</Button>` |
| Back navigation | `<Button variant="back">Go Back</Button>` |
| Primary CTA | `<Button variant="primary">Action</Button>` |
| Cancel/Secondary | `<Button variant="secondary">Cancel</Button>` |
| Danger/Delete | `<Button variant="danger">Delete</Button>` |
| Toggle options | `<Button variant="toggle" active={isActive}>Option</Button>` |
| Text actions | `<Button variant="primary" textOnly>Add</Button>` |

## Tab/Folder Pattern

Used for tabbed interfaces (e.g., History page Sealed/Draft tabs).

### Structure

```
┌─────────┐ ┌─────────┐
│  Tab 1  │ │  Tab 2  │       <- Tabs with rounded top corners
└─────────┴─┴─────────┴────────────────────┐
│                                          │
│           Content Area                   │  <- Flat top, rounded bottom
│                                          │
└──────────────────────────────────────────┘
```

### Tab Styling

Tabs have rounded top corners and flat bottom to "sit on" the content area:

```css
.tab {
  border-radius: 8px 8px 0 0;  /* rounded top, flat bottom */
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-bottom-color: transparent;  /* hide bottom border */
  margin-bottom: -1px;  /* overlap with content container */
  position: relative;
  z-index: 1;
}

.tab.active {
  border-bottom-color: rgba(0, 0, 0, 0.5);  /* match container background */
}
```

### Content Container Styling

Content area has flat top corners (where tabs connect) and rounded bottom corners:

```css
.tab-content-container {
  /* Explicit corners for the folder effect */
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;

  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.5);
}
```

### Key Points

1. **Use explicit corner properties** (`border-top-left-radius`, etc.) instead of shorthand `border-radius` to avoid specificity issues
2. **Tabs overlap container** by 1px (`margin-bottom: -1px`) so borders connect seamlessly
3. **Active tab hides its bottom border** to create visual connection with content
4. **Content area has flat top** so it appears the tabs "sit on" the folder

### Example Implementations

**History page** (`app/history/History.css`):
- `.history-tab` - Tab button styling
- `.history-tab.active` - Active tab state
- `.history-table-container` - Content container with folder bottom

**Stats page** (`app/stats/stats.css`):
- `.stats-tab` - Tab button styling with set colors
- `.stats-tab.active` - Active tab state
- `.stats-content` - Content container with folder bottom

## PackSelector Component

Shared pack selection UI for other format modes (Pack Wars, Pack Blitz, Chaos Draft, Chaos Sealed).

### Import

```tsx
import PackSelector from '@/src/components/PackSelector'
// or
import { PackSelector } from '@/src/components/PackSelector'
```

### Props

```tsx
interface PackSelectorProps {
  sets: SetData[]                    // Available sets to display
  // Single select mode:
  selectedSet?: string | null        // Currently selected set code
  onSelectSet?: (setCode: string) => void
  // Multi-select mode:
  selectedSets?: string[]            // Array of selected set codes (can repeat)
  onSelectSets?: (setCodes: string[]) => void
  maxSelections?: number             // Max selections (default 1)
  showQuantityControls?: boolean     // Show +/- buttons (default false)
  title?: string                     // Section header (default "Select a Set")
}
```

### Single Select Mode (Pack Wars, Pack Blitz)

```tsx
<PackSelector
  sets={availableSets}
  selectedSet={selectedSet}
  onSelectSet={setSelectedSet}
  title="Choose a Pack"
/>
```

### Multi-Select Mode (Chaos Draft, Chaos Sealed)

```tsx
<PackSelector
  sets={availableSets}
  selectedSets={selectedSets}
  onSelectSets={setSelectedSets}
  maxSelections={6}
  showQuantityControls={true}
  title="Select Packs (6)"
/>
```

### Features

- Grid layout: 6 packs per row (desktop), 3 per row (mobile)
- Per-set color theming via `--set-color` CSS variable
- Grayscale effect on unselected packs (single-select mode)
- Quantity controls (+/-) for multi-select with duplicate selection
- Beta badges for sets marked as beta, Carbonite badges for carbonite sets
- Sets grouped: regular boosters (top), carbonite packs (below separator line)
- Sorting logic extracted to `src/utils/packSelectorSort.ts` (with tests)

## PackOpeningAnimation Component

Full-screen pack opening animation with card reveal.

### Import

```tsx
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
```

### Props

```tsx
interface PackOpeningAnimationProps {
  packs: Pack[]                      // Packs to open
  packImageUrl: string               // Default pack image URL
  packImageUrls?: string[]           // Per-pack images (for chaos sealed)
  onComplete: () => void             // Called when animation finishes
  onSkip: () => void                 // Called when user skips
}
```

### Basic Usage (Same Pack)

```tsx
<PackOpeningAnimation
  packs={generatedPacks}
  packImageUrl={getPackImageUrl('SOR')}
  onComplete={handleComplete}
  onSkip={handleSkip}
/>
```

### Per-Pack Images (Chaos Sealed)

For chaos sealed where each pack is from a different set:

```tsx
<PackOpeningAnimation
  packs={generatedPacks}
  packImageUrl={getPackImageUrl('SOR')}  // Fallback
  packImageUrls={selectedSets.map(code => getPackImageUrl(code))}
  onComplete={handleComplete}
  onSkip={handleSkip}
/>
```

### Features

- Desktop: Row of packs with hover preview
- Mobile: Carousel with swipe navigation
- Click/tap pack to open and reveal cards
- "Open All" button for quick reveal
- Skip button to bypass animation entirely
- Foil shimmer effect on foil/showcase cards
- Card flip animation with back → front reveal

## File Organization

```
src/components/
├── Button.tsx          # Core button component
├── Button.css          # Button styles
├── TimerButton.tsx     # Timer pause/play button
├── TimerButton.css     # Timer button styles
├── Modal.tsx           # Modal/dialog component
├── Modal.css           # Modal styles
├── PackSelector.tsx    # Pack selection grid
├── PackSelector.css    # Pack selector styles
├── PackOpeningAnimation.tsx  # Pack opening animation
└── PackOpeningAnimation.css  # Animation styles
```
