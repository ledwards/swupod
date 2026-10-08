# Limited rating refresh — impact report

Cutoff: 2026-10-02. Read-only production facts. Nothing here is deployed.

The after column is the worktree consumer: dominant-set environment, all dates, provisional performance letters. Production still serves the frozen before snapshot until a deploy, which this work does not do.

## What changed, separated

| Stage | What was measured | Result |
|---|---|---|
| A. Frozen product | Public plugin card-stats API and the committed ASH pick file, captured before code changes | ASH prerelease window, 237 ASH rows, 93 with GIH copies ≥ 50. HMW request returned 231 ASH rows. SOR, SHD, TWI, JTL, LOF, SEC returned 0. LAW returned 162 printing-filtered rows and 0 cards with GIH copies ≥ 50. Only ASH had a pick snapshot (250,393 contests, 2026-07-30). |
| B. Corrected scope | Same day's facts, environment = a set only when every side is ≥80% that set and ≥10 copies | This is the after coverage below. HMW is no longer ASH. Bare set codes are not pinned to constructed-era dates. |
| C. Added recordings | Facts newer than the morning snapshot | Negligible. The before API snapshot and this query are the same calendar day. The ASH/HMW rate moves are the scope correction, not a new batch of games. |
| D. Refreshed picks | Human draft pods, regenerated read-only | Every base set now has a pick snapshot dated 2026-10-02. ASH grew from 250,393 contests / 6,422 seats (2026-07-30) to 322,049 contests / 8,260 seats. LAW went from no snapshot to 175,858 contests / 4,511 seats. Carbonite products (ASH-CB and the other -CB codes) were not regenerated and were not folded into the base set. |
| E. Model | Training-only shrunk card win rate vs the training base rate, chronological 60/20/20, clustered log loss | No registered set cleared the publish rule. Active ratings stay unpublished. Bots keep their previous lookup. |

A changed letter is not a predictive improvement. No set's held-out interval sat entirely below zero.

## Coverage

Funnel, all Limited, production, read-only: 40644 limited matches, 4536 of them Karabast, 58013 fact rows, 2049 validated fact games, 1090 games with validated hand metrics.

About 2487 Karabast limited matches have no validated card facts. That gap is documented, not backfilled. Production writes were not authorized.

| Set | Before API rows | After games | After hand games | Players | Builds | Pick contests before → after | Active status |
|---|---:|---:|---:|---:|---:|---|---|
| SOR | 0 | 0 | 0 | 0 | 0 | none → 17202 contests, 441 seats, 2026-10-02 | insufficient |
| SHD | 0 | 6 | 0 | 2 | 6 | none → 4680 contests, 120 seats, 2026-10-02 | insufficient |
| TWI | 0 | 0 | 0 | 0 | 0 | none → 6124 contests, 157 seats, 2026-10-02 | insufficient |
| JTL | 0 | 8 | 8 | 3 | 11 | none → 16968 contests, 435 seats, 2026-10-02 | insufficient |
| LOF | 0 | 0 | 0 | 0 | 0 | none → 10804 contests, 277 seats, 2026-10-02 | insufficient |
| SEC | 0 | 0 | 0 | 0 | 0 | none → 26037 contests, 699 seats, 2026-10-02 | insufficient |
| LAW | 162 | 24 | 10 | 6 | 20 | none → 175,858 contests, 4,511 seats, 2026-10-02 | insufficient |
| ASH | 237 | 1385 | 947 | 201 | 1455 | 250,393 (2026-07-30) → 322,049 contests, 8,260 seats, 2026-10-02 | inconclusive |
| HMW | 231 (all ASH) | 448 | 0 | 75 | 468 | none → 15912 contests, 408 seats, 2026-10-02 | inconclusive |
| mixed | n/a | 178 | 125 | 72 | 158 | none → none | not published (not a set) |

SOR, TWI, LOF, and SEC have zero single-set fact games. Their pick snapshots still describe human drafts. Those drafts do not create gameplay ratings.

Mixed is its own environment (178 games). A GP rate model beat the base rate there (test log-loss difference -0.021, interval -0.038 to -0.006, 34 test sides). That result is not shipped. Mixed is not a draft set, and 34 sides is just over the 30-side floor.

## Held-out decisions

Candidate: copy-weighted training card rate, shrunk by 50 copies toward the training base rate. Baseline: that base rate, constant. Features use only earlier games. Negative difference means the candidate has lower log loss.

| Set | Basis | Train / test sides | Baseline log loss | Candidate log loss | Difference (95% clustered) | Calibration | Decision |
|---|---|---|---:|---:|---|---|---|
| SOR | — | 0 | — | — | — | — | insufficient |
| SHD | gp | 3 / 2 | 0.3747 | 0.3617 | -0.0130 (-0.0143, -0.0116) | ok | insufficient |
| TWI | — | 0 | — | — | — | — | insufficient |
| JTL | gp | 5 / 4 | 0.7029 | 0.7088 | +0.0059 (-0.0026, +0.0144) | ok | insufficient |
| LOF | — | 0 | — | — | — | — | insufficient |
| SEC | — | 0 | — | — | — | — | insufficient |
| LAW | gp | 13 / 7 | 0.8166 | 0.8199 | +0.0033 (+0.0004, +0.0073) | ok | insufficient |
| ASH | gih | 604 / 198 | 0.6903 | 0.6931 | +0.0028 (-0.0008, +0.0063) | ok | inconclusive |
| HMW | gp | 276 / 89 | 0.6699 | 0.6747 | +0.0049 (-0.0017, +0.0110) | ok | inconclusive |
| mixed | gih | 73 / 25 | 0.6538 | 0.6450 | -0.0087 (-0.0170, -0.0026) | ok | insufficient |

