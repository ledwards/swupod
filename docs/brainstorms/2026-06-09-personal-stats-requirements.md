---
date: 2026-06-09
topic: personal-stats
---

# Your Stats — Personal Pulls, Luck, and Activity

## Problem Frame

The existing `/stats` page is built for competitive-meta research: per-card draft
performance, leader selection rates, deck inclusion, tournament-player comparisons.
It already has a "You" column, but it sits alongside All/Tournament/Top and shares
the same competitive framing. Players who land on `/stats` to answer a different
question — "Am I unlucky? Do I really get too many crappy Legendaries? Why does my
pool look so blue?" — have nowhere to go.

The data needed to answer those questions already exists in `card_generations`,
which records every card generated in every pack (set, rarity, treatment, source).
Joining to pools and draft pod players yields per-user attribution. The missing
piece is a section of the app that frames that data around the *individual user*
and contextualizes their numbers honestly — including telling them when their
sample is too small to draw conclusions from.

This brainstorm scopes a new "Your Stats" section that lives alongside the current
competitive stats, organized around three pillars: activity totals, luck/variance
analysis with statistical context, and a per-set lens. The existing per-set card
tables and tournament/top-player comparisons are untouched.

---

## Actors

- A1. **Logged-in player**: Primary user. Opens the section to investigate their own pulls, browse their lifetime activity, or check whether their suspicion of bad luck has any signal in it.
- A2. **Logged-out visitor**: Secondary. Sees what the section is and a sign-in CTA; no personal data shown.

---

## Key Flows

- F1. **Investigate a suspicion of bad luck**
  - **Trigger:** Player thinks they get too few Legendaries (or too much blue, or never pull a specific card).
  - **Actors:** A1
  - **Steps:** Open Your Stats → pick the set in question → read the headline verdict for the relevant dimension (rarity, aspect, or streaks) → optionally expand "show math" or change scope between "packs I opened" and "what I kept".
  - **Outcome:** Player gets a one-sentence verdict that either confirms, disproves, or explicitly defers ("we need more packs to tell") their suspicion.
  - **Covered by:** R6, R7, R8, R10, R11

- F2. **Skim my activity**
  - **Trigger:** Player wants to see how much they've played, or share the count with a friend.
  - **Actors:** A1
  - **Steps:** Open Your Stats → see the Activity block at the top (packs opened, pools opened, drafts joined, decks built, decks that made it to the play page) → optionally restrict to a date range.
  - **Outcome:** Player sees lifetime (or ranged) totals at a glance, no clicks required.
  - **Covered by:** R3, R4, R5

- F3. **Switch luck scope between opened vs kept**
  - **Trigger:** Player wants to see whether their *picks* look different from their *pulls*.
  - **Actors:** A1
  - **Steps:** In the Luck section, toggle scope between "Packs I opened" and "What I kept" → all luck panels recompute against the new card set.
  - **Outcome:** Player can compare what the RNG gave them against what they ended up with after drafting.
  - **Covered by:** R6

---

## Requirements

**Page placement and navigation**
- R1. Personal stats live in a new top-level section reachable from `/stats`. The exact mounting (a "Your" tab vs a `/me/stats` route vs a top-of-page block) is decided in planning, but the existing per-set card tables, charts, and tournament/top comparisons must remain untouched and equally discoverable for the competitive-meta audience.
- R2. The personal section is gated by Discord login but not by Patreon. Personal data is free for any logged-in user.

**Activity dashboard**
- R3. Display the user's lifetime totals: packs opened, pools opened, drafts joined, decks built, and decks that made it to the play page.
- R4. "Made it to play" is counted when the user navigates to a play page route (`app/pool/[shareId]/deck/play`, `app/formats/pack-blitz/[shareId]/play`, `app/formats/pack-wars/[shareId]/play`). Any visit to the page counts — no minimum dwell time, no "deck actually loaded into a game" requirement. Each unique pool/deck counts at most once regardless of repeat visits.
- R5. Activity totals respect the date-range pickers already on the stats page. Default range is the same default the existing page uses; a "Lifetime" preset is available.

**Luck and variance analysis**
- R6. A "scope" toggle controls which cards count as the user's:
  - **Packs I opened** — every card from every pack the user personally cracked, regardless of who ended up picking each card. This is the pure RNG view.
  - **What I kept** — cards in pools the user owns (sealed pools as opened; final draft pools after picking is complete).
  - Default to "Packs I opened" because it isolates luck from picking skill.
- R7. A per-set selector (LAW, SEC, LOF, JTL, TWI, SHD, SOR) drives all luck analysis. Expected distributions are set-specific. Default to the most recent set the user has activity in; fall back to LAW if none.
- R8. Three luck dimensions in v1:
  - **Rarity** — observed vs expected counts of Common, Uncommon, Rare, Legendary.
  - **Aspect** — observed vs expected counts across Vigilance, Command, Aggression, Cunning, Neutral, Multicolor.
  - **Specific card streaks** — individual cards the user has hit unusually many times, and cards they've never pulled despite a high expected count.
