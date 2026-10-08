# Pack Fidelity: Theory vs. Actuals Architecture

How Protect the Pod compares **what the generator should produce** against
**what production actually opened**, and reports the statistical significance of
any gap — without ever running an expensive simulation on a web request.

## The problem

The "theoretical" distribution of a booster pack is not an analytic formula. It
is whatever the belt/collation system produces — a complex, stateful,
without-replacement process. The only faithful way to know the true rates is to
run the generator tens of thousands of times and tally. That is far too
expensive to do per request, but the stats page needs to show users how their
(and the platform's) real pulls line up with the design intent, and we need to
recompute when a new set ships or the collation algorithm changes.

## The shape of the solution

```
  scripts/computePackTheory.ts   ──run offline──▶   src/data/packTheory.json
  (Monte-Carlo of real generator)                  (committed artifact, keyed to
                                                     COLLATION_VERSION)
                                                            │
                                                            │ read O(1)
                                                            ▼
  card_generations (prod)  ──GROUP BY──▶  /api/stats/pack-actuals  ──▶  webpage
                                                            │              │
                                                            └──────────────┤
                                                src/services/packFidelity.ts
                                                (pure z-test, shared by web + script)
                                                            │
  scripts/comparePackActuals.ts  ──────────────────────────┘──▶  docs/PACK_FIDELITY_REPORT.md
```

Three ideas:

1. **Precompute the theory, commit it.** The heavy Monte-Carlo runs offline and
   writes a small JSON artifact. The app reads it in O(1); it never simulates.
2. **One pure comparison.** `src/services/packFidelity.ts` holds the verdict math
   so the offline report and the live webpage produce identical results.
3. **Version the collation.** The artifact is stamped with `COLLATION_VERSION`.
   A mismatch tells the app and the recompute script the theory is stale.

## Components

### 1. Theory artifact — `src/data/packTheory.json`
Produced by `npm run compute-theory` (`scripts/computePackTheory.ts`). For every
configured set it generates N sealed pods (default 2,500 → 15,000 packs/set,
belt cache reset per pod to mirror a real open) and records, per pack, the count
of every **rarity** bucket, **aspect** category, and **variant** treatment. It
stores the per-pack **mean and standard deviation** of each bucket — not just the
mean — because that is what powers the significance test (below).

```jsonc
{
  "collationVersion": 1,
  "generatedAt": "2026-…",
  "podsPerSet": 2500, "packsPerPod": 6,
  "sets": {
    "LAW": {
      "packs": 15000,
      "cardsPerPack": { "mean": 16, "sd": 0 },
      "rarity":  { "Common": { "mean": 11.49, "sd": 0.61 }, … },
      "aspect":  { "Vigilance": { "mean": …, "sd": … }, … },
      "variant": { "hyperspace": { "mean": 1.77, "sd": 0.74 },
                   "hyperspaceFoil": { "mean": 1, "sd": 0 },
                   "showcase": { "mean": 0.0017, "sd": … },
                   "prestige": { "mean": 0.053, "sd": … }, … }
    }
  }
}
```

### 2. Collation version — `COLLATION_VERSION` in `src/utils/packConstants.ts`
A single integer, bumped by hand whenever a change shifts the produced
distribution (belt structure, slot composition, upgrade rates, rarity weights).
The artifact records the version it was generated under. If
`packTheory.collationVersion !== COLLATION_VERSION`, the theory is stale: the
report script and the UI should warn, and someone must re-run
`npm run compute-theory`.

### 3. Pure comparison — `src/services/packFidelity.ts`
`compareDimension(theory, actual, packs)` returns a verdict per bucket.

Because collation counts are **constrained and sub-Poisson** (exactly 16
cards/pack, exactly one leader, hoppers drawn without replacement), a
chi-square/multinomial test would misstate significance. We instead use the
Monte-Carlo per-pack SD and the CLT: over *M* packs the observed total is
≈ Normal(mean·M, (sd·√M)²), so

```
z = (observed − mean·M) / (sd·√M),   p = two-sided normal tail.
```

Verdict labels combine statistical *and* practical significance (large samples
make trivial gaps "significant"):

| label | meaning |
|---|---|
| ✅ `aligned` | p ≥ 0.01 |
| 🟡 `minor` | significant but < 5% per-pack deviation (expected at large N) |
| 🔴 `notable` | significant **and** ≥ 5% per-pack deviation |
| ⛔ `deterministic-mismatch` | a fixed slot (sd = 0) whose count didn't hold |

### 4. Live actuals — `GET /api/stats/pack-actuals?setCode=XXX`
A few `GROUP BY`s over `card_generations` (rarity, aspect via `aspects` array,
variant via `treatment`/`is_showcase`) plus a pack count. Returns counts shaped
exactly like the theory buckets. Cached `public, s-maxage=300`. This is the only
runtime cost; the comparison itself is arithmetic.

### 5. Offline report — `npm run pack-fidelity`
`scripts/comparePackActuals.ts` reads the theory artifact, queries a database
(prod via `.env`, or dev via `FIDELITY_ENV=dev`, or `FIDELITY_DATABASE_URL`),
runs `compareDimension`, and writes `docs/PACK_FIDELITY_REPORT.md` — per-set
tables of theory vs. actual per-pack rates, Δ%, z, p, and verdict. It also prints
the distinct DB `treatment` values it saw so the variant mapping can be verified.

## How the webpage renders it
The stats page fetches `packTheory.json` (static import or a tiny route) and
`/api/stats/pack-actuals?setCode=`, then calls `compareDimension` in the browser
and renders the same table the report produces, with a "matches design intent" /
"diverges" headline per dimension. No server compute beyond the cached GROUP BY.

> NOTE: the variant comparison depends on mapping the DB `treatment` column onto
> the theory variant buckets (`variantBucket` in both the route and the script).
> The first real run prints the distinct treatment values — confirm the mapping
> before trusting the variant rows. Rarity and aspect comparisons are robust
> regardless, since both sides read the same `rarity`/`aspects` columns.

## Maintenance runbook
- **New set ships:** `npm run compute-theory` (it iterates every configured set
  automatically), commit the updated `packTheory.json`, then `npm run pack-fidelity`.
- **Collation algorithm changes:** bump `COLLATION_VERSION`, then the two
  commands above. The version stamp guarantees stale theory is caught.
- **Sample size:** `npx tsx scripts/computePackTheory.ts --pods=10000` for tighter
  estimates on rare variants (showcase ≈ 1/288–1/576, prestige ≈ 1/18). Means
  stabilise quickly; rare-event SDs benefit from more pods.
