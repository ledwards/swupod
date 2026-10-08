---
paths:
  - "src/**"
  - "lib/**"
  - "app/**"
---

# Architecture Rules

## Key Principles
1. **Services are Pure**: No React, no side effects, no I/O in `src/services/`
2. **Components Don't Calculate**: Move calculations to services, call via hooks
3. **Small Files**: Components <300 lines, services <200 lines
4. **One Canonical Format**: Domain objects have ONE representation (see `docs/DATA_FORMATS.md`)
5. **Test Before Refactor**: Always write characterization tests before changing existing code

## When Adding New Features
1. Business logic -> `src/services/` (with tests)
2. State management -> `src/hooks/`
3. UI -> `src/components/` (receives data via props/hooks)

## Follow Existing Patterns
- Before implementing ANY infrastructure, check how similar features do it
- Regular draft uses Socket.io -> new real-time features use Socket.io too
- Auth uses Discord OAuth -> new auth features use the same flow
- Consistency matters more than simplicity

## Do Not Add Unrequested Features
- Only implement exactly what was requested
- Do NOT add extra imports, hooks, or behaviors beyond the ask
- If rewriting a page, preserve its existing feature set — don't add new ones

## Per-Set Configuration
- Each set has its own config in `src/utils/setConfigs/`
- **NEVER change behavior of past sets when adding features for new sets**
- New rules use per-set config flags, NOT global changes
- Always test both old sets AND new sets when changing belt behavior

## Data Formats
- Packs are always `{ cards: [...] }` objects, never raw arrays
- Exception: `current_pack` stores just the cards array
- ALL packs are created equal — no "sealed pack" vs "draft pack" distinction
- `id` is the unique card key (from API). `cardId` and `number` are NOT unique identifiers.

## Card Variant Types
Normal, Foil, Hyperspace, Hyperspace Foil, Showcase. Same card with different variants are distinct.
