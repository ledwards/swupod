# Strip collation fixes

Date: 2026-10-02. Measurements are Homeworlds and Ashes sealed, six packs, against the 11 transcribed Ashes of the Empire boxes in `data/real-boxes/`. The generator figures below are 800 fresh Ashes boxes (3,200 kits, 19,200 packs) after the running mean had stopped moving. Homeworlds, on the same sheets, lands on the same settled numbers.

This is a plan. Nothing in it is implemented.

## The method, unchanged

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

### 2. The leader strip prints too many common copies

`LEADER_COMMON_PRINTS_PER_BOOT` is 6 and `LEADER_RARE_PRINTS_PER_BOOT` is 1, for every set. Ashes has 8 common and 8 rare leaders, so a boot is 56 cards and 8 of them are rare: 1 in 7. The opened boxes are 4 to 6 rare leaders in 24 packs, mean about 1 in 5.

The print multiple is the whole rate. One print of each rare leader and N prints of each common leader gives a rare-leader rate of `1 / (N + 1)`. N = 4 is 1 in 5, which is 4.8 rare leaders in a 24-pack box. The opened boxes average about that and range from 4 to 6.

Common-leader repeats are not a reason to keep 6. In a transcribed box a common leader usually appears twice or three times (histogram of name-counts: 1 copy five times, 2 copies 48 times, 3 copies 34 times, 4 copies once). Expected copies of one specific common leader inside 24 pulls are 2.6 on a 6× sheet and 2.4 on a 4× sheet. The rate moves. The repeat count barely does. Check it anyway after the sheet changes; do not pre-adjust a gap to defend it.

## Fixes

Both fixes are Set 7+ only (LAW, ASH, HMW), the block whose sheet was copied from these boxes. Sets 1–6 keep the 6× leader boot and the existing rare/legendary lattice. HMW has no opened boxes; it uses this sheet until it has its own.

### Rare/legendary strip: 24-slot frames

Replace the phase-and-jitter mask in `RareLegendaryBelt._fill` (the `lineStackingCollation` branch only).

Print the strip as a sequence of 24-slot frames. A frame is the line order of one box. Legendary slots inside a frame:

- Four halves, defined only as line positions. Odd low: line 1, 3, 5, 7, 9, 11. Odd high: 13, 15, 17, 19, 21, 23. Even low and even high: the even numbers in those same ranges.
- A 5-slot frame puts one legendary in each half, then a fifth in a random half, so that half has two. The two slots in a doubled half are at least 3 apart on that parity stream (the step size on 27 of the 28 observed steps).
- A 6-slot frame puts two legendaries in each half of one parity and one in each half of the other. This is the only frame that may place a parity step of 1, so box 011 remains a strip the press can print. One transcribed box is not a rate to hit. It is a layout that must not be impossible.

The identity streams stay as they are: equal copies, shuffled rounds, same card spaced about a pool apart, same-rarity seam swap only. The mask decides which slots are legendary. The streams decide which card is in the slot. Equal occurrence is unchanged.

Cut on a frame boundary. A fresh box (`generateSealedBox` clears the belt) rotates the strip so a uniformly chosen frame is at the front of the hopper, then pulls 24. That rotation is the cut. It replaces today's random phase. `generateSealedPod` already keeps the belt across boxes and pulls the next 24; those 24 must be the next frame, so the frame index is packs emitted since the belt was cleared, not an index that resets when the hopper refills. A refill that starts a new segment mid-frame will slide the halves. The segment length has to be a whole number of frames, or the refill has to resume at the running index mod 24.

Equal copies and a whole number of frames constrain the sheet. With 50 rares and 20 legendaries, the smallest all-5-slot sheet is 100 frames (length 2,400): 25 copies of each legendary, 38 of each rare, exactly 5/24 legendary. A sheet that also contains 6-slot frames and still divides evenly starts at 90 frames with 10 of them 6-slot (length 2,160, 23 and 34 copies, legendary rate 21.3%, and 1 frame in 9 is a 6-slot frame). Use that sheet. 1 in 9 is as close to the observed 1 in 11 as equal copies allow, and 21.3% sits on the observed 21.2% box rate. Do not add a coin flip on top of the strip to nudge 1/9 toward 1/11.

A larger boot is the same rule as the common and uncommon boots: the box serves one frame, the rest is the unserved tail, and a random cut means the served frame is not always the same cards. Do not shrink the boot, and do not serve a partial frame, to make the tail smaller.

`stackBoxOrder` stays as it is. After the stack, each half-column having 1 or 2 rare-slot legendaries is a consequence of the frame. The belt never checks it.

### Leader strip: four prints of each common leader

For Set 7+ only, print each common leader 4 times per boot and each rare leader once. The rate 1 in 5 is then the composition of the boot, the same way 1 in 7 is the composition today.

Wire it the way `dedupWindowCap` is already wired: the Set 7+ belt passes 4, and `LEADER_COMMON_PRINTS_PER_BOOT` stays 6 for sets 1–6. `HyperspaceLeaderBelt` uses the same constants. Check whether the Hyperspace leader sheet is a separate physical sheet with its own measured rate before changing it. The opened-box rare-leader count above is the normal leader slot. If the Hyperspace sheet was copied from the normal sheet's 6× without its own count, say so in the change and leave it on 6× until it has a count. Do not silently retune both.

Placement, aspect separation, and the dedup cap of 3 stay. After the boot is shorter (40 cards instead of 56), re-measure two histograms against the CSVs and change placement only if those miss:

- Rare leaders in a 24-pack box: opened boxes are 4, 5, or 6.
- Copies of one common leader in a box: almost all 2 or 3.

If those miss, the fix is still the order of cards on the leader strip, not a rewrite of the pack.

## What this must not disturb

- Duplicate-name mean and the KS check against the 42 pools. Commons and uncommons are untouched, so this should not move. Re-run it anyway.
- Hit count. Re-measure; do not tune foil or UC3 if it drifts by a tenth.
- Rare slot still never a Special.
- Sets 1–6 byte-identical, including leader print counts and the non-frame rare/legendary path.
- No belt reads box order. A test may generate boxes and then look at box positions. The production code may not.

## Tests, written first

On the rare/legendary frame, against fresh ASH boxes, large enough that a 15% empty rate cannot hide (a few hundred boxes):

- Every half-column (box positions 1–6, 7–12, 13–18, 19–24) has 1 or 2 rare-slot legendaries.
- A box has 5 or 6 rare-slot legendaries, and the 6-slot frame occurs. One in 9 is the strip. Do not assert 1 in 11.
- Every rare and every legendary still has one copy count on the segment.
- A pod cut from `generateSealedPod` across a box boundary still has the half-column property, which is the check that the running frame index survives a refill.

On the leader boot, Set 7+ only:

- Each common leader appears 4 times on the boot, each rare leader once.
- Over many boxes the rare-leader count per box sits on 4–6, mean near 4.8.
- Sets 1–6 still assert 6 and 1.

## Done when

Regenerate the settled comparison, same definitions as the table above.

- Empty legendary kits are gone, because the rare slot no longer misses a half-column. Anywhere-empty should follow. If it does not, that is a different slot and gets its own strip reading, not a patch on this one.
- Rare leaders per kit sit near 1.2, the opened boxes, rather than 0.86.
- Hits stay on 7.3. Repeated names stay inside the opened-box interval. If repeated names move, the frame accidentally changed identity spacing and that part is reverted.
