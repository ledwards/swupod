# Karabast, Arena, and Hearthstone: what to borrow

## Evidence boundaries

Research checked September 30, 2026. **Karabast evidence is the local Karabast-derived Wayfinder replay client**, inspected at HEAD `4da365ba459459f9a509faa81b05b6916df333ec`; the working tree may contain later local changes. It is not a live Karabast usability audit. The public Karabast site did not expose useful controls documentation through the text browser. Do not call the lab a faithful clone.

Arena and Hearthstone evidence below comes from publisher documentation, including explicitly dated historical articles. Neither native client was interactively tested in this task. Exact current shortcuts, target cancellation, and release-to-commit behavior need a recorded current-build check before promising compatibility. Unsupported cells are marked as such rather than filled from memory. Battlegrounds mechanics are not used as evidence for standard Hearthstone combat.

## Compare and contrast

| Area | Karabast-derived source: verified | Arena: publisher evidence | Hearthstone: publisher evidence | PTP design conclusion |
|---|---|---|---|---|
| Primary input | Selectable card click emits a card ID to the game; printed images are non-draggable [K1] | 2021 mobile guide documents taps plus drag-to-cast [A1] | Blizzard describes dragging a hand card into play [H1] | Click/tap baseline; optional drag shares the same action intent |
| Targeting | Engine prompt determines selectable cards, multiple selections, distribution [K1,K3] | 2025 design diary describes deliberate choices about mode selection and self-target warnings [A2] | Magnetic design distinguishes valid targets and attach intent using strong visual feedback [H2] | Show legality and exact intent; do not imply the brightest target is strategically best |
| Inspection | 200 ms mouse hover; 400 ms long press with movement cancellation; leader face flip [K2] | 2021 guide documents hold-to-inspect [A1] | Exact current standard-match gesture not verified | Keep hover/hold previews; keyboard/right-click inspection without per-card buttons |
| Board structure | Space / central leader-base-prompt / ground [K4] | Desktop and phone layouts differ [A1] | Physical play/drop interaction and timed audiovisual beats documented [H1] | Preserve SWU zones; borrow tactile feedback independently of geometry |
| Confirmation | Prompt-specific buttons; resource Done and pass/initiative have click cooldown [K3] | Design team chooses warnings and decision affordances per mechanic [A2] | Universal confirmation/cancellation policy not verified | Match each Karabast completion path; never append a confirmation merely because an action is consequential |
| Automation | Optional single-target auto-resolve defaults false in this fork [K5] | Auto-tap and full-control are documented Magic features [A1] | Exact current automation policy not verified | Do not import mana allocation or priority skipping into SWU |
| Keyboard | Settings lists shortcuts, including pass, initiative, leader, history [K5] | Exact current map not verified | Exact current map not verified | Inventory actual handlers before preserving bindings; never let a bare shortcut instantly concede |
| Building/drafting | Existing PTP already has complex controls worth retaining | 2021 mobile guide uses card selection, explicit pick gestures, filters, and deck list [A1] | Not researched as an SWU draft model | Keep current PTP draft/build semantics and improve the surface |

## Two approaches worth prototyping

**A. Familiar clicks — default.** Select an actionable source, then use its legal action/target. Fast, low motor demand, and consistent with the inspected fork. Costs: selection mode must remain obvious; inspection cannot be confused with acting. Final target selection is the commit point only when that engine prompt completes the action. A modal choice may still follow.

**B. Familiar clicks with optional dragging.** Same underlying decisions, plus dragging for ordinary hand plays and direct attacks. Gains: physical feel and a continuous source-to-target gesture. Costs: release errors, finger occlusion, scroll conflict, pointer cancellation, and more testing. Dragging cannot bypass a mode, payment, replacement, or triggered choice. Do not invent a placement decision when card position has no rules meaning.

The extra-confirmation approach is rejected: it adds interaction cost. Neither a default nor an optional mode should slow an equivalent action beyond Karabast. These are PTP proposals, not replicas of Arena or Hearthstone.

## Transfer the strengths, respect SWU

SWU alternates individual actions. Pass and taking initiative have different consequences. A large undifferentiated End Turn button would hide that distinction. Arena's Magic-specific priority/stops and Hearthstone's turn metaphor are poor direct templates for SWU. Preserve the action vocabulary and sequence supplied by Baize; use feedback, inspection, and physicality as the transferable design ideas. [S1]

Our inference: the best premium experience here is mostly familiar decisions with better spatial clarity, reliable cancellation, and strong acknowledgements. Engine speed helps those acknowledgements; it does not settle target selection or human error.

## Source register

Local paths below are relative to sibling repository `ledwards/wayfinder`, under `apps/replay-client/src/app/`:

- **K1:** `_components/_sharedcomponents/Cards/GameCard.tsx` — `defaultClickFunction`, `handleClick`, token/subcard event propagation, selectable flags, image dragging disabled.
- **K2:** `_components/_sharedcomponents/Cards/GameCard/cardHooks.tsx` — `usePreviewCardPopover`; `_hooks/useLongPress.ts` — inspection timing and movement handling.
- **K3:** `_components/Gameboard/_subcomponents/PlayerTray/CardActionTray.tsx` — prompt buttons, distribution, duplicate-click cooldown. `_hooks/useDistributionPrompt.ts` supplies distribution behavior.
- **K4:** `_components/Gameboard/Board/Board.tsx` — arena ordering, center leader/base stack, central prompt.
- **K5:** `_components/_sharedcomponents/Preferences/PreferencesSubElementVariants/GameOptionsTab.tsx` and `KeyboardShortcutsTab.tsx`. A shortcut label is evidence of advertised intent, not proof every handler works.
- **A1:** Wizards, [MTG Arena mobile design, January 2021](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-january-2021-01-21). Historical interaction documentation; not a 2026 compatibility specification.
- **A2:** Wizards, [Creating Arena Powered Cube, October 2025](https://magic.wizards.com/en/news/mtg-arena/dev-diary-creating-arena-powered-cube). Separates rules implementation, interaction design, and client presentation.
- **H1:** Blizzard, [Hearthstone sound-team interview, 2023](https://hearthstone.blizzard.com/en-gb/news/23964694/inside-battle-net-meet-the-sound-team-behind-hearthstone-s-harmonic-design/). Explicit drag/drop pacing evidence.
- **H2:** Blizzard, [The Art Behind THE SCIENCE, 2018](https://hearthstone.blizzard.com/en-us/news/22552047/non-printable). Magnetic targeting/attachment feedback and avoiding visual strategic bias.
- **S1:** Fantasy Flight Games, [SWU gameplay preview](https://starwarsunlimited.com/articles/launch-sequence). Supports the action/initiative distinction; production mechanics must follow the current comprehensive rules and tested engine revision.
