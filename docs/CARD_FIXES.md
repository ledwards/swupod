# Card Fixes Documentation

This document explains how the runtime card fix system works and how to add new fixes.

## Overview

The card fix system applies corrections to card data **at runtime** when the application loads. This means:

✅ **All code** uses corrected data  
✅ **All tests** test corrected data  
✅ **Fixes are version-controlled** with your code  
✅ **No manual post-processing** needed in production  

## How It Works

```
1. App starts
2. cardData.js imports cards.json
3. cardFixes.js automatically applies fixes
4. Your code gets corrected data
```

The fixes are applied once when the module loads, so there's no performance penalty during runtime.

## Current Status

Run this command to see current fix statistics:

```bash
node -e "import('./src/utils/cardData.js').then(m => { const meta = m.getCardMetadata(); console.log('Fixes applied:', meta.fixesAppliedAtRuntime); })"
```

## Adding Fixes

All fixes are defined in `scripts/cardFixes.js`. There are three types of fixes you can add:

### 1. Individual Fixes

Fix specific cards by ID:

```javascript
export const cardFixes = [
  {
    id: 'SOR-324',
    field: 'isHyperspace',
    value: true,
    reason: 'Hyperspace variant missing isHyperspace flag'
  },
  {
    id: 'LOF-488',
    field: 'isFoil',
    value: true,
    reason: 'Foil variant missing isFoil flag'
  },
]
```

### 2. Batch Fixes

Apply the same fix to multiple cards matching a condition:

```javascript
export const batchFixes = [
  {
    condition: (card) => card.variantType === 'Hyperspace' && !card.isHyperspace,
    field: 'isHyperspace',
    value: true,
    reason: 'Auto-fix: Hyperspace variant missing isHyperspace flag'
  },
  {
    condition: (card) => card.type === 'Leader' && !card.isLeader,
    field: 'isLeader',
    value: true,
    reason: 'Auto-fix: Leader missing isLeader flag'
  },
]
```

### 3. Custom Transforms

Complex transformations that need custom logic:

```javascript
export const customTransforms = [
  {
    name: 'Fix leader HP values',
    transform: (card) => {
      if (card.type === 'Leader' && card.hp < 0) {
        card.hp = 30 // Default leader HP
      }
      return card
    }
  },
]
```

## Testing Fixes

### Run the fix tests:

```bash
npm run test:fixes
```

### Test with real data:

```bash
node -e "import('./src/utils/cardData.js').then(m => { 
  const cards = m.getAllCards(); 
  const meta = m.getCardMetadata(); 
  console.log('Total cards:', cards.length); 
  console.log('Fixes applied:', meta.fixesAppliedAtRuntime); 
  
  // Test specific conditions
  const hyperspaceCards = cards.filter(c => c.variantType === 'Hyperspace');
  const missingFlag = hyperspaceCards.filter(c => !c.isHyperspace);
  console.log('Hyperspace cards:', hyperspaceCards.length);
  console.log('Missing isHyperspace flag:', missingFlag.length);
})"
```

### Run all tests to ensure fixes don't break anything:

```bash
npm test
```

## Workflow

### When upstream data changes:

1. **Fetch new data:**
   ```bash
   npm run fetch-cards
   ```
   This fetches from swu-db.com API, applies fixes, and saves to `src/data/cards.json`

2. **Verify fixes:**
   ```bash
   npm run test:fixes
   npm test
   ```

3. **Commit and deploy:**
   ```bash
   git add src/data/cards.json
   git commit -m "Update card data"
   git push
   ```

### When you need to add a new fix:

1. **Add fix to `scripts/cardFixes.js`:**
   ```javascript
   export const batchFixes = [
     // ... existing fixes
     {
       condition: (card) => card.someField === 'badValue',
       field: 'someField',
       value: 'goodValue',
       reason: 'Fix description'
     },
   ]
   ```

2. **Test the fix:**
   ```bash
   npm run test:fixes
   ```

3. **Re-process existing data (optional):**
   ```bash
   npm run fetch-cards  # This re-fetches and applies all fixes
   # OR
   node scripts/postProcessCards.js  # This just re-applies fixes to existing data
   ```

4. **Verify in your app:**
   ```bash
   npm run dev
   ```

5. **Commit and deploy:**
   ```bash
   git add scripts/cardFixes.js src/data/cards.json
   git commit -m "Add fix for XYZ"
   git push
   ```

## Files Involved

- **`scripts/cardFixes.js`** - Define your fixes here (individual, batch, custom)
- **`scripts/postProcessCards.js`** - CLI tool to apply fixes during development
- **`scripts/fetchCards.js`** - Fetches data from API and auto-runs post-processing
- **`src/utils/cardFixes.js`** - Runtime module that applies fixes when app loads
- **`src/utils/cardData.js`** - Loads cards and applies fixes automatically
- **`src/utils/cardFixes.test.js`** - Tests for the fix system
- **`src/data/cards.json`** - Your card data (fixes already applied if fetched via npm script)

## Debugging

### See what fixes are being applied:

Set `NODE_ENV=development` to see detailed logs:

```bash
NODE_ENV=development node -e "import('./src/utils/cardData.js').then(() => console.log('Done'))"
```

This will show each fix as it's applied.

### Check if a specific card has been fixed:

```bash
node -e "import('./src/utils/cardData.js').then(m => { 
  const cards = m.getAllCards(); 
  const card = cards.find(c => c.id === 'SOR-324'); 
  console.log(JSON.stringify(card, null, 2)); 
})"
```

### Generate a fix report:

When you run `npm run fetch-cards`, a report is generated at `src/data/card-fixes-report.json` showing all fixes that were applied.

## FAQ

**Q: Do fixes slow down the app?**  
A: No, fixes are applied once when the module loads (before your app starts), not on every request.

**Q: What if I want to fetch data from the API in production without redeployment?**  
A: You can implement Option B from the architecture discussion. Let us know if you need this.

**Q: Can I apply different fixes in development vs production?**  
A: Yes, you can check `process.env.NODE_ENV` in your fix conditions or transforms.

**Q: How do I see what fixes are currently configured?**  
A: Run `npm run test:fixes` or check `scripts/cardFixes.js` directly.

**Q: The data from swu-db.com changed, do I need to update my fixes?**  
A: Only if the data structure changed. Most fixes are resilient to data updates because they use conditions rather than hardcoded IDs.

## Best Practices

1. **Use batch fixes when possible** - They're more maintainable than individual fixes
2. **Document your reasons** - Future you will thank present you
3. **Test after adding fixes** - Run `npm test` to ensure nothing breaks
4. **Keep fixes simple** - Complex transforms are harder to debug
5. **Use descriptive names** - For custom transforms, make the name explain what it does

## Monitoring

You can add monitoring/logging to track how many fixes are being applied in production:

```javascript
// In your app startup
import { getCardMetadata } from './src/utils/cardData.js'

const meta = getCardMetadata()
console.log(`[CardData] ${meta.fixesAppliedAtRuntime} fixes applied to ${meta.totalCards} cards`)
```

This helps you track if fixes are working as expected in production.