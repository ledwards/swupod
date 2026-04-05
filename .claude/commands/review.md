---
description: Review current branch changes before pushing
---

## Changes on this branch

!`git diff --stat main...HEAD`

## Full diff

!`git diff main...HEAD`

Review the above changes for:
1. **Bugs**: Logic errors, off-by-one, null/undefined access
2. **Security**: No secrets, no .env exposure, no injection vectors
3. **Test coverage**: Are new behaviors tested? Are tests spec-first (hardcoded expected values)?
4. **Generated files**: Nothing in `public/` should be manually modified
5. **Style compliance**: Button component used, no hover-only features, icon+text gaps
6. **Pack generation**: If belts/packs touched, was QA run?

Give specific, actionable feedback per file.
