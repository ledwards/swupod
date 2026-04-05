---
paths:
  - "**/*.test.*"
  - "tests/**"
  - "src/belts/**"
  - "src/utils/**"
---

# Testing Rules

## Spec-First Testing (MANDATORY)

**NEVER write tests that validate implementation. ALWAYS test against specifications.**

### Anti-Pattern (DO NOT DO THIS)
```javascript
// BAD: Deriving expected values from the implementation
const numRares = cards.filter(c => c.rarity === 'Rare').length
const numLegendaries = cards.filter(c => c.rarity === 'Legendary').length
const expectedRate = numLegendaries / (ratio * numRares + numLegendaries)  // WRONG!
```

### Correct Pattern (DO THIS)
```javascript
// GOOD: Hardcode expected values from the SPEC
const expectedRate = 1 / 8  // 0.125 - from spec "1 in 8 = 12.5%"
assert(Math.abs(observedRate - expectedRate) < tolerance,
  `SPEC: Legendary rate should be 12.5%, got ${observedRate}`)
```

### Where to Find Specs
- `src/utils/packConstants.ts` — rarity weights, upgrade rates, belt configs
- `src/utils/setConfigs/*.ts` — per-set card counts, ratios, rules
- Belt class comments and set configs

## Bug Fixing Process (MANDATORY)

Always use red-green TDD:

1. **RED**: Write a failing test that demonstrates the bug
   - Name: `'BUGGY: does X incorrectly'` or `'OLD CODE: fails when Y'`
2. **GREEN**: Write the fix and show the test passing
   - Name: `'FIXED: does X correctly'` or `'NEW CODE: handles Y'`
3. **Document**: The test serves as documentation of what went wrong

## Test Runner
- Node's built-in test runner (no Jest)
- Run individual files: `node src/utils/cardSort.test.js`
- Statistical QA: `npm run qa` (validates distribution across 600 packs)

## Test File Locations
- `src/utils/*.test.js` — Utility function tests
- `src/hooks/*.test.js` — Hook contract tests
- `src/belts/*.test.js` — Belt system tests
- `src/utils/setConfigs/*.test.js` — Set config tests
- `lib/*.test.js` — Server-side utility tests
- `app/api/**/*.test.js` — API route tests
- `tests/e2e/*.spec.ts` — Playwright E2E tests (run other format tests with --workers=1)

## Known Issues
- Mobile test (`deck-builder.spec.js:220`) is flaky — pre-existing
- Skip 8-player test during iteration (takes 10+ minutes)
