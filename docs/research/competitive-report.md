# Competitive pack report

The same figures are served at `/comps`. Nothing on the site links to that page.

Measured 2026-10-10 with `npx tsx scripts/comps-measure.ts`, which writes `src/data/compsScorecard.json`; the page reads that file. `npm run qa` re-measures Protect the Pod from the generator on every run (`src/qa/compsScorecard.test.ts`) and fails if it stops grading 100, so the page's claim is a test, not a typed number.

## The grade

One number per site, four equal parts (`src/services/compsScore.ts`), measured per six-pack kit against the real ASH boxes and graded only on what changes play:

- **Repeats** — KS distance of the repeats-per-kit distribution, plus repeated commons, repeated uncommons, and repeated rares+.
- **Rarity mix** — legendaries, rares, specials, uncommons, commons.
- **Leaders & bases** — leaders and bases per kit, rare leaders, leader repeats, base repeats.
- **Ways to play** — draft, sealed, solo, multiplayer, real opponent, sitewide stats, personal stats. Play vs AI is shown, not graded.

**Printings are not graded.** That covers hyperspace, foil, prestige, hyperspace leaders and bases, and same-printing repeats. A site with no hyperspace art plays the same. What a printing slot does to play is graded through the measures above: a slot that rerolls a random card instead of reading a sheet adds repeats and skews the rarity mix. The printing figures still appear on the page as an ungraded section.

Each graded metric is a z-score against the real mean, using both samples' standard errors. It gets full marks to 3σ, which is at or above the Bonferroni line (2.9σ) for 14 tests at a family-wise α of 0.05, and 0 from 6σ. KS gets full marks at its α=0.05 critical value and 0 at 2.5× that value. A metric a site does not model or publish scores 0. Every graded metric is treatment-blind, so all 42 real kits count.

| Site | Grade | Repeats | Rarity | Leaders & bases | Play | Worst misses |
|---|---|---|---|---|---|---|
| Protect the Pod | 100% | 100 | 100 | 100 | 100 | — |
| Limited Lab | 74% | 100 | 60 | 80 | 57 | legendaries 0.8 vs 1.46, leader repeats about 2× real, rare leaders |
| ManyTCG | 55% | 21 | 49 | 63 | 86 | every slot independent: 13.8 duplicates; leaders drawn evenly, 3.3 rare leaders vs 1.2 |
| SWU-DR4FT | 49% | 25 | 60 | 40 | 71 | no base in packs (separate pool); 1 in 7 rare leaders; random draws |
| Felt Table | 47% | 25 | 52 | 67 | 43 | random draws per slot; three commons listed twice; legendaries 1.27 |
| SWUDraftSim | 44% | 25 | 48 | 60 | 43 | no bases; repeats in the wrong rarities |
| CCS | 39% | 25 | 40 | 62 | 29 | independent draws, 14.3 duplicates; legendaries 0.81 |
| SWU Sealed | 37% | 25 | 46 | 34 | 43 | no bases (`addBase()` commented out); 14.1 duplicates |

**Rare leaders — fixed 2026-10-10.** All 11 real boxes held 4-6 rare leaders: 52 in the 252 packs of complete kits, 1 in 4.8. Normal leaders run 41 rare of 219 and hyperspace leaders 11 of 40, both close to a 4:1 strip. We ran 1 in 9 for two reasons. The sheet printed 6:1. It also parked its rare holes at the end of every cell, and a fresh box's 24 pulls stop short of the last cell's rares; that cost LAW too, which ran 1 in 9 against its own 1 in 7. ASH now prints 4:1 (`beltRatios.leaderPrints`), and the rare holes land at random. Measured after the fix: 1 in 5.

Every generated column draws from the same ASH pool (100 C, 60 U, 50 R, 20 L, 8 S, 18 leaders, 8 bases). Each port in `src/qa/comps/` names the file it was read from and is checked against the rates in that file. Fetched site JavaScript is never executed.

Felt Table's ASH pack function lives in `forcetable.net/swu` `static/js/2.b6e781ae.chunk.js`, a lazy chunk found through the inline webpack runtime. Sealed opens six packs, each from a fresh flag. Their draft carries the "legendary already given" flag across all 24 packs, so after the first legendary a draft gets no more. That doesn't affect the sealed grade.

SWU-DR4FT builds packs on its server. The source is public at `github.com/statukuo/SWU-dr4ft` (`backend/boosterGenerator.js`, ASH booster data in `scripts/generateBoosterData.js`).

**Legendaries target is computed, not sampled.** Per pack: R/L slot 1/5, plus hyperspace foil sheet 40/1810, plus UC3 hyperspace legendary 17/2160, plus prestige 98/2160 × 13/47 legendary prestige cards. That's 0.2425 per pack, or 1.455 per six packs (`src/qa/comps/expectedLegendaries.ts`). The opened boxes show 1.66, which is 72 legendaries against 63 expected, 1.1σ; they still set the tolerance. A fresh rare belt ran 2.7% legendary-heavy because the cut's starting phase was drawn from 0-5 when the steps average 5. It is now drawn from 0-4, and the generator lands on 1.455.

