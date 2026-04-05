---
paths:
  - "src/components/**"
  - "src/hooks/**"
  - "**/*.css"
---

# Mobile Rules

## Hover Does Not Exist on Mobile
- **NEVER** add features that depend on hover/mouseover as the ONLY interaction
- Mobile landscape is a primary use case — always ask "does this work with just taps?"
- `CardPreview`/`useCardPreview` are fine — the hook has a touch device guard
- If the touch guard breaks, fix it in the hook — don't remove CardPreview from pages

## CSS :hover on Mobile
CSS `:hover` rules fire on mobile when tapping. Wrap ALL `:hover` CSS in:
```css
@media (hover: hover) and (pointer: fine) {
  /* hover styles here */
}
```
This applies to transform scale, background changes, opacity — ALL hover effects.

## Chat on Mobile
Chat overlay MUST begin collapsed on mobile. Never auto-open chat on mobile. If adding chat to a new page, ensure it starts collapsed.

## Safe Array/Object Access
When accessing potentially undefined arrays from API data, always use fallback:
```javascript
const players = data.players || []
```
This prevents "undefined is not an object" crashes on mobile Safari.
