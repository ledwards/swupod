# Strip collation fixes

Date: 2026-10-02. Measurements are Homeworlds and Ashes sealed, six packs, against the 11 transcribed Ashes of the Empire boxes in `data/real-boxes/`. The generator figures below are 800 fresh Ashes boxes (3,200 kits, 19,200 packs) after the running mean had stopped moving. Homeworlds, on the same sheets, lands on the same settled numbers.

Shipped 2026-10-02. The spacing change is in `RareLegendaryBelt` on the line-stacking path. Rare leaders were measured and left alone.

## The method, unchanged

Standing rule, already in `CLAUDE.md` and `.claude/rules/belt-system.md`. This plan does not add it.

Pack rates are properties of a printed strip, a cut, a hopper, and a pull. They are not targets we hit afterward.

- Print a strip. Every card of a rarity has the same copy count on that strip. Which copy sits where is placement on the strip, not a card left out of the boot.
- Cut the strip on its natural boundary.
- Load the cut into the hopper.
- Pull one card per slot, in line order. `stackBoxOrder` then moves whole packs into the two columns of a 24-pack box. It does not rewrite a pack.
- A belt does not look at another belt, and it does not look at box order or at the six packs a player will be dealt. Line-order rules only. The three orders are in `.claude/rules/belt-system.md`.

Forbidden, because each one invents a probability the strip did not print:

- After the six packs exist, notice that a kit has no legendary and swap one in.
- Reroll a slot until a kit-level quota is met.
- Teach `RareLegendaryBelt` or `LeaderBelt` what `stackBoxOrder` will do with the pack.
- Change a weight, a coin flip, or a post-pass so a reported mean moves while the strip stays the same.

A legal change is a different strip, or a different place to cut it. The kit numbers below are how we check the result. They are not knobs.

## What was measured

A kit is six consecutive packs in box order: positions 1–6, 7–12, 13–18, 19–24. That is also how `generateSealedPod` cuts a Set 7+ box. Incomplete windows in the partial boxes were skipped. 42 kits, 252 packs, 11 boxes.

| | Definition | Opened boxes | Generator, settled |
|---|---|---|---|
| Repeated names | Deck cards only (no leader, no base). Identity is `name\|subtitle`, so a Hyperspace copy counts as the same card. Count of identities that appear at least twice. | 6.19. 95% interval 5.8–6.7. sd 2.1 | 6.66. Flat from about 1,200 packs through 19,200. sd 1.9 |
| Legendaries | Any card with rarity Legendary, any slot | 1.62. Interval 1.48–1.76. None of 42 kits had zero. Histogram 1, 2, 3 only | 1.46. Flat from about 240 packs. 15% of kits have zero. Histogram runs 0 through 5 |
| Hits | Rare, Legendary, or Special, deck cards only. Leaders are not in this count. The 7.3 figure is this one; counting rare leaders as well raises the opened-box mean to 8.57 | 7.33. Interval 7.2–7.5. sd 0.8 | 7.37. Flat from about 1,200 packs |
| Rare slot | Ashes CSV position 16. Generator: the rare/legendary pull, which is the last card of a Set 7+ pack | Rare or Legendary in 252/252 packs. Legendaries in that slot: 1.29 per kit, and every kit has 1 or 2. Ten boxes have 5 in the box, one has 6 | Rare or Legendary in 19,200/19,200 packs. 1.20 per kit. 20% of kits have 0, about 5% have 3. Box mean 4.8, and a box total of 0 does not occur |
| Rare leaders | Leader slot, rarity Rare | 1.21 per kit, about 1 pack in 5. Full boxes hold 4, 5, or 6. A given rare leader appears once in a box, occasionally twice | 0.86 per kit, 1 pack in 7. This is 8 common leaders × 6 prints plus 8 rare leaders × 1 print |

Sample size, so a small gap is not treated as a miss:

- The generator's own average has already converged at the pack counts in the table. More simulated packs will not move 6.66, 1.46, or 7.37.
- Pinning an opened-box mean to ±0.1, using the opened-box sd, takes about 10,000 packs for repeated names, about 1,100 for legendaries, and about 1,400 for hits. We have 252.
- Repeated names: 6.66 is still inside the opened-box interval. About 900 more opened packs would be needed before a true gap of this size should show. It has not.
- The empty-legendary kit does not have that excuse. If 15% of kits were empty, a stretch of 42 kits with none empty would happen about 1 time in 1,000.

## What already agrees

Leave these alone.

- Hits, 7.33 against 7.37. Same number. Foil weights, the UC3 upgrade, and the special rate are not the problem.
- The rare slot is a rare or a legendary in every pack on both sides. Specials are extra cards. Do not put a Special in the rare slot, and do not add a rule to keep them out; the strip already does that.
- Repeated names. The shape check in `printerDistribution.test.ts` is the one that matters, and it still passes. The mean sits high inside a wide interval. The belt rules forbid tightening a dedup gap to chase a duplicate mean, and this gap is not yet a difference.

## Divergences

### 1. Rare-slot legendaries are spaced on the wrong lattice

`RareLegendaryBelt`, on the line-stacking path, lays legendaries across the whole segment at `interval = size / legendaryCount` with a random phase and a jitter of `floor(interval / 2)`. For the 4:1 sheet that interval is 5, so the gap between legendaries on the line runs from 1 to 9. A fresh box then takes 24 pulls from a random phase of that lattice. The box total lands near 4.8, which is the advertised 1-in-5, and no box is empty. That part is the strip doing what it was told.

