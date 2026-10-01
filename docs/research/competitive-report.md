# Competitive pack report

Date: 2026-10-01. Homeworlds (Set 9), the Block B sheet calibrated on 11 transcribed Ashes of the Empire boxes.

Two competitors generate packs. Both miss the print sheet, in opposite directions. Limited Lab rolls each slot on its own and then double-prints commons with a coin, so the average looks right and the pools do not. SWUDraftSim draws every card independently and rerolls duplicates away, so a sealed kit is missing the repeats real packs have.

Protect the Pod builds a 24-pack box off belts and hands the player six packs in a row. That is the comparison below.

Older notes, folded in here: [SWUDraftSim source review](./swudraftsim-pack-fidelity-research.md) (2026-06-15), [duplicate-rate analysis](./duplicate-rate-analysis.md) (2026-06-17).

## Where we win

Homeworlds sealed kit, six packs. "Real" is the ASH box record our Homeworlds rules are copied from. Limited Lab numbers are measured (9,600 packs, 2,000 kits, plus their own live 2,000-kit button). SWUDraftSim numbers are from current source (`dbe61ce`, 2026-10-01), not a pack sample.

| | Real ASH boxes | Protect the Pod | Limited Lab | SWUDraftSim |
|---|---|---|---|---|
| What you open | 16-card booster: leader, base, 9 commons, foil, 3 uncommons, rare/legendary | Same 16-card booster, cut from a 24-pack box | Same 16 slots | 14-card pack. Six leaders fetched separately. Player picks any base |
| How a card is chosen | Print sheet | Belt per slot, state carried across the box | Independent roll per slot, plus an echo coin for a second copy | Mongo `$sample` per card. Commons and uncommons reroll on a collision |
| Legendary in the rare slot | ~21% (1 in 5), rationed across the box | 20%. Box mean 4.84, sd 0.57. No empty box in 400 | 12.6% coin (1 in 8). Box sd 1.65. 3.5% of boxes have zero | 20% coin, and a second slot is legendary another 2% of the time |
| Kits with no legendary | A sheet does not empty a box | 15% | 43% | Not sampled. Each pack rolls a fresh 20% coin |
| Back-to-back legendary packs | Spaced | About half the rate of a coin | The coin rate (1.6% vs 1.6% expected) | No spacing. Each pack samples alone |
| Hyperspace common | Every pack, slot 5 | 100% | 66% | None. Commons are Normal only |
| Foil | Always a Hyperspace foil, about 83/10/3/2/2 C/U/R/S/L | 100% Hyperspace foil. Mix 83/10/3/2/2 | Regular foil 98% of the time. Mix 84/12/3/0.6/0.9, and 12% of rare slots are a Special | For Homeworlds the "foil" is a Normal card. Mix 50/30/8/10/2 |
| Third uncommon | Upgrades on a sheet: Hyperspace rare/legendary/special, prestige ~1 per box | 16% of packs leave Uncommon. Prestige in 4.5% of packs | Never. Always three plain uncommons. No prestige | Becomes legendary 2%, rare 8%, otherwise uncommon. No prestige, no Hyperspace |
| Hyperspace leader / base | ~1 in 6 each, and they can share a pack | 17% / 17% | 0 / 0 | Leaders are Normal only. No base is opened |
| Rare leaders | Sheet: each common leader printed 6×, each rare leader 1× (~1 in 7) | 14% | 14%. This part matches | Each leader rolled at 20% rare |
| Duplicate names per kit | ~6.4, about 5% of pools at 10+ | 6.5 ± 1.9. 6% at 10+. Worst kit in 800 was 12 | Mean 7.0 looks fine. sd 3.0. 18% at 10+. Their button's worst kit was 19 | Commons and uncommons cannot repeat anywhere in the kit |
| Normal + normal duplicates | ~1.4 per pool. Most repeats are a foil or Hyperspace twin | 0.68. Light versus the boxes, and the same on every cut | 2.56. Their own page lists 0.3 as the real number | ~0 for commons and uncommons, by the reroll |
| Same-color neighbors in a common lane | ~4% | 0.8% | 7.6%. The page says never | No lanes |

A Homeworlds kit from us has about one more legendary and about one more rare-or-better than a Limited Lab kit (1.5 legendaries and 7.4 bombs, versus 0.8 and 6.3). SWUDraftSim adds a second bomb slot on a coin and then strips the Hyperspace, the foil treatment, the base, and the leader out of the pack.

## The duplicate average is the trap

A naive generator that draws every slot independently produces about 15 duplicate names per sealed pool. Forcing "no duplicate inside one pack" barely moves that, because the repeats are across packs. That result is in the [duplicate-rate analysis](./duplicate-rate-analysis.md): the birthday model says ~15, the belt produces ~4.4 (Sets 1–3), ~4.0 (Sets 4–6), and ~6.7 (LAW/ASH). Opened pools in our database match the belt within about 4% on six of eight sets.

The two competitors miss that number from opposite sides.

**Limited Lab has too many, and too few, in the same product.** Every common schedules a second copy 1, 3, 5, 7, 9, or 11 packs later on the press. Those gaps are all odd. Their box stacking, which matches ours, parks an odd gap 7–12 packs apart, outside a six-pack window. So the duplicate the echo was built to create usually never reaches the player. What players do get is a seam: the refill cycle is about a box long, and stacking sits the first press pack next to the last. A quarter of their cuts straddle it.

| Six-pack cut | Duplicate names | Normal + normal |
|---|---:|---:|
| Limited Lab, inside one column (74% of kits) | 5.60 | 1.00 |
| Limited Lab, across the seam (26%) | 10.65 | 6.67 |
| Protect the Pod, either cut | 6.5 | 0.68 |

