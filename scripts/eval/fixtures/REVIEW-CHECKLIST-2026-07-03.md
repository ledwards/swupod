# Fixture review checklist — 2026-07-03

Five new LAW fixtures. Two are adjudicated by a native-res crop read (Fable 5
in-chat) and just need your sign-off; three are model starters where two models
disagree — verify ONLY the listed rows against the photos, fix, then delete the
fixture's `_note` so run-eval picks it up.

Quick reference — what each sheet actually is:

| fixture | sheet species | expected totals |
|---|---|---|
| prague-luna-law | full sealed pool | 96 pool / 6 L / 6 B |
| prague-taylor-a-law | full sealed pool | 96 pool / 6 L / 6 B |
| prague-taylor-b-law | full sealed pool | 96 pool / 6 L / 6 B |
| palmsprings-taylor-a-law | **top-8 draft pool** | 48 pool (3×16) / 3 L / 3 B, 32 deck |
| palmsprings-taylor-b-law | **deck-only registration** | 32 marks (30 deck + leader + base), PLAYED col empty |

## palmsprings-taylor-b-law — adjudicated, sign-off only
Ground truth rewritten from a full native-res read: 27 rows, pool 32, all marks
in TOTAL column. The old opus starter's `The Client ×6`, Rickety Quadjumper,
Shielded Hauler, Betrayed Trust, Lost and Forgotten were fabrications. Skim the
photos; if you agree, delete `_note`.

## palmsprings-taylor-a-law — adjudicated, sign-off only
Ground truth rewritten from a full native-res read: 42 rows, pool 48, deck 32
(TOTAL = pool tallies, PLAYED = deck). Leaders: Boba 1/1, Hera 1/0, Han Solo
1/0. Bases: Daimyo's Palace 2/1, Aldhani Garrison 1/0. Skim; delete `_note`.

## prague-luna-law — opus starter on disk; verify 12 rows
Bases already adjudicated correct (Daimyo's 1, Coaxium 2, Imperial Command
Complex 1, Contested Caverns 1, Partisan Hideout 1/1 = 6). Check the rest of
the opus/fable disagreements:
- qty: Kill Switch (opus 1/0, fable 1/1) · Hidden Hand Supplier (1/1 vs 1/0) · From a Certain Point of View (2/0 vs 1/0)
- opus-only (fable missed — likely real, confirm): Cavern Angels X-Wing, Vermillion, Rookie Rocket-jumper 1/1, Circuit Challenger, Callous Bounty Hunter 1/1, Criminal Contact 1/1
- fable-only (likely fable inventions — confirm absent): Mid Rim Sharpshooter, Secret Battle of Pretend

## prague-taylor-a-law — opus starter on disk; verify ~28 rows
Biggest open fixture. Leaders disagree: opus says **Lando Calrissian**, fable
says **Darth Vader** — check row 18 vs row 11. Bases: opus lists 6 (Great Pit
1/1, ICC, Contested Caverns, Shipbreaking Yard, Partisan Hideout + Daimyo's?);
fable found only Canto Bight + 1 — count the base tallies carefully.
- qty disagreements: Incapacitate 2/1 vs 1/1 · Target Tagger 2/2 vs 1/1 · Quarren Contractor 1/1 vs 1/0 · Vult Skerris's Defender 3/0 vs 1/1 · Sabine Wren 2/0 vs 1/0 · You Hold This 3/0 vs 1/1 · Val 1/1 vs 1/0
- opus-only rows (14 more): Display Piece, Shield Drive Outfitter 1/1, Vigilant Scouts, Veiled Strength, Bib Fortuna, Pirate Snub Fighter, Common Cause, Payroll Heist, B-Wing Skirmisher, Mid Rim Sharpshooter, Commence the Festivities, Milodon Rider 1/1, Unmarked Credits 1/1, Rio Durant 1/1
- fable-only rows: Storm Raider, Windfall, Chio Fain 1/1, L3-37

## prague-taylor-b-law — FABLE starter on disk; verify ~21 rows
Fable's output (96 pool, leaders as 5 rows: Boba/Hera/Chewie/Aurra ×1 + Han ×2)
replaced the broken opus starter (89 pool, 1 base, leaders ×2). But fable found
only 2 bases (Canto Bight, Stygeon Spire) — the bases table needs a hard look:
find the missing ~4 base tallies.
- qty disagreements (opus vs fable): Lost and Forgotten 1/0→1/1 · Pirate Snub 1→2 · Follower of the Code 1/0→1/1 · Target Tagger 2→1 · Mercenary Fleet 2/1→1/1 · That's a Rock 1/1→1/0 · Champion's KT9 1/1→2/1 · Unmarked Credits 1/0→1/1 · 4-LOM 1→2 · Kessel Hulk 2→1
- fable-only rows to confirm: Choke on Aspirations, Stalwart Fleet Trooper 1/1, Callous Bounty Hunter, Night Wind Assailants, Criminal Contact 2/1

## sq-rwc-lee-ash — NEW (added 2026-08-16): verify vs your own memory of the pool
First ASH fixture (SQ Redwood City 8/15, you, sealed). Starter is a
Fable-in-chat native-res read: 91/96 pool, 29 deck, 6L/6B. Open items are
listed in the fixture's `_note`: ~5 unresolved pool marks, four
ambiguous PLAYED-column singles (V72/V83/A188/Cu228), Throne Room marked
PLAYED-only, Multicolor marks in the RIGHT MARGIN (28/35/42), and three
RED verifier-ink spots (V52 note, C100 struck out, A173 note). You built
this pool — settle each from memory, fix expectedTotals.deck, delete _note.

Delete this file when all six fixtures are verified.