The opened boxes are a different strip. Invert `stackBoxOrder` and the rare-slot legendaries sit on the line like this. Line index within the box, odds and evens separated:

- The odd packs and the even packs each split into a low half and a high half of six (line 1,3,…,11 against 13,15,…,23, and the same for evens).
- Across 9 complete boxes, every one of those four halves holds 1 or 2 legendaries. None holds 0 or 3.
- The step between consecutive legendaries on a parity stream is 3, 4, 5, or 6, except one step of 1. That step is box 011, the only 6-legendary box, where even line packs 2 and 4 are both legendary.

`stackBoxOrder` sends those four line halves to box positions 1–6, 7–12, 13–18, and 19–24. So a half-column having a legendary is the line pattern, read after a stack that does not know about legendaries. The current lattice does not have that pattern. A gap of 9 on the combined line, cut at a random phase, leaves a parity half empty. About 20% of generated kits then have no rare-slot legendary. Foil and upgrade legendaries only pull the anywhere-empty rate from 20% down to 15%.

This is not the duplicate-rate rule. That rule says not to tighten a gap because reality is clumpier than the model. Here the opened boxes are the tighter pattern, and the model assigns probability zero to a layout every transcribed box has.

### 2. Rare leaders — measured, not in this change

`LEADER_COMMON_PRINTS_PER_BOOT` is 6 and `LEADER_RARE_PRINTS_PER_BOOT` is 1. Ashes has 8 of each, so a boot is 1 rare leader in 7 packs. The opened boxes are about 1 in 5. FFG has not published that split. [Boosting Ahead of Release](https://starwarsunlimited.com/articles/boosting-ahead-of-release) says every pack has one leader, and the odds it prints are for legendaries, Hyperspace, and Showcase. Leave the leader strip alone.

## Fixes

One change. Set 7+ line-stacking sets only (LAW, ASH, HMW). The rate stays the advertised one.

### Rare/legendary strip: even steps on each parity

Gospel is [Updates and Rotations](https://starwarsunlimited.com/articles/updates-and-rotations): from Jump to Lightspeed on, a legendary appears around 1 in every 5 packs. That is the rare slot ("you'll still get … 1 Rare or Legendary card per pack"). The opened boxes sit at 21%, which is the same rate. They are the check, not a new target. Do not move the sheet from 4:1 to 5-per-24 or to a 21.3% mix to chase the 11 boxes.

What changes is the spacing. The gap on the combined line used to run from 1 to 9, so a six-pack half-column could miss. On the `lineStackingCollation` path only, odd line positions and even line positions are now separate streams. The step on each stream is 3, 4, 5, or 6, and those steps average exactly 5, so the rate stays 1 legendary in 5 rare slots. A locked step of 5 was rejected: opened boxes wobble inside that same band, and a reader should not be able to point at one legendary and know the next pack number. A step of 7 or more is what empties a half-column; a step of 1 or 2 can put three in it. With steps inside 3–6, six consecutive slots on a stream hold one or two legendaries. After `stackBoxOrder`, each half-column holds one or two. The belt still does not know about the box. The stack is what turns those line halves into a player's six packs. The phase is the cut: random on a new belt, then carried across segment refills, because a segment is not a multiple of 24 packs and the pod path keeps pulling.

The identity streams stay as they are: equal copies, shuffled rounds, same card spaced about a pool apart. The mask decides which slots are legendary. The streams decide which card is in the slot.

`stackBoxOrder`, leaders, foils, commons, and uncommons stay as they are.

## What this must not disturb

- Duplicate-name mean and the KS check against the 42 pools. Commons and uncommons are untouched, so this should not move. Re-run it anyway.
- Hit count. Re-measure; do not tune foil or UC3 if it drifts by a tenth.
- Rare slot still never a Special.
- Sets 1–6 byte-identical, including leader print counts and the non-frame rare/legendary path.
- No belt reads box order. A test may generate boxes and then look at box positions. The production code may not.

## Tests

Existing checks should still pass. The 4:1 ratio test stays. The box-total test already wants a mean between 4 and 6 and a spread tighter than a coin flip; even steps make the spread tighter and leave the mean at 4.8. Equal copy counts are unchanged. Sets 1–6 do not use this path.

The half-column check is in `RareLegendaryBelt.test.ts`: continuous pulls and fresh belts, every half-column has 1 or 2 rare-slot legendaries, parity steps stay in 3–6, and the rare-slot rate is still 1 in 5. A 400-box Ashes run after the change put repeated names at 6.67, the same settled mean as before. Commons and uncommons were untouched.

## Done when

Shipped. Checked on 400 fresh Ashes boxes (1,600 kits) plus continuous belt pulls that cross segment seams, and on the LAW and HMW sheets.

- Rare-slot legendaries are still 1 in 5 packs (belt rate 0.200 on LAW, ASH, and HMW).
- Every six-pack half-column held 1 or 2 rare-slot legendaries. Anywhere-legendary kits with zero: 0 of 1,600. Mean legendaries per kit 1.47.
- Repeated names 6.67, the same settled mean as before the mask change. Hits stayed at 7.4 on an 80-box check.
- Leaders are unchanged.

The check lives in `RareLegendaryBelt.test.ts` (`ASH half-columns hold 1 or 2 rare-slot legendaries`).
