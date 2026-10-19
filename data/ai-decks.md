# Leebo's saved decks

`data/ai-decks.json`: 20 decks per format, one strong list of each of the format's 20 most-played archetypes. Chosen 2026-10-18. Every deck passes the same legality (Premier, Eternal) or engine-support (Draft, Sealed) checks as a player's deck, and the engine creates a game with each.

## How they were chosen

- **Premier.** Cal's HMW meta catalogue (Baize `crates/games/swu/data/meta-decks/premier.json`): the 20 most-played Premier archetypes on Karabast from 2026-10-09 to 10-17 (132k games), each a top-8 melee.gg list from an HMW event or the highest-rated author's SWUDB list. The attn-meta-v12 AI trained on all 20.
- **Eternal.** Ranked by Karabast games in the 30 days to 2026-10-18 (Wayfinder online meta, 3,803 games). Each list is that leader and base's best-placed tournament list in Wayfinder's melee data (Eternal allows every set, so a winning Premier list for the archetype is Eternal-legal), else the best result among Wayfinder-tracked Karabast games, else SWUDB's most-liked list. Anakin (TS26) DV (#7) is skipped: PTP cannot validate TS26 cards yet, so #21 Mando (ASH) Colossus takes its place.
- **Draft, Sealed.** HMW only. Ranked by PTP built decks since 2026-10-01 (392 Draft, 1,737 Sealed; bots excluded), archetype = leader + base colour. Each list is the archetype's best winning record (casual matches and pool results); with no winning record, the most typical 30-card build (the deck whose cards appear most across that archetype's decks).

## Daily refresh

This file and `data/ai-decks.json` are the shipped starting set. Once a day the server rebuilds the catalogue into `ptp_ai_deck_catalog` (`src/services/play/native/aiDeckRefresh.ts`, run from `server.ts`), and Leebo reads that row:

- **Premier, Eternal**: Wayfinder's `GET /api/ai/saved-decks?format=…` (Karabast play rank over 30 days; each archetype's best-placed tournament list, Eternal including its Premier twin's, else a Karabast winning record).
- **Draft, Sealed**: every current set, from PTP's built decks of the last 60 days, by the rule above.

