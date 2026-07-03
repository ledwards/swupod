# Real Box Collation Data

Slot-level, treatment-aware transcriptions of real opened booster boxes, used to
calibrate the pack generator. **Kept separate from `scripts/eval/fixtures/`** —
those are scanner/OCR eval fixtures and do not encode treatment.

## Schema (CSV, one row per physical card)

| column | meaning |
|---|---|
| `pack` | pack number in box-opening order (1-24) |
| `pos` | slot in pack order: 1 leader, 2 base, 3-11 commons (7 = guaranteed HS common for Set 7+), 12 foil, 13-15 uncommons (15 = UC3), 16 rare/legendary |
| `number` | printed collector number (bare number as printed; >264 = variant printing for ASH) |
| `name`, `subtitle` | card identity |
| `rarity`, `type` | from card DB |
| `variant` | Normal / Hyperspace / Hyperspace Foil / Showcase / Standard Prestige / Foil Prestige / Serialized Prestige |
| `normalNumber` | collector number of the Normal printing of the same identity |
| `foilLook`, `hyperspaceLook` | visual reads from the photo (0/1) |
| `confidence`, `note` | transcription confidence and evidence notes |

## Boxes

- `ash-box-001.csv` — ASH box, 24 packs, opened in order June 2026, transcribed
  from photos via printed collector numbers (pack 4 is art-matched — blurry photo).
  Findings: `plans/ASH_COLLATION_FINDINGS.md`.

## Analysis

```bash
npx tsx scripts/analyze-real-box.ts data/real-boxes/ash-box-001.csv            # box stats
npx tsx scripts/analyze-real-box.ts data/real-boxes/ash-box-001.csv --compare  # + generator comparison
```
