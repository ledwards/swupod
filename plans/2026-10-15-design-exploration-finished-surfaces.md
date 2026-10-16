# Design exploration: Play, Draft/Sealed setup, draft play, deck building

> **Design exploration only. Not a plan of record, not approved for building.**
> These surfaces are already finished for alpha (Lee, 2026-10-15). The comps below were drawn during the style-guide audit, before that scope was known. They're kept as ideas to revisit later; nothing here should be implemented without a fresh decision.

**Comps:** https://claude.ai/artifact/EKVRau8EqC6yJ9ptc2NyHF (rows "Deck Building", "Draft & Sealed Setup", "Live Draft & Sealed", "Play", "Pod Play & Runs").
**Drawn from:** the code as of 2026-10-13, not the alpha pages that have since shipped, so some comps describe a page that already looks different.
**Related plan of record:** `plans/2026-10-13-style-guide-page-migration.md` (everything else).

## Deck building

| Comp | Route | Idea |
|---|---|---|
| DeckBuilder | `/pool/[shareId]/deck` | Fold the header buttons and sticky bar into one summary panel (leader + base, Deck 30/30, Sideboard, Arena/Playmat/Table, Clone, Stats, Copy Link, one primary "Ready to Play"). Deck in cost columns with stacked cards; sideboard grouped by aspect with sort/filter/Fade-Hide/+ In Aspect/+ All. Stats drawer on the right (Summary, Cost Curve with the pool as a dashed ghost, Aspects). Fully themed, i.e. it ignores DESIGN.md's legacy near-black exception. |
| DeckbuilderBuild | `/deckbuilder/build` | The whole set is the pool. Leader and base collapse to the current pick with "All Leaders (18)" / "All Bases (16)". Set grid with aspect icon toggles and cost groups, "2 in deck" per card. A Deck (24) list sidebar with −/+ steppers and a curve (a new layout; today it reuses pool-vs-deck). Primary disabled as "Finish Deckbuilding to Play" below 30. |
| DeckStats | `/pool/[shareId]/deck/stats` | Archetype name in the header title; identity panel with leader/base art, Draft Log, Record. Tabs Build / Pool / Game Log / Performance / Matchups / Meta. Build tab as a grid of panels (Summary, Aspects, Cost Curve, Arena & Type, Rarity icon + word, Traits, Keywords). Pool, Game Log, Matchups, Meta not drawn. |
| Sets | `/deckbuilder`, `/sets` | "Latest" row of two wide cards (newest set, a Coming Soon teaser with a lock), then an "All Sets" grid of pack-image cards. |

## Draft and Sealed setup

| Comp | Route | Idea |
|---|---|---|
| DraftSetup | `/draft/setup`, `/sealed/setup` | Title in the header; two-column EntrySetup: options (set picker, Who's Playing?, visibility, packs-per-player for Sealed) and a summary aside with the pack fan, details and one "Create Pod" primary. |
| DraftNew | `/draft/new`, `/draft/solo`, `/sealed/new` | "Pod Options" panel (Public/Private, Swiss Rounds or Competitive Sealed with the Friend of the Pod badge, 6/8 for Sealed), then Latest Sets and All Sets pack grids. Solo hides the options. Picking a set creates the pod, so no primary. |
| SealedPod | `/sealed/pod` | DraftLanding layout: Create New Sealed (primary), Competitive Sealed with its rules as visible text, Join a Sealed Pod rows, My Sealed Pods rows, lobby chat on the right. |
| SealedPodLobby | `/sealed/[shareId]/pod` | Set name in the header. Panels: Your Opponent (or bye), Your Deck (Copy Link primary, Edit Deck, Practice Hand, Copy JSON, Download, Deck Image), Play Your Match, Pod Status (6/8 Ready seat grid), Join the Community, pod chat. Play Your Match would follow the Oct 13 Karabast rule: our table first, "Copy deck link for Karabast" + plugin nudge second. |

## Draft play

| Comp | Route | Idea |
|---|---|---|
| LiveDraft | `/draft/[shareId]` | "Pack 1 Pick 4" border-labelled panel with timer bar, set chip, the pack with one card selected and a raised confirm strip (Confirm Pick primary, icon-only Deselect). Beside it a "Table (8)" seat list with pick status, timers, pass direction and Pause, plus chat; "Your Picks (3)" below. Leader thumbnails, Cards 3/42, Table Setup, Mute and Cancel Draft (danger + trash) in one toolbar row. Chat drawn inline (the real one is a drawer). |
| SealedOpen | `/sealed/[shareId]` | Two states: opening (latest pack's cards above a grid of pack images; Open All primary, quiet Skip to Pool) and pool review (pool name and byline in the header, Build Deck primary + Copy Link, each pack a compact labelled panel). |
| DraftDeck | `/draft/[shareId]/deck` | The route only redirects, so: a deck-builder-shaped skeleton, plus sign-in-required and error states. |

## Play

| Comp | Route | Idea |
|---|---|---|
| PlayAi | `/play/ai`, `/pools/[shareId]/play/ai` | Your Deck and AI Opponent side by side; one "Play vs AI" primary; saved-deck picker state; complete state with Rematch primary and Convert to Best of Three secondary. |
| PlaySolo | `/play/solo` | Selected Deck panel, collapsed Leader Draft Results; Copy Deck JSON / Copy Deck URL instead of Karabast steps. (Alpha-dead page; won't be redesigned.) |
| PlayTest | `/play/test` | Two seat tiles, Player 2 primary as the next step; a Deck Under Test panel and Open/Not Opened seat tags (would need a seat-presence signal). |
| OpenGame | `/g/[shareId]` | Players and Game panels (Bo1/Bo3 for the host, Online/Stepped Away tags), Your Deck pane, danger Cancel This Lobby. Start Game on our table as primary, Karabast copy-link secondary (today the page is built around Karabast). |
| GameTable | `/games/[matchId]` | The PTP stub around the table: two seat panels and a Result panel with three equal Win/Loss/Draw buttons (Loss not red). |
| GameReplay | `/games/[matchId]/replay` | A match summary and a readable "Events (7)" timeline with a Summary/Raw toggle instead of the raw JSON dump. |
| PodPlay | `/pools/[shareId]/play` | Choose Your Deck (search, All/Draft/Sealed, set, Complete decks only) beside a summary panel stacking the five play choices with Find Opponent as the one primary. |
| PodPractice | `/pools/[shareId]/play/practice` | Two event cards (Swiss Rounds primary, Elimination Bracket secondary) with fact chips and a small diagram; Pod Decks expanded. |
| PodBracket | `/pools/[shareId]/play/bracket` | "Your Matchup" hero (Play Game 2 primary) above a three-column bracket; your match ringed; W/L tags as words + color. No connector lines. |
| PodSwiss | `/pools/[shareId]/play/swiss` | Same hero; Pairings with a round toggle beside Standings; complete state with Final Standings and Start New Swiss Rounds primary. |
| Run | `/runs/[runId]` | The Play vs AI run view; Rematch primary, Convert to Best of Three secondary. |
| RunSideboard | `/runs/[runId]/sideboard` | Search + Saved Build toolbar; Leader and Base panels; Your Deck (30) and Sideboard (13) card grids; sticky "30 / 30 · Legal deck" bar with Continue to Game. |

## Cross-cutting ideas worth keeping

- One accent primary per view, even where today's code has two (Rematch vs Convert to Bo3; five equal play choices).
- Result buttons (Win/Loss/Draw) shouldn't use danger styling for Loss.
- Aspect icons, never aspect-colored text, on build cards and leader names.
- Raw JSON views get a readable summary first, raw on request.
