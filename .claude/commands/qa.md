---
description: Run full QA + unit tests after pack generation changes
---

Run the full test and QA suite to validate pack generation:

```
npm run test
```

```
npm run qa
```

Report any failures with specifics: which test, expected vs actual, and the file/line involved. If all pass, confirm the counts (e.g., "204/204 tests, 150/150 QA checks").
