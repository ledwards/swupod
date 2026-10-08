---
date: 2026-06-17
topic: practice-swiss-play-page
---

# Practice Swiss — Play-Page Legibility

## Problem Frame

Competitive-practice pods already run a full Swiss matchmaking experience after the
draft (3 rounds, BO3, mutual/Wayfinder result confirmation, pod-owner controls,
record-based standings) via `src/components/MatchmakingPanel.tsx` on the deck play
page (`app/pool/[shareId]/deck/play/page.tsx`). It works — but it doesn't *read* as
Swiss. The section is labeled "COMPETITIVE PRACTICE," match cards never show player
records (the whole point of Swiss is being paired on your record), standings live on
a "Results" tab that implies they're final, there's no round-progress indicator, and
the "how it works" explainer lives back on the draft page rather than where matches
happen. Players also have to manually report results even when the Wayfinder companion
could record them automatically, and there's no in-context nudge to install it.

This work renames the experience to **Practice Swiss** and makes its structure legible
on the play page. It is a presentation/UX pass over the *existing* competitive
matchmaking — not a new format, not a new audience, not new pairing logic.

---

## Actors

- A1. Player (pod participant): plays BO3 matches each round, records or reports
  results, and tracks where they stand.
- A2. Pod owner (host): everything a player does, plus override results, boot players,
  reassign byes, and force-start round 1. Already implemented; presentation must keep
  these controls coherent.
- A3. Wayfinder Companion (browser extension / ingestion endpoint): detected on the
  client via `useWayfinderDetection()`; when present, auto-records game results and
  auto-confirms the player's current Practice Swiss match.

---

## Key Flows

- F1. Play and record a match — Wayfinder present
  - **Trigger:** Round pairs; player opens their game on the play surface.
  - **Actors:** A1, A3
  - **Steps:** Player sees "Your match: You vs. {opp}" with records → plays games →
    Wayfinder posts results → match auto-confirms → panel reflects "recorded."
  - **Outcome:** Result confirmed with no manual step; standings + round progress update.
  - **Covered by:** R3, R6, R9

- F2. Play and record a match — no Wayfinder
  - **Trigger:** Round pairs; player has no companion installed.
  - **Actors:** A1 (and opponent), A2 as escalation
  - **Steps:** Panel shows an install nudge → player still uses **Report Result** →
    both players submit → results match → confirmed (or owner overrides a conflict).
  - **Outcome:** Result confirmed via mutual confirmation; install nudge seen.
  - **Covered by:** R6, R10, R11

- F3. Track standing and progress through the event
  - **Trigger:** Any point during rounds.
  - **Actors:** A1
  - **Steps:** Player reads "Round N of 3 · X of Y confirmed" → opens **Standings** →
    sees live rank, record, and the tiebreaker → returns to current round.
  - **Outcome:** Player always knows the format, where they stand, and what to do next.
  - **Covered by:** R2, R4, R5, R7, R8

---

## Requirements

**Naming & framing**
- R1. Rename the matchmaking section from "COMPETITIVE PRACTICE" to **"Practice Swiss"**
  everywhere the post-draft matchmaking surfaces: the panel header
  (`MatchmakingPanel.tsx`), the "Matches" copy in `CompetitivePracticeRules.tsx`, and
  any creation-flow mention of the post-draft schedule. The enforced-draft mode itself
  keeps the **"Competitive Practice"** name (see Key Decisions).
- R2. Provide an on-page **"How Practice Swiss works"** explainer reachable from the
  panel (no need to leave the play page). Covers: 3 rounds, best-of-three, paired by
  record, no rematches, byes, and how ranking/tiebreak works.

**Pairing legibility**
- R3. Each player on a match card shows their current **W-L(-D) record going into the
  round**, so it's visible at a glance that Swiss pairs similar records.
- R4. The panel shows **round progress**: "Round N of 3" plus a per-round "X of Y
  matches confirmed" count.
- R5. Round tabs visually distinguish **current / completed / not-yet-started** states.
- R6. A persistent **status line** tells the player what's happening and what to do
  across phases: waiting for decks → your match is ready (vs. opponent) → reported,
  awaiting confirmation → round complete → event complete.

**Standings**
- R7. Standings are visible **live throughout the rounds**, not only after round 3.
  Rename the "Results" tab to **"Standings."**
- R8. Standings show rank, player, W-L(-D), and the **tiebreaker** that orders tied
  players (OMW%), with the current user's row emphasized. Continue to **not** declare a
  "winner" — no trophy iconography (existing constraint).

**Wayfinder auto-recording**
- R9. When the companion is **detected**, the panel signals that Practice Swiss matches
  **auto-record and auto-confirm**, and the manual report affordance adapts (e.g.
  becomes secondary or shows an "auto-recording" state) so players don't think they
  still must report by hand.
- R10. When the companion is **not detected**, the panel surfaces a **contextual install
  nudge** ("Install Wayfinder to auto-record & auto-confirm your Practice Swiss games")
  using the existing `WayfinderStoreButtons`, distinct from the generic PlayInstructions
  pitch.
- R11. Manual mutual confirmation (and pod-owner override) **remains the fallback** for
  players without the companion; Wayfinder is the happy path, not a hard requirement.

---

## Wireframe (annotated with R-IDs)

