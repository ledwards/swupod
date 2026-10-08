# Pack Quality Dashboard

A public-facing transparency page demonstrating our pack generation accurately simulates real Star Wars: Unlimited booster pack collation.

**Status: Implemented**

- Page: `/quality`
- API: `/api/public/pack-quality?setCode=SOR`
- Service: `src/services/packQualityService.ts`

## Executive Summary

The Pack Quality Dashboard will display real-time statistics from the `card_generations` table, compare observed rates against expected rates, and provide statistical validation that builds collector confidence. Think of it as "building trust through transparency."

---

## Research Findings

### What Makes a Booster Pack "Realistic"?

**Structural Requirements:**
- Exactly 16 cards per pack
- 1 Leader, 1 Base, 9 Commons, 3 Uncommons (or 2 + upgrade), 1 Rare/Legendary, 1 Foil
- No duplicate base treatment cards within a single pack

**Collation Rules:**
- 12-card deduplication window prevents adjacent duplicates
- Aspect coverage guaranteed: every pack has Vigilance, Command, Aggression, Cunning
- Belt A/B slot patterns match physical packs

**Rarity Distribution:**
- Leaders: 5:1 common-to-rare ratio (1/6 packs have rare leader)
- Rare slot: 7:1 rare-to-legendary for Sets 1-3 (1 in 8), 5:1 for Sets 4+ (1 in 6)
- Foil slot: 70% Common, 20% Uncommon, 8% Rare, 2% Legendary

**Treatment/Upgrade Rates (Sets 1-6, belt-driven):**
| Treatment | Expected Rate | Mechanism |
|-----------|---------------|-----------|
| Hyperspace Leader | 16.7% (1/6) | HyperspaceUpgradeBelt |
| Hyperspace Base | 16.7% (1/6) | HyperspaceUpgradeBelt |
| Hyperspace Common | 20% (1/5) | HyperspaceUpgradeBelt |
| UC3 → HS Rare/Legendary | 13.3% (1/7.5) | HyperspaceUpgradeBelt (random HS R/L) |
| Hyperfoil | 2% (1/50) | Independent coin flip |
| Showcase Leader | 0.35% (1/288) | Independent coin flip |

**NOTE:** The rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.

**HS Distribution Stats (belt-driven):**
- ~2/3 of packs have at least 1 HS card, ~1/3 have none
- Max 2 HS cards per pack (3+ is a ≥3σ outlier)
- HS Leader + HS Base never co-occur in same pack

### Industry Standards

- MTG Arena publishes drop rates with N:M format (e.g., "1:20")
- UK loot box regulations require probability disclosure
- Best practice: prominent, accessible disclosures with clear explanations

---

## Metrics to Track

### Tier 1: Structural Integrity (Must Pass)

| Metric | Expected | Display |
|--------|----------|---------|
| Pack Size | 16 cards | Pass/Fail badge |
| Leaders per Pack | 1 | Pass/Fail |
| Bases per Pack | 1 | Pass/Fail |
| Same-Treatment Duplicates | 0 | Pass/Fail |

### Tier 2: Rarity Distribution

| Metric | Expected | Display |
|--------|----------|---------|
| Legendary in R/L Slot | ~12.5-16.7% (set dependent) | Gauge with confidence interval |
| Foil Rarity Breakdown | 70/20/8/2 | Pie chart + comparison |
| UC3 Upgrade Rate | ~18% | Percentage bar |

### Tier 3: Treatment Rates

Show observed vs expected for each treatment type with z-score validation.

### Tier 4: Collation Quality

| Metric | Expected |
|--------|----------|
| All 4 Basic Aspects in Pack | 100% |
| Duplicate Distance | >= 12 cards |

---

## Data Pipeline

### Aggregation Strategy

```
Real-time (< 5 min):     Total packs, per-set counts
Hourly aggregated:       Treatment %, rarity %, per-card counts
Daily summaries:         Z-scores, confidence intervals, anomaly flags
```

### API Endpoint

**`GET /api/public/pack-quality?setCode=SOR`**

```typescript
interface PackQualityResponse {
  setCode: string;
  sampleSize: {
    totalPacks: number;
    dateRange: { start: string; end: string };
  };

  structuralMetrics: {
    packSizeCompliance: { rate: number; status: 'pass' | 'fail' };
    noDuplicatesCompliance: { rate: number; status: 'pass' | 'fail' };
  };

  rarityMetrics: {
    legendaryRate: MetricResult;
    foilDistribution: Record<string, MetricResult>;
  };

  treatmentMetrics: {
    hyperspaceLeader: MetricResult;
    hyperspaceBase: MetricResult;
    showcaseLeader: MetricResult;
    // ...
  };
}

interface MetricResult {
  observed: number;
  expected: number;
  zScore: number;
  status: 'expected' | 'outlier' | 'extreme';
  sampleSize: number;
  confidenceInterval: { low: number; high: number };
}
```