Their live "Simulate 2,000 kits" button prints 6.95 duplicate names, which sits in the 5–7 band they call real, next to 2.56 normal-plus-normal against a reference of 0.3, and a worst kit of 19 against a reference of ~13.

**SWUDraftSim has too few.** Sealed generation never clears the seen-id list, and that list covers all six packs. A common or an uncommon that has already appeared is rerolled. Real Block B pools have ~6.5 duplicate names, and almost all of them are a Hyperspace or foil twin of a common. Removing those repeats removes the texture of the pool. Draft resets the list once per round and then builds eight packs in parallel, so repeats can show up between rounds and not inside one.

## What each failure does to a practice kit

Legendary counts per kit:

| Legendaries | Protect the Pod | Limited Lab |
|---|---:|---:|
| 0 | 15% | 45% |
| 1 | 38% | 38% |
| 2 | 32% | 13% |
| 3+ | 15% | 3% |

Limited Lab's rare-slot legendary variance is 1.02× a binomial coin. Ours is 0.08×. A coin whiffs, then clumps. A sheet stays near 4.8 legendaries per box.

One live Limited Lab kit, seed `research1`, opened on the site: zero legendaries, two Specials in the rare slot (Hyperspace Director Krennic, C-3PO), every common-5 a normal common, and five of six foils a plain foil.

## What they got right

Limited Lab's lane split matches the corrected Block B sheet (Vigilance/Aggression/villainy-only, Command/Cunning/heroism-only, neutrals by collector number, 50/50). Print rates across those 50 commons are even. Both primary colors show up in every lane. The leader sheet really is 6× common and 1× rare. The 24-pack, two-column box matches ours, and they include the two prerelease spotlight leaders outside the packs. The page cites our 11 ASH boxes. The generator then rolls pre-LAW rates: legendary 1 in 8, Hyperspace common 2 in 3, Hyperspace rare 1 in 15, hyperfoil 1 in 50, showcase 1 in 288.

SWUDraftSim's rare-slot legendary rate is the right 20% for this era. The rest of the pack is not built around it.

## Evidence

**Limited Lab** (`https://limitedlab.app`, Homeworlds). Pack generation is client-side in `/sealed/app.js`. Seed `research1` was opened in the live UI and matched that code card for card. Their "Simulate 2,000 kits" button was run on the live site. Slot rates below are 400 boxes (9,600 packs). Kit rates are 2,000 random six-pack cuts of those boxes, with the legendary histogram on 4,000 kits.

| Per pack | Limited Lab | Protect the Pod |
|---|---:|---:|
| Rare slot legendary / rare / special | 12.6% / 75.3% / 12.1% | 20.2% / 79.8% / 0 |
| Rare slot is Hyperspace | 6.8% | 0 (Hyperspace rares come from the UC3 sheet) |
| Common 5 Hyperspace | 66.1% | 100% |
| Foil is Hyperspace foil | 2.0% | 100% |
| Foil rarity C / U / R / S / L | 83.6 / 11.5 / 3.4 / 0.6 / 0.9 | 82.9 / 9.8 / 2.6 / 2.4 / 2.3 |
| Hyperspace leader | 0 | 16.8% |
| Hyperspace base | 0 | 16.6% |
| Showcase leader | 0.39% (~1/260) | 0.14% (~1/740) |
| Uncommon slot not an uncommon | 0 | 0.16 per pack |
| Prestige | 0 | 4.5% of packs |
| Legendaries anywhere | 0.14 | 0.25 |
| Within-pack same-treatment duplicate groups | 0.025 | 0.0001 |
| Adjacent commons sharing a color | 7.6% | 0.8% |

Line-order gap between successive copies of a lane common, Limited Lab: 31% at 1, 24% at 3, 15% at 5, 9% at 7, 5% at 9, 2% at 11, 13% longer, and 0% on every even gap. Ours keeps the odd-gap echo and does not reprint the early packs at the end of the box, which is why the seam cut stays at 6.4 duplicate names instead of 10.7.

Legendary indicator, 400 boxes: Limited Lab variance / binomial = 1.02, lag-1 autocorrelation ≈ 0. Ours: 0.08 and −0.14.

Their button, live, 2,000 kits: duplicate names 6.95, normal+normal 2.56, worst kit 19, rare-slot legendaries 0.77, rare leaders 0.86, kits with a repeated leader 70%.

**Protect the Pod.** `generateSealedBox('HMW')`, 400 boxes, one random six-pack cut each, plus 800 cuts for the legendary histogram. Homeworlds rules are the ASH rules: guaranteed Hyperspace common, foil slot always Hyperspace foil, legendary ratio 4:1, UC3 outcome sheet, prestige 1/22, showcase 1/576, leader and base Hyperspace 1/6.

**SWUDraftSim.** `useCreatePacks.jsx` and `server/app.js` at `dbe61cead5e1105c11afc8290995d211d7e0af21`. Sealed calls `generateCardPack` six times and never `resetSeenIds`. Draft calls `resetSeenIds` once per round. Foil variant for ASH and HMW is `Normal`. Leader sealed pool: 50% six unique leaders, 45% one duplicated leader, 5% a triple or two pairs. Each leader's rarity is an independent 20% rare roll.

**Our own duplicate study** (2,000 simulated pods per set, plus opened pools in the database): naive independent draws predict ~15 duplicate names; within-pack rerolls still leave ~15; the belt produces ~4.0–4.4 before Block B and ~6.7 for LAW/ASH, and normal+normal repeats are ~0.02 per LAW pool in that study. The 0.68 figure in the grid is the later Homeworlds measurement on random box cuts, after the six-box pair-gap refit. It is the number we are light on versus the transcribed boxes (~1.4), and it is still the one that does not depend on which seat you sat in.
