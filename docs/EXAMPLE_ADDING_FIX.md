# Example: Adding a Card Fix

This is a real-world walkthrough showing how to add a fix when you discover a data issue.

## Scenario

You're working on your app and notice that some "Showcase Leader" variant cards are missing the `isShowcase` flag, which breaks filtering in your UI.

## Step 1: Identify the Issue

First, let's confirm the issue exists:

```bash
node -e "import('./src/utils/cardData.js').then(m => { 
  const cards = m.getAllCards(); 
  const showcaseLeaders = cards.filter(c => c.variantType === 'Showcase Leader'); 
  const missing = showcaseLeaders.filter(c => !c.isShowcase);
  console.log('Total Showcase Leaders:', showcaseLeaders.length);
  console.log('Missing isShowcase flag:', missing.length);
  if (missing.length > 0) {
    console.log('Example:', missing[0].id, '-', missing[0].name);
  }
})"
```

Output shows there are cards with the issue!

## Step 2: Check If Fix Already Exists

```bash
npm run show-fixes
```

Look through the batch fixes. You see fixes for "Hyperspace" and "Showcase" but not "Showcase Leader".

## Step 3: Add the Fix

Open `scripts/cardFixes.js` and add a new batch fix:

```javascript
export const batchFixes = [
  // ... existing fixes ...

  // NEW FIX: Set isShowcase=true for Showcase Leader variants
  {
    condition: (card) => card.variantType === 'Showcase Leader' && !card.isShowcase,
    field: 'isShowcase',
    value: true,
    reason: 'Auto-fix: Showcase Leader variant missing isShowcase flag'
  },
]
```

## Step 4: Test the Fix

```bash
# Test the fix system
npm run test:fixes

# Verify it's configured
npm run show-fixes

# Test with real data
node -e "import('./src/utils/cardData.js').then(m => { 
  const cards = m.getAllCards(); 
  const showcaseLeaders = cards.filter(c => c.variantType === 'Showcase Leader'); 
  const missing = showcaseLeaders.filter(c => !c.isShowcase);
  console.log('Showcase Leaders missing flag:', missing.length);
  console.log('Should be 0!');
})"
```

Output should show `0` - the fix worked!

## Step 5: Run Full Test Suite

```bash
npm test
```

Make sure your fix doesn't break anything else.

## Step 6: (Optional) Check a Specific Card

```bash
npm run show-fixes -- --card SHD-123
```

This shows exactly what fixes apply to that card and why.

## Step 7: (Optional) Re-process Existing Data

If you want the fixes to be "baked in" to your `cards.json`:

```bash
npm run fetch-cards
```

This fetches fresh data and applies all fixes, saving the result.

**Note:** This step is optional! The fixes apply at runtime anyway.

## Step 8: Commit and Deploy

```bash
git add scripts/cardFixes.js
git commit -m "Fix: Add isShowcase flag to Showcase Leader variants"
git push
```

## Step 9: Verify in Production

After deployment, your app automatically applies the fix on startup. You can verify with logs or by checking the metadata:

```javascript
import { getCardMetadata } from './src/utils/cardData.js'

const meta = getCardMetadata()
console.log(`Applied ${meta.fixesAppliedAtRuntime} fixes`)
```

## Complete!

That's it! Your fix is now:
- ✅ Applied automatically in production
- ✅ Version-controlled with your code
- ✅ Tested and verified
- ✅ Documented with a reason
- ✅ Easy to rollback if needed

## Bonus: More Complex Example

What if you need to fix multiple fields at once?

```javascript
export const customTransforms = [
  {
    name: 'Fix Showcase Leader flags',
    transform: (card) => {
      if (card.variantType === 'Showcase Leader') {
        // Set both flags
        card.isShowcase = true
        card.isLeader = true
        
        // Also normalize the subtitle
        if (card.subtitle === '') {
          card.subtitle = null
        }
      }
      return card
    }
  },
]
```

This gives you more control for complex fixes.

## Troubleshooting

### Fix not applying?

1. Check your condition logic:
```bash
npm run show-fixes -- --card CARD-ID
```

2. Make sure the card data has the field you're checking:
```bash
node -e "import('./src/utils/cardData.js').then(m => { 
  const cards = m.getAllCards(); 
  const card = cards.find(c => c.id === 'CARD-ID'); 
  console.log(JSON.stringify(card, null, 2)); 
})"
```

3. Check for typos in field names (JavaScript is case-sensitive!)

### Want to see before/after?

Temporarily modify `src/utils/cardFixes.js` to log changes:

```javascript
function applyBatchFixes(cards) {
  let fixCount = 0

  batchFixes.forEach(batchFix => {
    cards.forEach(card => {
      if (batchFix.condition(card)) {
        const oldValue = card[batchFix.field]
        card[batchFix.field] = batchFix.value
        
        console.log(`Fixed ${card.id}: ${batchFix.field} ${oldValue} → ${batchFix.value}`)
        fixCount++
      }
    })
  })

  return fixCount
}
```

### Need to fix just 1-2 specific cards?

Use individual fixes instead:

```javascript
export const cardFixes = [
  {
    id: 'SOR-123',
    field: 'cost',
    value: 5,
    reason: 'API has wrong cost value for this card'
  },
  {
    id: 'SHD-456',
    field: 'hp',
    value: 6,
    reason: 'Typo in source data'
  },
]
```

## Real-World Examples

### Example 1: Fix missing Leader flags

```javascript
{
  condition: (card) => card.type === 'Leader' && !card.isLeader,
  field: 'isLeader',
  value: true,
  reason: 'Ensure all Leader cards have isLeader flag'
}
```

### Example 2: Normalize null vs empty strings

```javascript
{
  name: 'Normalize empty subtitles',
  transform: (card) => {
    if (card.subtitle === '') {
      card.subtitle = null
    }
    return card
  }
}
```

### Example 3: Fix data type issues

```javascript
{
  condition: (card) => typeof card.cost === 'string',
  field: 'cost',
  value: (card) => parseInt(card.cost) || 0,
  reason: 'Convert string costs to numbers'
}
```

Wait, that won't work with the current structure. Use a custom transform instead:

```javascript
{
  name: 'Convert string costs to numbers',
  transform: (card) => {
    if (typeof card.cost === 'string') {
      card.cost = parseInt(card.cost) || 0
    }
    return card
  }
}
```

### Example 4: Fix inconsistent arena values

```javascript
{
  name: 'Normalize arena names',
  transform: (card) => {
    if (card.arenas) {
      card.arenas = card.arenas.map(arena => {
        // Capitalize properly
        return arena.charAt(0).toUpperCase() + arena.slice(1).toLowerCase()
      })
    }
    return card
  }
}
```

## Summary

The pattern is always:
1. Discover issue
2. Add fix to `scripts/cardFixes.js`
3. Test with `npm run test:fixes`
4. Commit and deploy
5. Fix applies automatically ✨

Simple, version-controlled, and testable!