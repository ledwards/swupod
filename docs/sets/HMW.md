# Homeworlds (HMW)

> **LLM INSTRUCTION**: Keep this document up to date whenever HMW-related pack generation logic, belt assignments, rarity weights, dates, or visibility gates change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | HMW |
| Set Number | 9 |
| Set Name | Homeworlds |
| Beta Access Date | 2026-09-17 |
| Public Access Date | 2026-09-27 (derived) |
| Prerelease Date | 2026-10-02 |
| Release Date | 2026-10-09 |
| Block | B |
| Color | `#2E7D32` |

HMW is the third Block B set, after LAW and ASH. Pack construction is copied
from ASH — i.e. the Block B rules as calibrated against 11 verified real ASH
boxes — until FFG announces otherwise.

## Dates and access

HMW is the first set to use the **10-day beta exclusivity window**. Public
access is no longer pinned to FFG's pre-release:

```
public access = betaAccessDate + BETA_EXCLUSIVITY_DAYS (10), capped at prereleaseDate
```

`getPublicAccessDate` in `src/utils/setConfigs/index.ts` is the single source of
truth, shared by the server gate (`isBeta`, read by `setAvailability`) and the
client catalog filter (`isSetBeta` in `src/utils/api.ts`). Both used to hold
independent copies of the same date maths.

The cap matters: once FFG's pre-release starts the set is physically in players'
hands, so a late beta launch shortens the window rather than pushing public
access past the real-world release. For HMW the cap is not reached — beta opened
2026-09-17, so everyone is in on 2026-09-27, five days before pre-release.

Sets with no `betaAccessDate` fall back to the original behaviour (public at
`prereleaseDate`), so every set through ASH is unaffected.

## Availability gates

HMW appears in set selectors only when both pass:

1. **Access/date gate** — `isBeta` is false (public access reached), or the
   caller passes `includeBeta: true` for beta/admin users.
2. **Real-card gate** — the generated catalog contains at least one real HMW
   card from SWUAPI (`hasCardsForSet` / `hasUpcomingSetSpoilers`).

The second gate is why art alone does not light anything up, and why the
coming-soon teaser, homepage banner and `/sets/HMW` page all stayed dark until
the first sync landed.

## No placeholder catalog

Unlike ASH, HMW needs **no spoiler placeholder catalog**. FFG published the full
checklist at once (250 numbered cards, 792 rows with variants) rather than
dribbling it out over weeks, so packs are generated from real cards from day one.
`ashPlaceholderCatalog.ts` has no HMW equivalent and should not grow one unless a
future set reverts to a partial spoiler season.

## Card counts

Derived from the synced catalog (Normal variants only) rather than copied from
ASH. The one figure known before the sync — four Common bases per primary aspect,
carrying the new Tatooine / Naboo / Endor / Kashyyyk base traits — is confirmed
by the data at 16.

## Set mechanics

- **Fortify** — a new keyword; the upgrade attaches to your BASE, a first for the
  game. Pack generation does not care (Fortify cards are ordinary Upgrades by
  type and rarity), but base-referencing cards are widespread in the set.
- **Beast tokens** — 3 power / 3 HP token units, the largest so far.
- **Weakness tokens** — the inverse of Experience.
- Spotlight Decks are Chewbacca and Grand Moff Tarkin (whose leader unit side is
  the Death Star), each with 4 Special-rarity cards.

Tokens are not booster cards and do not enter pack generation.

## Rotation

HMW is set 9, so it shares rotation batch 2 with LAW (7) and ASH (8). Its release
rotates **nothing** — JTL/LOF/SEC stay Premier-legal until set 10 ships. Icons is
not set 10: it is a non-core product with no set number, it rotates nothing, and
it is Chaos-only. See the comment on `rotationBatch` in
`src/utils/setConfigs/latest.ts`.

## Art

- Expansion/key art: `public/expansion-art/hmw.png`
- Booster pack: `public/pack-images/hmw-pack-1.png` — **one variant only**. FFG
  has published just the fan-of-three render, in which the other two packs are
  roughly half occluded, and the set is not on Amazon yet (that gallery is where
  the individual flats normally come from). `getCyclingPackImageUrls` repeats the
  single variant until `hmw-pack-2/3` can be sourced.
- Carbonite: `public/pack-images/hmw-cb-pack.png` is a **placeholder** — real
  chrome, empty art window, marked ART PENDING. No flat Carbonite pack render
  exists yet, only the angled display box.

## Related files

- `src/utils/setConfigs/HMW.ts` — set configuration
- `src/utils/setConfigs/publicAccess.test.ts` — the 10-day window
- `src/utils/setConfigs/HMW.test.ts` — set-level spec tests
- `src/belts/data/commonBeltAssignments.ts` — Block B auto-assignment
- `src/utils/packArt.ts` — expansion and pack art mapping