Every deck passes the same legality or engine-support check as a player's deck; printings and name-only cards map to the engine's card IDs. A format that comes back short (Wayfinder down, a card the engine can't play yet) keeps its previous decks in the empty slots. The refresh report (fresh, kept, skipped per slot) is saved with the row and logged as `[AiDecks]`.

The tables below are the shipped set of 2026-10-18.

## Premier

| # | Deck | Source |
|---|---|---|
| 1 | Krennic (LAW) Blue 30 | HMW Premier top 20 (Karabast play) — XS_VVRATHH |
| 2 | Hemlock Yellow 30 | HMW Premier top 20 (Karabast play) — IB_Smoore |
| 3 | Wicket Green 30 | HMW Premier top 20 (Karabast play) — Redrufus10 |
| 4 | Ahsoka (ASH) Yellow 30 | HMW Premier top 20 (Karabast play) — daftside |
| 5 | Tarfful Blue 30 | HMW Premier top 20 (Karabast play) — daftside |
| 6 | Lando (LAW) Blue 30 | HMW Premier top 20 (Karabast play) — MjHawzy |
| 7 | Obi-Wan (LOF) Force Yellow | HMW Premier top 20 (Karabast play) — MushiShi |
| 8 | Ahsoka (ASH) Splash Yellow | HMW Premier top 20 (Karabast play) — SEBH_DrPaulrD |
| 9 | Hemlock Red 30 | HMW Premier top 20 (Karabast play) — cabinho96 |
| 10 | Maul (HMW) Blue 30 | HMW Premier top 20 (Karabast play) — titoo2508 |
| 11 | Vader (JTL) Yellow 30 | HMW Premier top 20 (Karabast play) — SimonHK |
| 12 | Maul (LOF) Force Blue | HMW Premier top 20 (Karabast play) — Davidson |
| 13 | Bossk (HMW) Red 30 | HMW Premier top 20 (Karabast play) — Giuseppe Avolio |
| 14 | Poggle Blue 30 | HMW Premier top 20 (Karabast play) — Davidson |
| 15 | Qui-Gon Force Green | HMW Premier top 20 (Karabast play) — Nitragin |
| 16 | Ahsoka (ASH) Blue 30 | HMW Premier top 20 (Karabast play) — PORG_Clansuj |
| 17 | Luke (JTL) DV | HMW Premier top 20 (Karabast play) — Fer_Restore |
| 18 | Warrior Red 30 | HMW Premier top 20 (Karabast play) — Giuseppe Avolio |
| 19 | Boba (JTL) Yellow 30 | HMW Premier top 20 (Karabast play) — Wylde77 |
| 20 | Wicket Splash Green | HMW Premier top 20 (Karabast play) — Niklas182 |

## Eternal

| # | Deck | Source |
|---|---|---|
| 1 | Han (SOR) Yellow 30 | 1st, Regional Qualifier (SEC) — Milwaukee, Wisconsin, USA |
| 2 | Cad (SHD) TT | 1st, Planetary Qualifier (SEC) — Bilbao, Biskaia, Spain |
| 3 | Yoda DV | 1st, Planetary Qualifier (SEC) — Caba, Argentina |
| 4 | Tobias Splash Green | SWUDB: CRAZY  FUN !!! - 2.0 |
| 5 | Boba (JTL) Nabat Village | #9, Dice Saloon Store Showdown (JTL) |
| 6 | Sabine (SOR) ECL | 1st, Regional Qualifier (LOF) $1K |
| 8 | Maul (HMW) DV | SWUDB: STAR WARS DAD Maul Data Vault |
| 9 | Jango TT | 1st, Sector Qualifier (JTL) Milan, Italy — Milan, Lombardy, Italy |
| 10 | Vader (SOR) DV | 1st, Planetary Qualifier (JTL) — Arnhem, GE, Netherlands |
| 11 | Palpatine (SOR) ECL | #11, Planetary Qualifier (LOF) — Austin, Texas, USA |
| 12 | Krennic (SOR) DV | #5, Centro Congressi Artemide Store Showdown (JTL) |
| 13 | Grievous (TWI) Red 30 | SWUDB: Triple Dark Grievous |
| 14 | Gar ECL | 1st, Planetary Qualifier (SEC) — Miami, Florida, USA |
| 15 | Bo-Katan (SHD) Blue 30 | #6, Outland Porsgrunn Store Showdown (LOF) |
| 16 | Jango Red 30 | 1st, Sector Qualifier (JTL) — Denver, Colorado, USA |
| 17 | Sidious TT | Karabast, 2-1 in Wayfinder-tracked games (last 45 days) |
| 18 | Iden Yellow 30 | #2, La Caverne du Gobelin Nancy Store Showdown (JTL) |
| 19 | Cad (ASH) TT | SWUDB: Cad Bane Eternal |
| 20 | Han (SHD) Blue 30 | 1st, Planetary Qualifier (SEC) — Vienna, WI, Austria |
| 21 | Mando (ASH) Colossus | SWUDB: Berlin Sector winner (GLHF_Christian) |

## HMW Draft

| # | Deck | Source |
|---|---|---|
| 1 | Tarfful Blue 30 | PTP draft, 2-0 |
| 2 | Hemlock Yellow 30 | PTP draft, consensus build of 38 |
| 3 | Warrior Red 30 | PTP draft, consensus build of 33 |
| 4 | Poggle Blue 30 | PTP draft, 2-1 |
| 5 | Wicket Green 30 | PTP draft, consensus build of 21 |
| 6 | Tarfful Yellow 30 | PTP draft, 2-0 |
| 7 | Hemlock Green 30 | PTP draft, consensus build of 21 |
| 8 | Poggle Yellow 30 | PTP draft, 2-0 |
| 9 | Jar Jar Yellow 30 | PTP draft, consensus build of 16 |
| 10 | Hemlock Red 30 | PTP draft, consensus build of 16 |
| 11 | Bossk Red 30 | PTP draft, consensus build of 10 |
| 12 | Bossk Green 30 | PTP draft, consensus build of 9 |
| 13 | Poggle Green 30 | PTP draft, 2-1 |
| 14 | Tarfful Red 30 | PTP draft, consensus build of 9 |
| 15 | Warrior Green 30 | PTP draft, consensus build of 9 |
| 16 | Bossk Blue 30 | PTP draft, consensus build of 9 |
| 17 | Darth Vader Blue 30 | PTP draft, consensus build of 7 |
| 18 | Wicket Yellow 30 | PTP draft, consensus build of 7 |
| 19 | Jar Jar Green 30 | PTP draft, consensus build of 6 |
| 20 | Darth Vader Yellow 30 | PTP draft, consensus build of 5 |

## HMW Sealed

| # | Deck | Source |
|---|---|---|
| 1 | Tarfful Blue 30 | PTP sealed, 3-0 |
| 2 | Hemlock Green 30 | PTP sealed, 2-0 |
| 3 | Hemlock Yellow 30 | PTP sealed, 2-0 |
| 4 | Tarfful Yellow 30 | PTP sealed, 1-0 |
| 5 | Warrior Red 30 | PTP sealed, 2-1 |
| 6 | Poggle Yellow 30 | PTP sealed, 2-0 |
| 7 | Tarfful Red 30 | PTP sealed, 2-0 |
| 8 | Hemlock Red 30 | PTP sealed, 1-0 |
| 9 | Poggle Blue 30 | PTP sealed, 2-0 |
| 10 | Wicket Green 30 | PTP sealed, 1-0 |
| 11 | Poggle Green 30 | PTP sealed, 3-0 |
| 12 | Grievous Red 30 | PTP sealed, 2-0 |
| 13 | Grievous Yellow 30 | PTP sealed, consensus build of 43 |
| 14 | Bossk Red 30 | PTP sealed, 1-0 |
| 15 | Jar Jar Green 30 | PTP sealed, consensus build of 37 |
| 16 | Bossk Blue 30 | PTP sealed, 3-0 |
| 17 | Jar Jar Yellow 30 | PTP sealed, 1-0 |
| 18 | Warrior Green 30 | PTP sealed, 4-1 |
| 19 | Wicket Yellow 30 | PTP sealed, consensus build of 29 |
| 20 | Bossk Green 30 | PTP sealed, consensus build of 28 |
