# Quick Start: Card Fixes

## TL;DR

Your card data now has **automatic error correction** at runtime. No manual post-processing needed in production!

## 🎯 What You Need to Know

### Current Status
- ✅ **3,750 fixes** are being applied automatically
- ✅ All your code gets corrected data
- ✅ All your tests test corrected data
- ✅ Zero performance impact

### How It Works
```
App starts → Loads cards.json → Applies fixes → Your code gets fixed data
```

It's that simple!

## 🛠️ Common Tasks

### See What Fixes Are Configured
```bash
npm run show-fixes
```

### Test the Fix System
```bash
npm run test:fixes
```

### Check a Specific Card
```bash
npm run show-fixes -- --card SOR-324
```

### Add a New Fix

1. Edit `scripts/cardFixes.js`
2. Add your fix:

```javascript
export const batchFixes = [
  // ... existing fixes ...
  {
    condition: (card) => card.someField === 'wrongValue',
    field: 'someField',
    value: 'correctValue',
    reason: 'Description of why this fix is needed'
  },
]
```

3. Test it:
```bash
npm run test:fixes
```

4. Done! Deploy when ready.

## 📊 See Fixes in Action

```bash
# Count how many fixes are applied
node -e "import('./src/utils/cardData.js').then(m => { 
  const meta = m.getCardMetadata(); 
  console.log('Fixes applied:', meta.fixesAppliedAtRuntime); 
})"

# Check a Hyperspace card gets fixed
node -e "import('./src/utils/cardData.js').then(m => { 
  const cards = m.getAllCards(); 
  const hyper = cards.find(c => c.variantType === 'Hyperspace'); 
  console.log(hyper.id, '- isHyperspace:', hyper.isHyperspace); 
})"
```

## 🔄 Update Workflow

When swu-db.com data changes:

```bash
# 1. Fetch fresh data (applies fixes automatically)
npm run fetch-cards

# 2. Test everything
npm test

# 3. Commit and deploy
git add src/data/cards.json
git commit -m "Update card data"
git push
```

## 🎓 Three Types of Fixes

### 1. Individual Fixes
Fix one specific card:
```javascript
{
  id: 'SOR-324',
  field: 'isHyperspace',
  value: true,
  reason: 'Missing flag on Hyperspace variant'
}
```

### 2. Batch Fixes (Most Common)
Fix many cards matching a pattern:
```javascript
{
  condition: (card) => card.variantType === 'Hyperspace' && !card.isHyperspace,
  field: 'isHyperspace',
  value: true,
  reason: 'Auto-fix Hyperspace variants'
}
```

### 3. Custom Transforms
Complex logic:
```javascript
{
  name: 'Normalize costs',
  transform: (card) => {
    if (card.cost === null && card.type === 'Event') {
      card.cost = 0
    }
    return card
  }
}
```

## 💡 Tips

- **Prefer batch fixes** over individual fixes (more maintainable)
- **Document your reasons** - future you will appreciate it
- **Test after adding fixes** - `npm run test:fixes`
- **Use show-fixes** to debug - `npm run show-fixes -- --card XYZ`

## 📚 More Info

- [Full Documentation](./CARD_FIXES.md) - Complete guide
- [Implementation Details](./IMPLEMENTATION_SUMMARY.md) - How it works
- [Example Fixes](../scripts/cardFixes.js) - See the code

## ❓ FAQ

**Q: Will this slow down my app?**  
A: No! Fixes apply once at startup, before any requests.

**Q: What if I need to update data without redeploying?**  
A: You can implement Option B (dynamic API fetching). Ask if you need this.

**Q: Can I see which cards were fixed?**  
A: Run `npm run fetch-cards` to generate a detailed report at `src/data/card-fixes-report.json`

**Q: How do I rollback a bad fix?**  
A: Just remove it from `scripts/cardFixes.js` and redeploy. It's code, not data!

## 🚀 You're Ready!

The system is working right now:
- Your data is being corrected automatically
- Your tests are testing corrected data
- You can add/remove fixes with simple code changes

Just add fixes to `scripts/cardFixes.js` as you discover issues. That's it!