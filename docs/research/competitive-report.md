# Competitive pack report

The same table is served at `/comps`. Nothing on the site links to that page.

Date: 2026-10-02. Homeworlds sealed, six packs. The comparison is only what a player would notice in the kit. Different printings of a card count as the same card.

The public page opens on Summary. A green cell is Close or Yes. A red cell is Off or No. Counts is the toggle that reveals the figures below. A dash means that site does not publish pack contents.

The standard column is a published pack rate when one exists. Duplicate counts and the full L:R:S:U:C mix are not published as one figure, so those are the opened-pack rate.

## The kit

Per six-pack kit. Leaders and bases are one per pack for a real booster and are not in the rarity mix. Feature rows come first on the page.

| | Standard | Protect the Pod | Limited Lab | SWUDraftSim | Felt Table | SWU Sealed | SWU-DR4FT | CCS |
|---|---|---|---|---|---|---|---|---|
| Draft | Yes | Yes | No | Yes | Yes | No | Yes | No |
| Sealed | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Solo | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Multiplayer | Yes | Yes | No | No | No | No | Yes | No |
| Duplicates | 6.2 | 6.5 | 7.0 | 0 | — | 13.2 | — | 14.3 |
| 10+ duplicates | 7% | 7% | 18% | 0% | — | 94% | — | 98% |
| L : R : S : U : C | 1.6 : 5.5 : 0.2 : 17.8 : 58.9 | 1.5 : 5.6 : 0.3 : 17.6 : 59.0 | 0.8 : 5.4 : 0.1 : 18.7 : 59.0 | 1.4 : 5.8 : 0.6 : 19.2 : 57.0 | — | 0.9 : 5.9 : 0.1 : 21.2 : 55.5 | — | 0.8 : 5.7 : 0.0 : 19.4 : 58.2 |

L : R : S : U : C counts deck cards only. Duplicate counts are names that appear more than once.

## Where the counts come from

Protect the Pod: `generateSealedBox('ASH')`, 200 boxes.

Limited Lab: duplicate rate from their generator, 2,000 kits. The rarity mix is the expectation of the slot weights in `limitedlab.app/sealed/app.js`. Sealed practice only.

SWUDraftSim: `useCreatePacks.jsx` and `server/app.js`. Commons and uncommons are redrawn once seen, so the duplicate rate is 0. The rarity mix is the expectation of their slot weights, six packs. Draft and sealed, no shared room.

Felt Table: Star Wars Unlimited on Felt Table is Force Table (`forcetable.net/swu`). Draft and sealed are solo games against the AI. Pack contents are not published.

SWU Sealed (`swusealed.com`, `MPaap/SWU-Sealed-Sim`): the published pack file is `LAWPackStrategy.php`. The rarity mix is the expectation of those slot weights. Duplicates are a 20,000-kit draw from Homeworlds deck-pool sizes (100 commons, 60 uncommons, 50 rares, 20 legendaries, 8 specials), without replacement inside a slot and with a fresh draw each pack. The site lists Homeworlds; the published strategy file is Legends of the Force. Sealed practice only.

SWU-DR4FT (`swu-dr4ft.up.railway.app`): draft, sealed, bots, and a shared room are in the client. Booster odds are not in the client, so no pack number is shown.

CCS (`swu-ccs.vercel.app`, `doctor-kat/swu-ccs` `generateBooster.ts`): independent draws. Rare slot is 7 rare to 1 legendary. Foil weights are 72 common, 24 uncommon, 7 rare, 1 legendary. No specials. The rarity mix is that expectation over six packs. Duplicates use the same Homeworlds deck-pool sizes, 20,000 kits. Sealed opener only. The default expansion in that file is Twilight of the Republic.

`draftswu.com` is a parked domain and is not in the table. ManyTCG drafts several games from a list and is not in the table. Karabast and Petranaki play games; they do not build the pack.
