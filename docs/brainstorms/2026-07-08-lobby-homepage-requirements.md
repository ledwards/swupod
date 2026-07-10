---
date: 2026-07-08
topic: lobby-homepage
---

# The Lobby: Homepage as a Live Game-Finding Surface

## Problem Frame

PTP generates great limited pools and decks, but finding a human to play against is manual: coordinate on Discord, share links, paste things into Karabast. The result is that most decks never play a real game. The lobby turns the site from a deck generator into a place where games happen — the most significant feature since the original site.

Design constraint that shapes everything: **~10–40 concurrent players at peak**. At that liquidity, invisible matchmaking queues starve; what works (per Lichess, Board Game Arena, Draftmancer, and Karabast itself) is persistent, visible seek listings + Discord pings + maximum visibility. Hence: the lobby *is* the homepage.

Much of the substrate already exists: public pod listing with realtime updates (`app/api/pods/public/route.ts`, `src/hooks/usePublicPodsSocket.ts`), Discord LFG auto-posting on public pod creation, presence counts (`src/hooks/usePresence.ts`), multiplayer sealed pods (2–16 players), and the Companion→Karabast pipeline (`src/components/PlayInstructions.tsx`, Swiss Practice shared-lobby machinery). The net-new capability is **open games**: post an already-built deck seeking an opponent, someone accepts with their own deck, both land in the same Karabast lobby.

---

## Actors

- A1. Poster: logged-in player with a completed built deck who lists an open game.
- A2. Acceptor: logged-in player who accepts an open game with their own built deck.
- A3. Pod host / pod member: creates or joins a draft/sealed pod with open seats (existing flows, resurfaced).
- A4. Wayfinder Companion: browser extension that opens the shared Karabast lobby for both players and auto-reports results.
- A5. Karabast: external play client where all games happen.
- A6. Discord LFG channel: liquidity backstop; receives an automatic ping for every new listing.
- A7. Anonymous visitor: sees the live lobby read-only; must log in (Discord OAuth) to post/join.

---

## Key Flows

- F1. Post an open game
  - **Trigger:** A1 clicks "Post an Open Game" on the homepage (or a "find an opponent" affordance from a finished deck).
  - **Actors:** A1, A6
  - **Steps:** Pick one of your built decks (any set, draft or sealed origin) → listing appears instantly in the Open Games column for everyone (socket broadcast) → Discord LFG ping fires → poster sees a "waiting" state.
  - **Outcome:** A visible, joinable seek exists; poster can cancel; listing expires if stale or the poster disconnects.
  - **Covered by:** R6, R9, R10

- F2. Accept an open game
  - **Trigger:** A2 clicks Accept on a listing.
  - **Actors:** A1, A2, A4, A5
  - **Steps:** A2 picks their own built deck → both players are routed to a match page → Companion opens/creates the shared Karabast lobby for both (one click) → game plays on Karabast → result auto-reports back to PTP via Companion.
  - **Outcome:** Both players in the same Karabast game with correct deck identity; result recorded when Companion is present.
  - **Covered by:** R7, R11, R13, R14

- F3. Play Now (quick play)
  - **Trigger:** A1 clicks "Play Now".
  - **Actors:** A1, A2, A6
  - **Steps:** Uses the player's most recent built deck (changeable) → if any open game exists, instantly accepts the oldest one → otherwise auto-posts an open game and shows a waiting state.
  - **Outcome:** Quick play is sugar over the seek list — there is no separate invisible queue that can go thin.
  - **Covered by:** R8

- F4. Join a pod with an open seat
  - **Trigger:** A3 clicks Join on a pod in the Pods Forming column.
  - **Actors:** A3
  - **Steps:** Existing public-pod join flow, now surfaced on the homepage with seat-fill indicators.
  - **Outcome:** Same as today's `/draft` / `/sealed/pod` join.
  - **Covered by:** R15

- F5. Pod play phase (V2)
  - **Trigger:** All players in a draft or sealed pod finish deckbuilding.
  - **Actors:** A3, A4, A5
  - **Steps:** Pod enters a play phase → pairings generated (single match for 2-player pods; multi-round Swiss-style pairing for larger pods, generalizing the competitive-draft Swiss Practice machinery to casual pods) → each pairing gets a shared Karabast lobby via Companion → results roll up into pod standings.
  - **Outcome:** "Draft/sealed together, then play each other" becomes an end-to-end experience.
  - **Covered by:** R16, R17

---

## Requirements

