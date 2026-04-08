# Bot Drafting Fixes: Alignment Penalty + Cost Curve Saturation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bot drafting issues: (1) bots with neutral leaders picking Heroism/Villainy cards they can't play, and (2) bots over-drafting turn-1 plays past saturation.

**Architecture:** Both fixes modify `BaseStrategy.ts` scoring logic. Issue 1 adds alignment penalty to `_calculateColorScore` for neutral leaders. Issue 2 adds cost surplus penalty to `_scoreCard` as a direct score modifier. Tests are added to the existing `strategies.test.ts` file using the established mock helpers.

**Tech Stack:** TypeScript, Node.js built-in test runner

---

## Context

**Issue 1 — Neutral leader alignment gap:**
`_calculateColorScore` (BaseStrategy.ts:342-415) bans opposing alignment (-10000) but has ZERO penalty when the committed leader has no alignment (Tobias Beckett, Saw Gerrera, DJ). A Heroism card sharing a color with the leader (e.g., Heroism+Vigilance with Tobias Beckett's Vigilance+Cunning) scores +50 — identical to a neutral in-aspect card. In reality, playing it requires a Heroism base, sacrificing a color slot.

Pre-commitment has the same gap: if all drafted leaders are neutral, `_getDraftedAlignment()` returns null and no alignment penalty applies.

**Issue 2 — No diminishing returns on cost curve:**
`_calculateNeedScore` (BaseStrategy.ts:448-454) gives a bonus for underdrafted cost buckets but never penalizes surplus. Once the target ratio is met, the bonus drops to 0 but quality score (~60-100) + color score (+50) continue making 1-drops attractive. A bot with 8 one-drops rates the 9th at ~98 total score — competitive with better cards.

---

### Task 1: Add failing tests for neutral leader alignment penalty

**Files:**
- Modify: `src/bots/behaviors/strategies/strategies.test.ts`

- [ ] **Step 1: Add test — neutral leader should penalize Heroism cards post-commitment**

Add after the existing "Card Selection Integration" section (after line 413):

```typescript
// --- Neutral Leader Alignment Penalty Tests ---
console.log('\n\x1b[36mNeutral Leader Alignment Penalty\x1b[0m')

test('neutral leader penalizes Heroism cards after commitment', () => {
  const strategy = new AllPlayerStrategy(null)
  // Tobias Beckett: Vigilance + Cunning, no alignment
  strategy.committedLeader = mockLeader('Tobias Beckett', ['Vigilance', 'Cunning'])

  // Heroism+Vigilance card — shares a color but has unmatched alignment
  const heroismCard = mockCard('Heroism Unit', { aspects: ['Heroism', 'Vigilance'] })
  // Pure Vigilance card — fully in-aspect
  const neutralCard = mockCard('Neutral Unit', { aspects: ['Vigilance'] })

  const heroismScore = strategy._calculateColorScore(heroismCard, [], true, { setCode: 'LAW' })
  const neutralScore = strategy._calculateColorScore(neutralCard, [], true, { setCode: 'LAW' })

  // Heroism card should score significantly worse than in-aspect neutral card
  assert(heroismScore < neutralScore - 100,
    `Heroism card (${heroismScore}) should score much worse than neutral (${neutralScore}) with neutral leader`)
})

test('neutral leader penalizes Villainy cards after commitment', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Saw Gerrera', ['Command', 'Aggression'])

  const villainyCard = mockCard('Villainy Unit', { aspects: ['Villainy', 'Aggression'] })
  const neutralCard = mockCard('Neutral Unit', { aspects: ['Aggression'] })

  const villainyScore = strategy._calculateColorScore(villainyCard, [], true, { setCode: 'LAW' })
  const neutralScore = strategy._calculateColorScore(neutralCard, [], true, { setCode: 'LAW' })

  assert(villainyScore < neutralScore - 100,
    `Villainy card (${villainyScore}) should score much worse than neutral (${neutralScore}) with neutral leader`)
})

test('neutral leader penalizes alignment cards pre-commitment', () => {
  const strategy = new AllPlayerStrategy(null)
  // Bot has drafted neutral leaders only, hasn't committed
  const neutralLeaders = [
    mockLeader('Tobias Beckett', ['Vigilance', 'Cunning']),
    mockLeader('Saw Gerrera', ['Command', 'Aggression']),
  ]

  const heroismCard = mockCard('Heroism Unit', { aspects: ['Heroism', 'Vigilance'] })
  const pureCard = mockCard('Pure Vig Unit', { aspects: ['Vigilance'] })

  const heroismScore = strategy._calculateColorScore(heroismCard, neutralLeaders, false, { setCode: 'LAW' })
  const pureScore = strategy._calculateColorScore(pureCard, neutralLeaders, false, { setCode: 'LAW' })

  assert(heroismScore < pureScore - 50,
    `Pre-commit: Heroism card (${heroismScore}) should score worse than pure in-color (${pureScore})`)
})

test('aligned leader still allows same-alignment cards', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])

  const heroismCard = mockCard('Heroism Unit', { aspects: ['Heroism', 'Aggression'] })
  const score = strategy._calculateColorScore(heroismCard, [], true, { setCode: 'SOR' })

  // Should be positive — leader provides Heroism
  assert(score > 0, `Same-alignment card should score positive, got ${score}`)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx src/bots/behaviors/strategies/strategies.test.ts`

Expected: The first 3 tests FAIL (neutral leader doesn't penalize alignment). The 4th test PASSES (same-alignment already works).

---

### Task 2: Implement neutral leader alignment penalty

**Files:**
- Modify: `src/bots/behaviors/BaseStrategy.ts:342-415` (`_calculateColorScore`)

- [ ] **Step 3: Add post-commitment penalty for uncovered alignment in `_calculateColorScore`**

In `_calculateColorScore`, after the existing opposing alignment ban (line 360, `return -10000`), add a check for neutral leaders. The full committed-leader block (lines 351-382) becomes:

```typescript
    // After Y (committed to leader): alignment is LOCKED, hard ban on opposing
    if (this.committedLeader) {
      const leaderColors = this._getLeaderColors(this.committedLeader)

      // Wrong alignment is an absolute ban — Heroism cards never go in Villainy decks
      const leaderAlignment = this._getLeaderAlignment(this.committedLeader)
      if (leaderAlignment) {
        const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism' : 'Villainy'
        if (cardAspects.includes(opposingAlignment)) {
          return -10000
        }
      } else {
        // Neutral leader (no alignment): penalize alignment cards.
        // Playing Heroism/Villainy cards with a neutral leader requires committing
        // your base to that alignment, sacrificing a color slot. This is a real cost
        // that makes these cards significantly worse than in-aspect alternatives.
        if (cardAspects.includes('Heroism') || cardAspects.includes('Villainy')) {
          return -300
        }
      }

      // Only match on COLOR aspects — alignment matching doesn't reduce aspect penalties
      const leaderMatch = this._countMatchingAspects(cardAspects, leaderColors)

      if (leaderMatch > 0) {
        return 50 * leaderMatch
      }
      if (this.committedBaseColor && cardAspects.includes(this.committedBaseColor)) {
        return 40
      }
      if (cardAspects.length === 0) {
        return 15  // Neutral
      }
      // Off-aspect cards should NEVER be picked over any in-aspect card.
      // After commitment, a player will always pick the worst in-aspect card
      // over the best off-aspect card. Only forced last picks end up off-aspect.
      // -1000 ensures this: even with max quality (150) × qualityWeight (0.6) = 90,
      // the total is still deeply negative (-910). LAW splash bonus can partially
      // offset this for valid splash cards only.
      return -1000
    }
```

- [ ] **Step 4: Add pre-commitment penalty for alignment cards when all leaders are neutral**

In the exploration phase section (lines 384-415), after the existing `draftedAlignment` check (line 399), add:

```typescript
    // Exploration phase: prefer in-color, penalize off-color
    if (draftedLeaders.length === 0) {
      return cardAspects.length === 0 ? 15 : 10
    }

    const allLeaderColors = this._getColorsFromLeaders(draftedLeaders)

    // Pre-Y: alignment is NOT locked — bots can still draft either alignment.
    // Only penalize (don't ban) opposing alignment cards to keep options open.
    // The hard ban activates after Y (committed path above).
    const draftedAlignment = this._getDraftedAlignment(draftedLeaders)
    if (draftedAlignment) {
      const opposingAlignment = draftedAlignment === 'Villainy' ? 'Heroism' : 'Villainy'
      if (cardAspects.includes(opposingAlignment)) {
        return -500  // Very strong penalty pre-commitment — nearly a ban
      }
    } else {
      // All drafted leaders are neutral — alignment cards cost a base slot.
      // Moderate penalty: bot should prefer neutral cards but isn't fully banned.
      if (cardAspects.includes('Heroism') || cardAspects.includes('Villainy')) {
        return -150
      }
    }
```

The rest of the function (lines 402-414) stays the same.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx src/bots/behaviors/strategies/strategies.test.ts`

Expected: ALL tests pass, including the 4 new alignment tests.

- [ ] **Step 6: Run full bot eval to check no regressions**

Run: `node src/bots/behaviors/botEval.test.ts`

Expected: All eval tests pass. The "zero opposing alignment cards" eval should still pass since we only penalize (not ban) alignment with neutral leaders.

- [ ] **Step 7: Commit**

```bash
git add src/bots/behaviors/BaseStrategy.ts src/bots/behaviors/strategies/strategies.test.ts
git commit -m "fix: penalize alignment cards for bots with neutral leaders

Bots with neutral leaders (Tobias Beckett, Saw Gerrera, DJ) now get a
-300 penalty for Heroism/Villainy cards post-commitment, and -150
pre-commitment. Previously these cards had zero alignment penalty,
causing bots to freely draft Heroism cards they couldn't play."
```

---

### Task 3: Add failing tests for cost curve saturation penalty

**Files:**
- Modify: `src/bots/behaviors/strategies/strategies.test.ts`

- [ ] **Step 8: Add test — bot should deprioritize 1-drops when saturated**

Add after the neutral leader tests:

```typescript
// --- Cost Curve Saturation Tests ---
console.log('\n\x1b[36mCost Curve Saturation\x1b[0m')

test('bot deprioritizes 1-drops when saturated vs target', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test Leader', ['Aggression', 'Heroism'])
  strategy.committedBaseColor = 'Cunning'

  // Deck profile: target ~4 one-drops out of 30 (realistic)
  const profile: DeckProfile = {
    avgUnits: 20, avgUpgrades: 5, avgEvents: 5,
    avgCostCurve: { 0: 0, 1: 4, 2: 7, 3: 6, 4: 5, 5: 4, 6: 2, 7: 2 },
    cardFrequency: new Map(), baseAspects: {},
  }
  const stats = mockStats({
    deckProfiles: new Map([['Test Leader', profile]]),
  })

  // Bot already has 8 one-drops (double the target)
  const existingOneCosts = Array.from({ length: 8 }, (_, i) =>
    mockCard(`OneCost_${i}`, { aspects: ['Aggression'], cost: 1 })
  )
  // Plus some other cards
  const otherCards = Array.from({ length: 10 }, (_, i) =>
    mockCard(`Other_${i}`, { aspects: ['Aggression'], cost: 3 + (i % 3) })
  )
  const draftedCards = [...existingOneCosts, ...otherCards]

  // Compare: another 1-drop vs a 3-drop, same rarity and color
  const oneDrop = mockCard('Another 1-Drop', { aspects: ['Aggression'], cost: 1 })
  const threeDrop = mockCard('A 3-Drop', { aspects: ['Aggression'], cost: 3 })

  const oneDropScore = strategy._scoreCard(
    oneDrop, [strategy.committedLeader], draftedCards, 20, stats, { setCode: 'SOR' }
  )
  const threeDropScore = strategy._scoreCard(
    threeDrop, [strategy.committedLeader], draftedCards, 20, stats, { setCode: 'SOR' }
  )

  assert(threeDropScore > oneDropScore,
    `Saturated 1-drop (${oneDropScore.toFixed(1)}) should score lower than needed 3-drop (${threeDropScore.toFixed(1)})`)
})

test('bot does NOT penalize 1-drops when below target', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test Leader', ['Aggression', 'Heroism'])
  strategy.committedBaseColor = 'Cunning'

  const profile: DeckProfile = {
    avgUnits: 20, avgUpgrades: 5, avgEvents: 5,
    avgCostCurve: { 0: 0, 1: 4, 2: 7, 3: 6, 4: 5, 5: 4, 6: 2, 7: 2 },
    cardFrequency: new Map(), baseAspects: {},
  }
  const stats = mockStats({
    deckProfiles: new Map([['Test Leader', profile]]),
  })

  // Bot has only 1 one-drop (well below target of 4)
  const draftedCards = [
    mockCard('OneCost_0', { aspects: ['Aggression'], cost: 1 }),
    ...Array.from({ length: 10 }, (_, i) =>
      mockCard(`Other_${i}`, { aspects: ['Aggression'], cost: 3 + (i % 3) })
    ),
  ]

  const oneDrop = mockCard('Needed 1-Drop', { aspects: ['Aggression'], cost: 1 })
  const score = strategy._scoreCard(
    oneDrop, [strategy.committedLeader], draftedCards, 12, stats, { setCode: 'SOR' }
  )

  // Should be a positive, healthy score — no surplus penalty
  assert(score > 50, `Under-target 1-drop should score well (${score.toFixed(1)}), not be penalized`)
})

