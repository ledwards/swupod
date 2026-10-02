# Competitive pack report

The same table is served at `/comps`. Nothing on the site links to that page.

Date: 2026-10-02. Homeworlds sealed, six packs. The comparison is only what a player would notice in the kit. Different printings of a card count as the same card.

The standard column is a published pack rate when one exists. Duplicate counts and the full L:R:S:U:C mix are not published as one figure, so those are the opened-pack rate. Protect the Pod is generated Homeworlds kits. Limited Lab is their live generator. SWUDraftSim is what their pack code does.

## The kit

Per six-pack kit. Green on the page means the number sits on the standard. Red means it does not. Leaders and bases are one per pack for a real booster and are not in this table.

| | Standard | Protect the Pod | Limited Lab | SWUDraftSim |
|---|---|---|---|---|
| Duplicates | 6.2 | 6.5 | 7.0 | 0 |
| 10+ duplicates | 7% | 7% | 18% | 0% |
| L : R : S : U : C | 1.6 : 5.5 : 0.2 : 17.8 : 58.9 | 1.5 : 5.6 : 0.3 : 17.6 : 59.0 | 0.8 : 5.4 : 0.1 : 18.7 : 59.0 | 1.4 : 5.8 : 0.6 : 19.2 : 57.0 |

Standard prefers a published rate. Duplicate counts and the full rarity mix are not published as a single figure, so those cells are the opened-pack rate. L : R : S : U : C counts deck cards only.

## Where the counts come from

Protect the Pod: `generateSealedBox('ASH')`, 200 boxes. Duplicate names are the same card regardless of printing. The rarity mix is deck cards only.

Limited Lab: duplicate rate from their generator, 2,000 kits. The rarity mix is the expectation of the slot weights in `limitedlab.app/sealed/app.js`.

SWUDraftSim: `useCreatePacks.jsx` and `server/app.js`. Commons and uncommons are redrawn once seen, so the duplicate rate is 0. The rarity mix is the expectation of their slot weights, six packs.