- R8a. Expected baselines for rarity, aspect, and specific cards are computed from each set's *card-pool composition weighted by pack slot odds* — the rigorous baseline derived from how packs are actually designed, not from observed averages across users. This stays stable as the user base grows and avoids the regress of "expected = average, so nobody is unusual."

**Statistical contextualization**
- R9. Every luck panel uses a three-layer presentation:
  - **Headline** — one sentence in plain English combining the observation with a verdict. Examples: "Your Legendary rate is slightly below normal, but at 72 packs this is mostly noise." / "You've pulled markedly more Vigilance than expected — about a 4% chance if luck were average."
  - **Visual** — a small distribution chart (bell curve or dot plot) with a "you are here" marker showing where the user sits relative to expected.
  - **Show math** — an expandable section with expected mean, observed value, and either a 95% confidence interval or a p-value.
- R10. Verdict copy distinguishes three regimes:
  - **Insufficient sample** — "We need more packs to tell — this is well within noise."
  - **Normal** — "This is normal variance."
  - **Unusual** — "This is genuinely unusual — about an X% chance if your luck were average."
- R10a. The sample-size cutoff between "insufficient" and "normal/unusual" is *derived* per dimension from a statistical power calculation — the smallest n at which the confidence interval is tight enough to discriminate "unusual" from "normal" at the threshold used in R11. Not a hardcoded global constant. Planning chooses the power-level target.
- R11. Streak callouts (within the Specific Cards dimension) only appear when the observation is statistically interesting (observed count meaningfully exceeds expected, or zero pulls with a meaningfully high expected count). Routine results are not displayed so the section doesn't become noise.

**Empty, partial, and logged-out states**
- R12. If the user has no pulls for the selected set, show a friendly empty state with a link to start a sealed pool or join a draft.
- R13. If `card_generations` tracking began after some of the user's history (the existing page uses `2026-02-12` as the default start), display a single line near the activity block: "Tracking started YYYY-MM-DD; earlier pulls are not included." Surface this only when the user has account activity that predates the cutoff.
- R14. Logged-out visitors see a brief explanation of what the section does plus a "Sign in with Discord" CTA. No sample or placeholder personal data is rendered.

---

## Acceptance Examples

- AE1. **Covers R9, R10.** A user has opened 18 LAW packs and has pulled 1 Legendary. Expected ~1.3 ± 1.1. The Rarity panel headline reads: "We need more packs to tell — at 18 packs, your Legendary count is well within noise." The bell curve shows the user's pin clearly inside the central bulk. "Show math" reveals: Expected 1.3, observed 1, p = 0.74.
- AE2. **Covers R9, R10.** A user has opened 240 LAW packs and pulled 6 Legendaries. Expected ~17.3 ± 3.9. The headline reads: "This is genuinely unusual — you've pulled meaningfully fewer Legendaries than expected. Roughly a 0.4% chance if your luck were average." The bell curve shows the pin in the far-left tail.
- AE3. **Covers R6.** A user switches scope from "Packs I opened" to "What I kept". Their aspect distribution shifts noticeably toward Vigilance (their preferred draft color) — confirming that their picking, not their RNG, accounts for the color skew. The headline copy updates accordingly.
- AE4. **Covers R11.** A user has pulled "Darth Vader, Dark Lord of the Sith" 4 times in 60 LAW packs. Expected ~0.5. Streaks section shows: "Darth Vader: pulled 4× (expected ~0.5). About a 0.2% chance." Cards within their expected range are not listed.
- AE5. **Covers R4.** A user builds three decks, exports two to Karabast, and clicks "Play" on one of them, landing on `/pool/abc123/deck/play`. The Activity dashboard shows "Decks built: 3" and "Made it to play: 1".

---

## Success Criteria

- **Human outcome**: A user who lands on the page with the suspicion "I get too many crappy Legendaries" can pick their set, read one sentence, and walk away with a calibrated answer — confirmed, disproved, or "your sample is too small."
- **Honest sample-size handling**: At low n, the dominant verdict is "we need more packs to tell," not "you're unlucky." Players don't leave feeling like the page validated noise as a real pattern.
- **Activity accuracy**: Lifetime totals match what the user remembers doing — no obvious double-counting, no missing pools they own.
- **No regression for the competitive audience**: The existing per-set card tables, leader stats, and Tournament/Top comparisons remain at parity. The Patreon paywall for Tournament/Top is unchanged.
- **Planning handoff**: A planner can build v1 from this doc without inventing user-facing behavior. Every metric, panel, verdict regime, and empty state is named here.

---

## Scope Boundaries

