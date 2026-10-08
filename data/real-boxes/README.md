# Real Box Collation Data

**Opening a new box? Follow `COLLECTION_GUIDE.md` in this directory.**

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
  Photo order = box columns (left top-down, then right); factory line order is the
  interleave 12,24,11,23,…,1,13. Findings: `plans/ASH_COLLATION_FINDINGS.md`.
- `ash-pool-002.csv` — 6 ASH packs from a PRERELEASE box (July 2026). Collation
  of prerelease boxes is unknown and we never generate them: use for intra-pack
  and aggregate stats only, NOT pack-sequence analysis. pack01 was photographed
  in a nonstandard layout (leader at pos3) — derive its structure by card type.

## Analysis

```bash
npx tsx scripts/analyze-real-box.ts data/real-boxes/ash-box-001.csv            # box stats
npx tsx scripts/analyze-real-box.ts data/real-boxes/ash-box-001.csv --compare  # + generator comparison
```

## Carbonite corpus (`ash-carbonite-*.csv`)

Real carbonite pulls, used to calibrate the parts of the generator we've been
**guessing** at (flex/top rarity weights, prestige tier split, showcase rate,
leader-in-prestige) — everything beyond the fixed slot skeleton. Extends the schema
with two columns: `slotRole` (`leader`/`prestige`/`hs`/`hsf`) and `pullOrder`
(`true` only if the row order is the EXACT order cards came out of the pack).

Treatment is decoded from the printed collector number (ASH ranges):
`Normal ≤264 · Hyperspace 265–528 · Hyperspace Foil 529–766 · Showcase 767–784 · Prestige 785–925`.

**Photo protocol:** one pack per photo, all 16 cards, bottom-right collector number
in frame and glare-free. To test intra-block rarity ordering, **lay cards in exact
pull order** (top of stack → bottom) and set `pullOrder=true`; otherwise any layout
works for rate calibration (the number decodes treatment; name→rarity is a DB lookup).

- `ash-carbonite-box-00{1,2,3,4}.csv` — a full ASH carbonite CASE: 4 boxes × 12 packs
  (photos IMG_3978–4033, July 2026), laid in **pull order** (`pullOrder=true`). Every
  card decoded by collector number + `cards.json` lookup (number is authoritative —
  names alone are ambiguous; many leaders share a name+number with a unit). All 768
  numbers validated in-band. Uniform structure `pos1 leader · pos2–9 HS · pos10
  prestige · pos11–16 HSF`; HS run ascends by rarity (R/L top at pos9), HSF descends.
  n=48 rates + change theses (prestige tiers 67/31/2, HS-top R/L-only, etc.):
  `plans/CARBONITE_COLLATION_FINDINGS.md`.

```bash
npx tsx scripts/analyze-carbonite-corpus.ts        # observed vs carboniteConstants weights
```