**Homepage as lobby (Direction A · Dual Track)**
- R1. The homepage becomes the lobby: two primary verbs on top ("Play Now", "Post an Open Game"), then a two-column live board — Open Games (left, wider) and Pods Forming (right) — with solo/deckbuilder entry points compressed into a tile row below. (Rendering: Direction A in the brainstorm mockups.)
- R2. The lobby is visible read-only to anonymous visitors; posting, accepting, and joining require Discord login. Presence count ("X players online") remains in the header area.
- R3. Empty-state behavior: when either column is empty, the two columns collapse toward a single combined list; a fully empty board shows a single "Post the first game — we'll ping Discord" CTA plus recent completed matches as signs of life.
- R4. Mobile: columns stack vertically with the lobby content first; all lobby rows work as stacked cards.
- R5. Every format reachable today from the homepage (solo sealed, solo draft, other formats, deckbuilder, history, my stats) remains reachable from the new homepage and/or top nav — demoted, never removed.

**Open games (V1 core)**
- R6. Any logged-in user can post an open game from any completed built deck (draft or sealed origin, any set). Listings show: username + avatar, set code, deck origin badge (draft/sealed), archetype name (from swuapi `archetypeShortName`), and age. Any built deck may accept any open game (cross-set and draft-vs-sealed allowed); the badges let players self-select.
- R7. Accepting routes both players to a match page where the Companion opens the same Karabast lobby for both — the one-click path is the hero treatment.
- R8. "Play Now" is implemented as auto-accept-oldest-open-game, else auto-post-a-seek. No separate matchmaking queue exists.
- R9. Every new listing pings the Discord LFG channel (reuse the existing public-pod Discord pipeline). Listings expire when stale (same 2-hour window as pods) and are delisted when the poster disconnects (same delist-timer pattern pods use today).
- R10. The poster is notified in-app the moment their game is accepted (socket push), and both players land on the match page.
- R11. Results auto-report via the Companion (existing match-results ingestion). Games played without the Companion simply have no recorded result in V1 — no manual result entry.
- R12. No rating/ELO appears anywhere in lobby listings. Load-bearing metadata is player, format, set, and seat-fill only.

**Companion emphasis**
- R13. The Companion is pushed hard on every lobby surface using the existing `PluginCTA` component (never hand-rolled), and the Companion goes GA (beta gate removed from `PluginCTA` / `isCompanionBeta`) as part of the V1 launch.
- R14. The match page carries a small always-visible troubleshooting note: what to do if the Companion misbehaves (copy your deck link, open Karabast, paste manually — the existing manual instructions, framed as fallback, not as a co-equal path).

**Pods surfaced (V1)**
- R15. The Pods Forming column lists existing public draft and sealed pods (existing API + socket), showing seat-fill dots (e.g., ●●●●●○○○ 5/8), competitive badge where applicable, and host identity, with one-click Join.

**Pod play phase (V2)**
- R16. After all players in a pod lock decks, the pod enters a play phase: 2-player pods get a single paired match; larger pods get multi-round pairings with standings shown on the pod page. Applies to both sealed and draft pods.
- R17. The play phase reuses/generalizes the Swiss Practice pipeline (shared Karabast lobby minting, result ingestion, pairing logic) rather than building a parallel system.

---

## Acceptance Examples

- AE1. **Covers R8.** Given three open games exist, when a player clicks Play Now, they instantly accept the oldest compatible listing and both players proceed to the match page.
- AE2. **Covers R8, R9.** Given no open games exist, when a player clicks Play Now, an open game is posted with their most recent deck, Discord is pinged, and the button shows a waiting state.
- AE3. **Covers R7, R14.** Given an acceptor without the Companion installed, when they accept, the match page leads with the Companion install pitch (PluginCTA) and shows the manual fallback instructions beneath it.
- AE4. **Covers R3.** Given zero open games and two forming pods, the homepage shows one combined list (pods only) rather than an empty left column beside a populated right column.
- AE5. **Covers R6.** A SEC draft deck may accept an open game posted with an LOF sealed deck; both listings displayed set and origin badges before acceptance.

---

## Listing & Match Lifecycle (added post flow analysis)

State machine for open games — R6–R11 must honor these invariants:

```
Listing:  OPEN → ACCEPTED | CANCELLED (poster) | EXPIRED (2h) | DELISTED (disconnect + grace)
Match:    ACCEPTED → LOBBY_OPEN → IN_GAME → COMPLETE (result ingested)
                   → ABANDONED (either player cancels, or no lobby within ~20 min)
```