- Treatment distribution (foil / hyperspace / showcase rates) — deliberately deferred to v2 despite being easy to compute. The user prioritized rarity, aspect, and specific-card streaks for v1.
- Public profiles or sharing — personal stats are private to the logged-in user. No share links, no public profile pages.
- Head-to-head comparison against specific other players ("am I luckier than user X") — not in v1.
- Predictive guidance ("open 50 more packs to converge") — not in v1.
- Patreon gating on personal stats — explicitly not gated. The free tier sees everything personal.
- Replacing the existing per-set tables — explicitly out. They stay intact for the competitive audience.

---

## Key Decisions

- **Add a new section, don't re-orient the page.** The competitive-meta audience keeps the per-set tables exactly as they are. Personal stats is additive.
- **Both luck scopes ship in v1, toggleable.** Default to "Packs I opened" because it isolates RNG from picking skill. "What I kept" is one click away for users who want to see picking effects.
- **Three-layer presentation per dimension** (plain English → bell curve → expandable math). The user explicitly wanted all three; layering them avoids dumping numbers on casual users while keeping the math reachable.
- **Three luck dimensions in v1** — rarity, aspect, specific-card streaks. Treatment deferred.
- **Per-set selector required.** Expected distributions are set-specific (LAW packs have different odds than SEC packs); a global "all sets" view would compare apples to oranges.
- **Rigorous baseline, not observed-average.** Expected counts come from card-pool composition × slot odds. Compares users against the math of how packs were designed, not against other users' luck.
- **Sample-size cutoff is derived, not hardcoded.** A power calculation per dimension picks the smallest n at which "unusual" can be discriminated from "normal." Keeps the verdict thresholds honest as set pool sizes change.
- **"Made it to play" = any visit to a play page route.** No dwell time, no game-loaded gating. Simplest signal, lowest tracking cost, and matches the question users are actually asking ("did I take this deck somewhere to play with it?").

---

## Dependencies / Assumptions

- `card_generations` joins reliably to `card_pools` (for sealed) and `draft_pod_players` (for draft) for per-user attribution. The draft case especially needs verification — particularly that "packs the user opened" can be extracted unambiguously from `source_type='draft'` + `source_id` even when bots also participated.
- Bots' pulls must be excluded from "your pulls" — only the logged-in user's own packs and pools count.
- "Made it to play" tracking does not appear to exist as a discrete event today. Either an existing analytics signal can be co-opted, or planning adds a lightweight page-view event for the three play routes. Tracking this metric is a prerequisite to R3 and R4.
- Per-set expected distributions for rarity and aspect are computable from existing card data (`src/data/cards.json`) plus the per-set pack-composition belts in `src/belts/` and `src/utils/setConfigs/`. These have not been verified to expose the slot odds at the granularity required for confidence intervals; planning should confirm or add the needed accessors.
- The existing date-range picker pattern on `app/stats/page.tsx` is reusable for Activity filtering.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R4][Technical] Whether existing pageview analytics or middleware can carry the play-page signal, or a new event table is needed.
- [Affects R3, R5][Technical] Whether activity totals are computed via a new `/api/stats/me/summary` endpoint or composed client-side from existing endpoints.
- [Affects R7][Needs research] Default-set logic: "most recent set with any pull" vs "most recent set with a completed deck" vs "most recently played in any way." Probably want to see a small data sample to decide.
- [Affects R11][Technical] Concrete threshold for "statistically interesting" streak — needs to balance noise against missed-stories. Likely a small empirical sweep during planning.
- [Affects R1][Technical] Whether Your Stats becomes a tab inside `/stats`, a separate route like `/me/stats`, or a top-of-page block above the existing tabs. Affects URL stability, deep-linking, and how shareable the current `#LAW`-style hash anchors stay.

---

## Visual: Page Layout Sketch

```
┌────────────────────────────────────────────────────────────────┐
│  Your Stats                                                     │
│  Your pulls, your luck, and what you've played                  │
│  [Date range: 2026-02-12 → 2026-06-09 ✎]                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Activity                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  72 packs   12 pools   8 drafts   19 decks   11 played   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Luck                              Scope: [Packs I opened ▾]    │
│  Set: [LAW ▾]                                                   │
│                                                                 │
│  ┌─ Rarity ────────────────────────────────────────────────┐   │
│  │  Your Legendary rate is slightly below normal, but at   │   │
│  │  72 packs this is mostly noise.                          │   │
│  │                                                          │   │
│  │       ▁▂▃▅▇█▇▅▃▂▁                                        │   │
│  │              ↑ you                                       │   │
│  │  [show math ▾]                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Aspects ───────────────────────────────────────────────┐   │
│  │  Your Vigilance share is meaningfully above expected.   │   │
│  │  About a 4% chance if luck were average.                 │   │
│  │  [bell + you-are-here pin]   [show math ▾]               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Notable card streaks ──────────────────────────────────┐   │
│  │  • Darth Vader: 4× (expected ~0.5)  — 0.2% chance       │   │
│  │  • Never pulled Han Solo in 72 packs — 8% chance        │   │
│  │  (Cards within normal range aren't shown.)              │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

-> `/ce-plan` for structured implementation planning.