test('cost surplus penalty scales with excess', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test Leader', ['Aggression', 'Heroism'])
  strategy.committedBaseColor = 'Cunning'

  const profile: DeckProfile = {
    avgUnits: 20, avgUpgrades: 5, avgEvents: 5,
    avgCostCurve: { 0: 0, 1: 4, 2: 7, 3: 6, 4: 5, 5: 4, 6: 2, 7: 2 },
    cardFrequency: new Map(), baseAspects: {},
  }
  const stats = mockStats({
    deckProfiles: new Map([['Test Leader', profile]]),
  })

  // 6 one-drops (1.5x target) — mild surplus
  const mildSurplus = Array.from({ length: 6 }, (_, i) =>
    mockCard(`OneCost_${i}`, { aspects: ['Aggression'], cost: 1 })
  )
  const fillers = Array.from({ length: 10 }, (_, i) =>
    mockCard(`Filler_${i}`, { aspects: ['Aggression'], cost: 4 })
  )

  // 10 one-drops (2.5x target) — severe surplus
  const severeSurplus = Array.from({ length: 10 }, (_, i) =>
    mockCard(`OneCost_${i}`, { aspects: ['Aggression'], cost: 1 })
  )
  const fewerFillers = Array.from({ length: 6 }, (_, i) =>
    mockCard(`Filler_${i}`, { aspects: ['Aggression'], cost: 4 })
  )

  const testCard = mockCard('Yet Another 1-Drop', { aspects: ['Aggression'], cost: 1 })

  const mildScore = strategy._scoreCard(
    testCard, [strategy.committedLeader], [...mildSurplus, ...fillers], 18, stats, { setCode: 'SOR' }
  )
  const severeScore = strategy._scoreCard(
    testCard, [strategy.committedLeader], [...severeSurplus, ...fewerFillers], 18, stats, { setCode: 'SOR' }
  )

  assert(severeScore < mildScore,
    `Severe surplus (${severeScore.toFixed(1)}) should score lower than mild surplus (${mildScore.toFixed(1)})`)
})
```

- [ ] **Step 9: Run tests to verify they fail**

Run: `npx tsx src/bots/behaviors/strategies/strategies.test.ts`

Expected: First test FAILS (saturated 1-drop still scores higher than 3-drop). Second test PASSES (no penalty needed). Third test FAILS (no scaling — both score the same).

---

### Task 4: Implement cost curve saturation penalty

**Files:**
- Modify: `src/bots/behaviors/BaseStrategy.ts:259-275` (`_scoreCard`)

- [ ] **Step 10: Add cost surplus penalty to `_scoreCard`**

In `_scoreCard`, after the strategy-specific adjustments (line 273) and before the return (line 275), add:

```typescript
    // Strategy-specific adjustments
    totalScore += this.adjustCardScore(card, totalScore, context)

    // Cost curve saturation penalty: once a cost bucket is over-drafted,
    // actively penalize additional picks. This prevents bots from hoarding
    // turn-1 plays (or any cost bucket) past the point of diminishing returns.
    // Applied as a direct score penalty (not through need/needWeight) so it
    // always bites regardless of draft phase.
    if (isCommitted && stats) {
      const profile = stats.deckProfiles.get(this.committedLeader?.name || '')
      if (profile) {
        const myCards = draftedCards.filter(c => !c.isLeader && !c.isBase)
        const costBucket = Math.min(card.cost || 0, 7)
        const targetCount = profile.avgCostCurve[costBucket] || 0
        const currentCount = myCards.filter(c => Math.min(c.cost || 0, 7) === costBucket).length

        // Penalty kicks in at 130% of target (allows slight over-draft for flexibility)
        const threshold = targetCount * 1.3
        if (currentCount > threshold) {
          const excess = currentCount - threshold
          // -30 per excess card, capped at -120
          totalScore -= Math.min(excess * 30, 120)
        }
      }
    }

    return totalScore
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `npx tsx src/bots/behaviors/strategies/strategies.test.ts`

Expected: ALL tests pass, including the 3 new cost curve tests.

- [ ] **Step 12: Run full bot eval to check no regressions**

Run: `node src/bots/behaviors/botEval.test.ts`

Expected: All eval tests pass. Deck building evals should still produce valid 30-card decks with reasonable cost curves.

- [ ] **Step 13: Commit**

```bash
git add src/bots/behaviors/BaseStrategy.ts src/bots/behaviors/strategies/strategies.test.ts
git commit -m "fix: add cost curve saturation penalty to prevent over-drafting 1-drops

Bots now get a direct score penalty when a cost bucket exceeds 130% of
the target from deck profile data. Penalty scales at -30 per excess card
(max -120). Prevents bots from hoarding 11+ turn-1 plays when they only
need 4-5."
```

---

### Task 5: Integration validation

- [ ] **Step 14: Run all bot tests together**

Run: `npx tsx src/bots/behaviors/strategies/strategies.test.ts && node src/bots/behaviors/botEval.test.ts`

Expected: All tests pass.

- [ ] **Step 15: Run the full test suite**

Run: `npm run test`

Expected: All 204+ tests pass.

- [ ] **Step 16: Build to verify no TypeScript errors**

Run: `npm run build`

Expected: Clean build, no errors.