```
┌─ PRACTICE SWISS ─────────────────────────────  [ How it works ▸ ] ┐  R1 R2
│                                                                    │
│  Round 2 of 3  ·  2 of 4 matches confirmed                         │  R4
│                                                                    │
│  ┌─ Your match ───────────────────────────────────────────────┐   │  R6
│  │  You (1-0)   vs   Reza (1-0)          ● ● ○                  │   │  R3
│  │  ✓ Auto-recording via Wayfinder        — or —  [Report]     │   │  R9 R11
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  [ Round 1 ✓ ]  [ Round 2 • ]  [ Round 3 ]  [ Standings ]          │  R5 R7
│                                                                    │
│  ── Round 2 pairings ──                                            │
│  Maya (1-0)  vs  Jon (1-0)     ● ● ○    In progress                │  R3
│  Sam  (0-1)  vs  Lee (0-1)     ✓ ✓      Complete                   │
│                                                                    │
│  ⚑ No Wayfinder? Install the Companion to auto-record your         │  R10
│    games   [ Add to Chrome ]  [ Firefox ]  [ Safari ]              │
└────────────────────────────────────────────────────────────────────┘

Standings tab
  1.  Maya   2-0   OMW 58%                                              R7 R8
  2.  You    2-0   OMW 50%   ◄ you
  3.  Jon    1-1   OMW 61%
  …
  (ranked by match wins, then OMW% — no winner declared)               R8
```

---

## Acceptance Examples

- AE1. **Covers R9, R11.** Given a player whose Wayfinder companion is detected, when
  their BO3 finishes and Wayfinder posts the result, then the match shows confirmed/
  "recorded" with no manual report needed, and the **Report Result** button is not the
  primary call to action.
- AE2. **Covers R10, R11.** Given a player with no companion detected, when they view
  their current match, then a contextual "Install Wayfinder" nudge is shown **and** the
  **Report Result** flow still works for mutual confirmation.
- AE3. **Covers R3.** Given round 2, when a player views any match card, then each
  player's record (e.g. "1-0") is shown next to their name.
- AE4. **Covers R7, R8.** Given round 2 is mid-way, when a player opens **Standings**,
  then it lists everyone ranked by wins then OMW%, with their own row emphasized and no
  "winner" declared — before round 3 has been played.
- AE5. **Covers R4.** Given round 2 with 2 of 4 matches confirmed, when a player views
  the panel, then it reads "Round 2 of 3 · 2 of 4 matches confirmed."

---

## Success Criteria

- A competitive-pod player can, **without leaving the play page**, understand the format,
  see who they play and why (records), watch their live standing, and always know what to
  do next.
- The experience reads as **"Practice Swiss"** — the word "tournament" appears nowhere,
  and no single player is crowned a winner.
- **Wayfinder adoption:** players without the companion get a clear, contextual install
  nudge; players with it never have to report a match by hand.
- **Clean handoff:** planning can implement entirely within `MatchmakingPanel`,
  `MatchCard`, the rules copy, and the play page, reusing `useWayfinderDetection()`,
  `WayfinderStoreButtons`, `src/services/matchmaking/results.ts`, and the existing
  `/api/plugin/v1/match/result` ingestion — no new tables, routes, or pairing logic.

---

## Scope Boundaries

- No elimination bracket / top cut — the structure is and stays Swiss (decided this
  session after the original "bracket" framing).
- No change to **who** runs Practice Swiss — stays competitive pods only; not opening
  Swiss to casual/regular draft pods this round.
- No change to draft-phase enforcement (Appendix C timers, deck-build timer, 8 players,
  3 rounds) — this is a post-draft *presentation* pass only.
- No "winner" declaration or trophy iconography — standings rank without crowning.
- No new pairing algorithm, round count, or BO format changes.
- No "tournament" language anywhere in UI, copy, or new naming.

---

## Key Decisions

- **"Practice Swiss" names the post-draft matchmaking phase**; the enforced-draft mode
  keeps "Competitive Practice." Rationale: "Swiss" describes the matchmaking, not the
  draft timers — and the player only meets the Swiss part on the play page.
- **All seven improvements ship together** — five legibility wins (rename, records-on-pairings,
  live standings, round progress, on-page how-it-works) plus the two Wayfinder items
  (auto-record, install nudge). No phased priority — user: "nail all of it."
- **Reuse existing Wayfinder infrastructure** (`useWayfinderDetection`,
  `WayfinderStoreButtons`, ingestion endpoint) rather than building detection or store
  links anew.
- **Manual reporting stays as the fallback** — Wayfinder is the happy path, not a gate.

---

## Dependencies / Assumptions

- Depends on existing, verified-present building blocks: `useWayfinderDetection()`
  (`src/hooks/useWayfinderDetection.ts`), `WayfinderStoreButtons`
  (`src/components/WayfinderStoreButtons.tsx`), OMW%/ranking logic
  (`src/services/matchmaking/results.ts`), and the competitive auto-ingestion in
  `app/api/plugin/v1/match/result/route.ts`.
- Assumption: OMW% is the intended tiebreaker to display (matches the approved CPM
  spec). Note: `MatchmakingPanel`'s current local `computeStandings` sorts by wins →
  losses → draws and does **not** use OMW% — surfacing the tiebreaker is net-new display
  work even though the calculation already exists in the service.
- Assumption: competitive pods remain 8-player / 3-round / BO3 (unchanged).

---

## Outstanding Questions

### Resolve Before Planning

- (none — scope and decisions are settled)

### Deferred to Planning

- [Affects R8][Technical] Where to compute OMW% for **live** standings — recompute
  client-side in the panel, or add standings/OMW to the broadcast payload from
  `src/lib/socketBroadcast.ts`?
- [Affects R9, R10][Design] How the **Report Result** affordance adapts when Wayfinder
  is detected (hidden vs. secondary vs. an "auto-recording" state), and exact placement
  of the install nudge so it doesn't duplicate the PlayInstructions pitch.
- [Affects R2][Design] Whether the on-page explainer is a modal, an inline expander, or
  a reuse of `CompetitivePracticeRules` scoped to the matchmaking section.

---

## Next Steps

-> `/ce-plan` for structured implementation planning