**Correction to the 2026-10-02 run:** SWUDraftSim is not 0 repeats. Its rare slot, rare-uncommon slot and foil are not redrawn when seen, so a kit averages 3.6 repeats.

## The 2026-10-02 run

## The kit

Per six-pack kit. Leaders and bases are one per pack for a real booster and are not in the rarity mix. Feature rows come first on the page.

| | Standard | Protect the Pod | Limited Lab | SWUDraftSim | Felt Table | SWU Sealed | SWU-DR4FT | CCS | ManyTCG |
|---|---|---|---|---|---|---|---|---|---|
| Draft | Yes | Yes | No | Yes | Yes | No | Yes | No | Yes |
| Sealed | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Solo | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Multiplayer | Yes | Yes | No | No | No | No | Yes | No | Yes |
| Play vs AI | Yes | No | No | No | Yes | No | No | No | No |
| Real opponent | Yes | Yes | No | No | No | No | Yes | No | Yes |
| Sitewide stats | Yes | Yes | Yes | No | No | Yes | No | No | No |
| Personal stats | Yes | Yes | Yes | No | No | No | No | No | Yes |
| Duplicates | 6.2 | 6.5 | 7.0 | 0 | 13.5 | 13.2 | — | 14.3 | 13.9 |
| 10+ duplicates | 7% | 7% | 18% | 0% | 96% | 94% | — | 98% | 97% |
| L : R : S : U : C | 1.6 : 5.5 : 0.2 : 17.8 : 58.9 | 1.5 : 5.6 : 0.3 : 17.6 : 59.0 | 0.8 : 5.4 : 0.1 : 18.7 : 59.0 | 1.4 : 5.8 : 0.6 : 19.2 : 57.0 | 1.3 : 5.0 : 0.2 : 19.4 : 58.2 | 0.9 : 5.9 : 0.1 : 21.2 : 55.5 | — | 0.8 : 5.7 : 0.0 : 19.4 : 58.2 | 1.7 : 6.1 : 0.2 : 19.5 : 56.5 |

L : R : S : U : C counts deck cards only. Duplicate counts are names that appear more than once.

Sitewide stats are numbers gathered across players. Personal stats are your own record. Limited Lab has all-player rankings and a view of only your rankings. SWU Sealed shows a community rating on each card, and stores your own stars without a personal record page. ManyTCG Game Stats is your wins and losses. Felt Table keeps a win count for the current session only.

## Where the counts come from

Protect the Pod: `generateSealedBox('ASH')`, 200 boxes.

Limited Lab: duplicate rate from their generator, 2,000 kits. The rarity mix is the expectation of the slot weights in `limitedlab.app/sealed/app.js`. Sealed practice only.

SWUDraftSim: `useCreatePacks.jsx` and `server/app.js`. Commons and uncommons are redrawn once seen, so the duplicate rate is 0. The rarity mix is the expectation of their slot weights, six packs. Draft and sealed, no shared room.

Felt Table: Star Wars Unlimited on Felt Table is Force Table (`forcetable.net/swu`). Draft and sealed are games against the AI. A person cannot sit in. The Homeworlds sealed pack is the `HMW` function in their client. Each sealed pack starts fresh. Duplicates and the rarity mix are 20,000 kits from that function, using the Homeworlds deck pool (100 commons, 60 uncommons, 50 rares, 20 legendaries, 8 specials). Commons named Devotion and Pounce are listed twice in that function's common draw, the same way the client does it.

SWU Sealed (`swusealed.com`, `MPaap/SWU-Sealed-Sim`): the published pack file is `LAWPackStrategy.php`. The rarity mix is the expectation of those slot weights. Duplicates are a 20,000-kit draw from Homeworlds deck-pool sizes (100 commons, 60 uncommons, 50 rares, 20 legendaries, 8 specials), without replacement inside a slot and with a fresh draw each pack. The site lists Homeworlds; the published strategy file is Legends of the Force. Sealed practice only.

SWU-DR4FT (`swu-dr4ft.up.railway.app`): draft, sealed, bots, and a shared room are in the client. Booster odds are not in the client, so no pack number is shown.

CCS (`swu-ccs.vercel.app`, `doctor-kat/swu-ccs` `generateBooster.ts`): independent draws. Rare slot is 7 rare to 1 legendary. Foil weights are 72 common, 24 uncommon, 7 rare, 1 legendary. No specials. The rarity mix is that expectation over six packs. Duplicates use the same Homeworlds deck-pool sizes, 20,000 kits. Sealed opener only. The default expansion in that file is Twilight of the Republic.

ManyTCG (`manytcg.com/draft`): booster draft and sealed from a set, with bots and a shared draft lobby. Sealed there is solo. The site does not play a Star Wars Unlimited game. The pack function is in their draft client: 9 commons, 3 uncommons, a rare slot that is legendary 1 time in 5, and one card drawn from the whole deck pool, each draw independent. Their set list stops at Secrets of Power and the set download requires a login, so the 20,000 kits use that function on the same Homeworlds deck pool as the other columns.

`draftswu.com` is a parked domain and is not in the table. Karabast and Petranaki play games; they do not build the pack.
