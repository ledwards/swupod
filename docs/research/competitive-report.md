# Competitive pack report

The same table is served at `/comps`. Nothing on the site links to that page.

Date: 2026-10-01. Homeworlds sealed, six packs. The comparison is only what a player would notice in the kit. Different printings of a card count as the same card.

Real numbers are 42 six-pack cuts from the 11 transcribed Ashes of the Empire boxes (the set these rules are copied from). Protect the Pod is generated Homeworlds kits. Limited Lab is their live generator. SWUDraftSim was not sampled; those cells are what their current pack code does.

## The kit

| | Real boxes | Protect the Pod | Limited Lab | SWUDraftSim |
|---|---|---|---|---|
| Cards you opened more than one of | 6.2 per kit. 3 of 42 kits had 10 or more | 6.5 per kit. 6% had 10 or more | 7 per kit. 18% had 10 or more. Their own 2,000-kit run peaked at 19 | A common or uncommon never repeats |
| Legendaries | 1.6 per kit. None of the 42 kits had zero | 1.5 per kit. Every kit has one | 0.8 per kit. 43% of kits have zero | About 1.4 per kit. About 1 in 5 kits have zero |
| Rares, legendaries, and specials | 7.3 per kit | 7.4 per kit | 6.3 per kit | About 7.8 per kit |
| The rare in the pack | Always a rare or a legendary. Specials were extra cards, 0.2 per kit, and never the rare | Same. Specials are extra cards, about 0.3 per kit | About one pack in eight, that card is a Special instead of a rare | Always a rare or a legendary. Specials only show up in the foil slot, about 0.6 per kit |
| Leaders | One in each pack | One in each pack | One in each pack | Six dealt separately. About half the kits have a repeated leader. 1 in 20 kits has only four different leaders |
| Bases | One in each pack | One in each pack | One in each pack | None. You pick any base |

On the size of the kit Protect the Pod matches the opened boxes: about six duplicates, about one and a half legendaries, about seven cards you would call a hit. Every kit has a legendary, and so did every opened kit. Limited Lab is short a legendary and short a hit, and a much larger share of their kits are either empty of legendaries or piled with duplicates. SWUDraftSim does not deal a pack a player would open: no base, leaders on the side, and the duplicate commons a real kit has cannot occur.

## Where the counts come from

Protect the Pod: `generateSealedBox('HMW')`, 400 boxes for the kit means. Duplicate names are the same card regardless of printing. A hit is a rare, legendary, or special. The legendary cell was rechecked on 400 Ashes boxes after the strip spacing change: 1.47 per kit, and none of 1,600 kits had zero.

Limited Lab: 9,600 packs and 2,000 kits from the generator at `https://limitedlab.app/sealed/app.js`, checked against a live kit (seed `research1`) and against their own "Simulate 2,000 kits" button. That button reported 6.95 duplicate names and a worst kit of 19.

SWUDraftSim: `useCreatePacks.jsx` and `server/app.js` at `dbe61ce`. Each pack is 14 cards. The rare slot is legendary 20% of the time. A second slot is legendary 2% or rare 8%. The foil slot is legendary 2%, rare 8%, or special 10%. Sealed never clears the seen-card list, so a common or uncommon that has already appeared is redrawn. Leaders are a separate draw: 50% of kits get six different leaders, 45% get one repeat, 5% get only four. The legendary and hit figures are those odds added up, not kits we generated.

The plain-pair average (0.7 for us, 1.4 for the boxes) is not in this table. More than half of real kits have zero plain pairs, and the 1.4 is a handful of clumpy kits. The duplicate-name row above is the number a player can see.