ASH GP difference -0.0009 with interval crossing zero. ASH GIH difference +0.0028, also crossing zero (the point estimate is slightly worse). HMW GP difference +0.0049, crossing zero, and HMW has no hand metrics so there is no GIH model. LAW, JTL, and SHD have fewer than 30 held-out sides.

Performance letters that clear the count gates are **provisional**. Stability resampling was not applied, so none are marked supported. Withheld means the card missed 50 exposures, 30 games, 10 players, or 10 builds, or the population was too small to grade.

| Set | Cards observed | Provisional letters | Withheld | Supported |
|---|---:|---:|---:|---:|
| SOR | 0 | 0 | 0 | 0 |
| SHD | 71 | 0 | 71 | 0 |
| TWI | 0 | 0 | 0 | 0 |
| JTL | 98 | 0 | 98 | 0 |
| LOF | 0 | 0 | 0 | 0 |
| SEC | 0 | 0 | 0 | 0 |
| LAW | 161 | 0 | 161 | 0 |
| ASH | 242 | 149 | 93 | 0 |
| HMW | 235 | 126 | 109 | 0 |
| mixed | 588 | 0 | 588 | 0 |

## Largest ASH rate movers

Both columns are GIH win rate. Before is the frozen prerelease-window API. After is every validated ASH-environment game through today. The move mixes the wider date window with the dominant-set rule. It is not a model change, and the held-out test did not show the after rates predict better.

| Card | Before GIH WR (copies) | After GIH WR (copies) | After GP WR (copies) | Games | Letter |
|---|---|---|---|---:|---|
| Rancor Keeper | 64.8% (54) | 47.9% (96) | 55.3% (215) | 162 | D+ provisional |
| Tempest Lieutenant | 68.4% (57) | 54.5% (165) | 59.1% (369) | 286 | B- provisional |
| Praetorian Elite | 66.2% (68) | 53.3% (180) | 57.4% (397) | 299 | C+ provisional |
| Clan Vizsla Soldier | 68.3% (60) | 55.8% (206) | 59.9% (476) | 393 | B provisional |
| TIE Striker | 69.5% (59) | 57.1% (163) | 57.2% (318) | 239 | B+ provisional |
| Imposing Scout Walker | 65.5% (87) | 53.2% (248) | 53.7% (601) | 462 | C+ provisional |
| Heightened Awareness | 35.3% (51) | 46.8% (126) | 54.7% (258) | 194 | D provisional |
| Flanking TIE Interceptor | 30.8% (65) | 41.3% (167) | 46.4% (330) | 243 | F provisional |
| Desert Sharpshooter | 63.3% (90) | 52.8% (248) | 56.3% (535) | 419 | C+ provisional |
| Durasteel Plating | 62.5% (104) | 52.0% (248) | 55.9% (449) | 352 | C+ provisional |
| Hold Them Off | 57.7% (52) | 47.8% (115) | 54.9% (215) | 192 | D+ provisional |
| Blade Three — Bane of the Devastator | 45.1% (51) | 54.7% (95) | 53.2% (218) | 182 | B- provisional |
| Mandalorian Super Commandos | 63.2% (68) | 54.1% (196) | 56.2% (416) | 327 | B- provisional |
| Blurrg | 62.0% (92) | 52.9% (223) | 56.7% (490) | 359 | C+ provisional |
| Imperial Armored Commando | 63.7% (113) | 54.7% (232) | 57.8% (547) | 362 | B- provisional |

93 ASH cards have at least 50 GIH copies in both snapshots. Letters above are provisional.

## HMW

The frozen HMW API response was 231 ASH cards. After the scope fix, HMW is 448 games, 474 sides, 75 players, 468 builds, 2026-09-21 through 2026-10-02, and 0 validated hand sides. GP letters for 126 cards are provisional. GIH, IIH, and a GIH tier do not exist for this set. The held-out GP model is inconclusive, so the active rating is not published. The new pick snapshot (15,912 contests, 408 seats) is the pick signal only.

## What the product consumes

- Wayfinder `/api/cards/stats` in this worktree resolves a bare set code to that limited environment and clears implicit constructed dates. `ASH-pre-release` still pins the prerelease window. Unrecognized eras return unavailable. This is not deployed.
- SWUPOD `/api/stats/card-data` forwards the set and the requested dates. `performanceGrade` is kept when pick grades overwrite the legacy `grade` field.
- The stats page can show Active, Pick, Performance, and Compare. Compare is pick versus performance. HMW is a stats tab.
- `activeLimitedRatings.json` has an entry for all nine sets. Every status is `insufficient` or `inconclusive`. No card or leader score is published, so draft bots still use live pick position, then the old name rankings.
- Pick JSON is registered for SOR, SHD, TWI, JTL, LOF, SEC, LAW, ASH, and HMW. The ASH file replaced the 2026-07-30 snapshot. The old counts and sha256 remain in `before/manifest.json`.

## Not done

- Production backfill of Karabast limited matches that have no facts.
- Clustered grade-stability resampling, so no letter is supported.
- A pick-strength or blended candidate inside the time split. The July ASH snapshot cannot score earlier games without leakage, and the new files are aggregates without per-pick timestamps.
- A scheduled confidence job. Cost was not measured, and no candidate cleared publication.
- Deploy.