---

## UI Design

### Page Structure

```
/quality

┌─────────────────────────────────────────────────────────────┐
│  Pack Quality Dashboard                                      │
│  "Building trust through transparency"                       │
├─────────────────────────────────────────────────────────────┤
│  Set Selector: [SOR] [SHD] [TWI] [JTL] [LOF] [SEC]          │
├─────────────────────────────────────────────────────────────┤
│  Overview Cards                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 12,456   │ │ 100%     │ │ 98.2%    │ │ 0        │       │
│  │ Packs    │ │ Pass     │ │ Within   │ │ Critical │       │
│  │ Generated│ │ Rate     │ │ Expected │ │ Anomalies│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Rarity Distribution                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Legendary Drop Rate                                    │  │
│  │ Expected: 12.5% (1 in 8)  |  Observed: 12.3%          │  │
│  │ [████████████████░░░░] z=0.42 ✓ Within Expected       │  │
│  │ Sample: 8,234 packs                                    │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Treatment Rates                                             │
│  [Hyperspace Leader] [Hyperspace Base] [Showcase] etc.      │
├─────────────────────────────────────────────────────────────┤
│  How We Calculate (expandable FAQ)                          │
│  Explains belt system, expected rates, methodology          │
└─────────────────────────────────────────────────────────────┘
```

### Visual Components

1. **Status Badges**: ✓ Green "Within Expected" | ⚠ Yellow "Outlier" | ✗ Red "Anomaly"
2. **Progress Bars**: Show observed rate, expected rate line, 95% CI shaded region
3. **Hover Tooltips**: Plain-language explanations
4. **Methodology Section**: Link to belt system docs

---

## Implementation Status

### Phase 1: Data Foundation ✅
- [x] Created `src/services/packQualityService.ts` with aggregation queries
- [x] Added `/api/public/pack-quality` endpoint
- [x] Queries card_generations table with pack_index tracking

### Phase 2: Core Dashboard ✅
- [x] Created `/app/quality/page.tsx`
- [x] Implemented set selector and overview cards
- [x] Added rarity distribution section with individual metrics
- [x] Added treatment rates section

### Phase 3: Statistical Rigor ✅
- [x] Added Wilson score confidence intervals
- [x] Implemented chi-squared goodness-of-fit test for foil distribution
- [x] Z-score categorization for all metrics

### Phase 4: Polish ✅
- [x] Methodology explanation section
- [x] Mobile responsive design
- [x] Added to AuthWidget navigation menu
- [x] Added footer link on landing page

---

## File Structure

```
app/
├── quality/
│   ├── page.tsx                    # Main dashboard
│   ├── Quality.css
│   └── components/
│       ├── QualityOverview.tsx     # Summary cards
│       ├── RaritySection.tsx       # Rarity metrics
│       ├── TreatmentSection.tsx    # Treatment gauges
│       ├── MetricGauge.tsx         # Reusable gauge
│       ├── ConfidenceBar.tsx       # Progress bar with CI
│       └── MethodologyFAQ.tsx      # Expandable docs

app/api/public/
└── pack-quality/
    └── route.ts                    # Public API endpoint

src/services/
└── packQualityService.ts           # Aggregation logic

migrations/
└── 029_pack_quality_views.sql      # Materialized views
```

---

## Key Challenges

1. **Rare Event Sample Size**: Showcase leaders (1/288) need ~800+ packs for significance. Display "Insufficient sample" when appropriate.

2. **Historical Data Gaps**: Older data may lack `pack_index`. Show metrics for both tracked packs and total cards.

3. **Statistical Interpretation**: Users don't understand z-scores. Use plain language: "Within expected" / "Slightly unusual" / "Needs investigation"

4. **Real-time vs Cached**: Balance freshness against DB load. Consider hourly cache.

---

## Reference Files

- `src/utils/statsCalculations.ts` - Existing z-score calculations
- `src/utils/packConstants.ts` - Source of truth for expected rates
- `src/qa/packGeneration.test.ts` - Statistical validation patterns
- `docs/BELTS.md`, `docs/PACKS.md` - Collation documentation
