---
description: Fix a bug using red-green TDD
argument-hint: [description of bug]
---

Bug to fix: $ARGUMENTS

Follow the mandatory bug fix process:

1. **RED**: Write a failing test that demonstrates the bug
   - Extract buggy logic into a testable function if needed
   - Name it clearly: `'BUGGY: does X incorrectly'`
   - Show the test failing

2. **GREEN**: Write the fix and show the test passing
   - Add a parallel test: `'FIXED: does X correctly'`
   - Run `npm run test` to ensure no regressions

3. **QA**: If the fix touches pack generation (belts, boosterPack, upgrades):
   - Run `npm run qa` and confirm all checks pass

4. **Summary**: Explain what was wrong and how the fix addresses it