- R18. Accept is atomic: first accept wins via conditional write; the loser sees a "game was just taken" toast (with a Play Now shortcut) and the listing disappears.
- R19. Per-user invariants: at most one open listing (posting again replaces it); at most one pending (ACCEPTED) match; no self-accept — and Play Now excludes the player's own listing (clicking it again while waiting is idempotent, not an error).
- R20. Accepted-match lifecycle: the match page shows both players' presence; either player can cancel an ACCEPTED match; matches that never reach a Karabast lobby expire after ~20 minutes. On cancel/expiry the poster gets a one-click repost (repost suppresses the Discord ping under the rate limit).
- R21. Accept during the poster's disconnect grace window is allowed and cancels the delist timer; the accepted-match lifecycle (R20) then governs.
- R22. Play Now is one-click instant: uses the most recent eligible deck, named inline next to the button with a "change" affordance (no modal in the hot path). A user with zero built decks is routed to a "get a deck first" funnel (solo sealed/draft → deckbuilder → "post it to the lobby" prompt on completion), never an error state.
- R23. Deck eligibility: a listing references the pool/deck (no snapshot) and requires the existing deck-validity check (legal deck with leader/base). Both decks re-validate at accept; a deleted/invalidated posted deck auto-delists with a toast.
- R24. Mobile: posting/accepting works on mobile, and **Karabast itself plays fine in mobile browsers** (corrected by Lee 2026-07-09 — never claim desktop-only gameplay). The only mobile limitation is the Companion extension: the match page on mobile leads with a note that the Companion is desktop-only, pointing at the direct lobby link / manual path (results don't auto-report without the Companion). A mobile poster delisted while backgrounded sees a "your game was delisted — repost?" prompt on return.
- R25. The manual fallback copy is honest about its limits: without the Companion, players create a private Karabast lobby and share its link with each other over Discord DM themselves — PTP never grows a paste-lobby-link UI.
- R26. Lobby actions (post/accept/Play Now/join) require Discord login only — no beta gate (consistent with Companion GA). Anonymous clicks on Accept/Play Now/Join go through Discord OAuth with intent preserved (returning to the same action, with a graceful "that game was taken" fallback).

Defaults carried to planning (not blocking): edit/strike the Discord LFG message when a listing resolves if the existing pipeline supports it; per-user ping cooldown (~10 min); waiting state also lists other open games; "listing expired — repost?" prompt at the 2h expiry; casual-match forfeit/disconnect handling inherits from the Swiss Practice lifecycle endpoints; rematch button deferred to V1.1; listings may show a poster-connected presence dot.

---

## Success Criteria

- Real games happen: open games are posted and accepted weekly, and a majority of accepted games reach a shared Karabast lobby (measurable via Companion result ingestion).
- The homepage still serves existing traffic: solo format starts do not crater after the redesign.
- The lobby never looks broken: at zero liquidity it reads as an invitation (post + Discord ping), not a ghost town.
- Companion installs grow measurably after GA, driven by lobby CTAs.
- Handoff quality: `ce-plan` can plan V1 without inventing product behavior — flows, scope, and decisions above are sufficient.

---

## Scope Boundaries

- No invisible matchmaking queue, ever, at this scale — "Play Now" is sugar over the seek list (R8).
- No rating/ELO/ranked play in the lobby.
- No in-PTP game client: all games play on Karabast.
- No manual "paste your lobby link" UI anywhere — lobby linkback is automatic via the Companion (established rule).
- No manual result entry in V1 (results are Companion-reported or absent).
- No spectating in V1.
- V2 (pod play phase, R16–R17) ships as a separate release after V1.
- No new pod-creation formats: sealed pods (2–16 players) already exist; V1 only resurfaces them.
- Avoid organized-play/"tournament" terminology in all UI copy (established rule); use "pod play", "pairings", "standings".

---

## Key Decisions

- Lobby IS the homepage (not a strip or a /lobby subpage): at 10–40 concurrent, visibility is liquidity. Anonymous visitors see it read-only.
- Direction A · Dual Track layout (BGA model) with B's collapse-when-empty behavior; renderings in the brainstorm session (three variants compared).
- Companion-first, heavily pushed, with a small manual fallback note — not a co-equal dual-track UI. Companion goes GA with V1.
- "Play Now" = auto-posted seek, not a queue (Lichess lesson: presets concentrate liquidity; bespoke queues starve).
- Two releases: V1 = homepage lobby + open games end-to-end + pods resurfaced; V2 = pod play phase.
- ~~Cross-set and cross-origin (draft vs sealed) acceptance allowed by default; badges inform self-selection.~~ **Reversed 2026-07-09 (R31): strict same-set + same-format matching only.**
- Sealed pods' "new" value is the play phase, not pod formation (formation already exists).

---

## Dependencies / Assumptions

- Wayfinder extension work happens in the sibling repo (worktree created: `wayfinder/.claude/worktrees/ptp-lobby`, branch `feat/ptp-lobby`); swupod work in this worktree. The extension must support the casual open-game shared-lobby flow (both players into one Karabast lobby with correct deck identity), generalizing what Swiss Practice already does.
- Assumption: existing Discord LFG webhook/channel can carry open-game pings alongside pod pings without spamming (may need batching/formatting tweaks — planning question).
- Assumption: `built_decks` + `card_pools` suffice to define "a deck you can post" (a pool with a locked deck); no new deck storage concept needed.
- Companion GA is a coordinated cross-repo release (extension stores + PTP gating change).

---

## Design Revisions — 2026-07-09 (Direction A v3 mockup review with Lee)

These supersede conflicting details in R1–R26 and the Key Decisions above.

- R27. **No top nav bar.** Slim header only: wordmark, online pill, avatar. The online count includes everyone connected (playing, drafting, deckbuilding); a strip near the board gives the fuller read ("4 open games · 2 pods forming · 23 online").
- R28. **Verb language:** primary verbs are "Play Now" and "New Game" (never "Post an Open Game"); listing actions say "Join" (never "Accept").
- R29. **Opponent decks are hidden.** Listings show player, set badge, format badge, age, and presence (hollow dot + "stepped away" while disconnected-in-grace) — never deck identity/archetype before a game.
- R30. **One rollup + utility track.** Solo/other formats collapse into a single "Casual Formats" entry reusing the existing `/formats` naming and card names (Solo Draft, Solo Sealed, Chaos Sealed, Pack Wars, Pack Blitz, Rotisserie). Below it, a utility track: My Stats · Global Stats · History · Deckbuilder · Join the Discord.
- R31. **Strict matching.** Open games pair same set + same format only (reverses the earlier cross-set default). The Join deck picker filters to eligible decks ("2 of 7 eligible") with ineligible decks greyed + reasoned; the New Game deck choice sets the game's set/format.
- R32. **Private-link games.** New Game offers Public (listed + Discord ping) vs Private link (unlisted, no ping, joinable only via the share URL).
- R33. **Karabast cross-listing.** The lobby board also lists Karabast's public limited lobbies, relayed by the Companion (extending today's count-only `wayfinder:lobby-count` pipe to a named list). PTP-created lobbies are identified by the "protectthepod.com" lobby-name marker (existing `buildLobbyName` convention — the marker doubles as the ad). Non-PTP lobbies carry a yellow warning icon whose hover explains that other simulators generate lower-quality pools and the player risks an unrealistic opposing deck.
- R34. **Create-on-Karabast checkbox.** New Game includes "Also create the lobby on Karabast now" — default ON, Companion required; unchecked or Companion-less, the lobby is created at match time per the standard handshake.
- R35. **Play page → lobby.** Every pool's play page gains a CTA routing to the lobby with that deck preselected (New Game prefilled).
- R36. **Companion-less Karabast section = Companion ad.** When no Companion is detected, the "On Karabast now" section renders the Wayfinder Companion pitch (the one `PluginCTA` component, never hand-rolled) instead of collapsing.
- R37. **Karabast-side joins are first-class.** The moment anyone enters a pre-created lobby from Karabast's side, the listing delists immediately. If the joiner runs the Companion and has a PTP pool, their identity/deck binds to the match as a normal second seat (full two-sided attribution). A non-PTP joiner is supported: the game proceeds, results report one-sided, and the poster sees a soft warning that the opponent's pool came from a competitor/unknown source (quality caveat).
- R38. **Staged rollout via `/lobby`.** V1 ships the lobby at `protectthepod.com/lobby` as an alternate homepage; the existing homepage is untouched. Promotion of the lobby to `/` is a separate, explicitly-approved flip once Lee likes the live page (R5's solo-funnel protections bind at promotion time).

Rendering of record: Direction A v3 artifact (supersedes the three-direction comparison).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R7][Technical] Exact shared-lobby handshake for casual matches: who creates the Karabast lobby (poster or acceptor), and how the second player's Companion learns the lobby — reuse of the Swiss Practice `practiceMatchGameId` minting vs. a new casual-match variant.
- [Affects R10][Technical] Where the "match page" lives: a new route vs. an extension of the existing pool play page + `PlayInstructions`.
- [Affects R9][Technical] Discord ping format/batching for open games so the LFG channel stays useful at higher listing volume.
- ~~[Affects R6][Product-lite] Whether the poster can optionally restrict a listing (e.g., same-set only). Default for V1: no restrictions.~~ **Resolved by R31: matching is always strict same-set + same-format.**
- [Affects R16][Needs research] Pairing rules for casual pod play (rounds count, drops, byes) — inventory what Swiss Practice already supports before designing.
- [Affects R13][Technical] Companion GA rollout mechanics: `isCompanionBeta` removal, store-release sequencing across Chrome/Firefox/Safari.

---

## Next Steps

-> `/ce-plan` for structured implementation planning (V1 scope: R1–R15).
