# Native play UX decision pack

September 30, 2026 · Design proposal, not production implementation.

**Direction: make the default familiar to a Karabast player.** Keep click/tap selection, a visible current prompt, central leaders/bases, space left and ground right. Improve legibility, feedback, recovery, and touch access. Offer dragging only as a shortcut to the same actions. The approved environmental art is a presentation layer, not a reason to change the rules interaction model.

The user has accepted Karabast familiarity as the default and the customizable table direction. Detailed recommendations below remain proposals to evaluate, not additional accepted requirements.

## Hard interaction constraint

For every equivalent action and game state: **PTP clicks/taps ≤ Karabast clicks/taps, and PTP confirmations ≤ Karabast confirmations.** No average-across-actions loophole. Optional dragging may shorten or replace a gesture; it cannot add a step. Cautious-confirmation mode and persistent per-card Inspect buttons are removed. Required rules choices remain, with no redundant approval afterward.

## Read and try

1. [Reference comparison](01-reference-comparison.md): what is verified, what transfers, what does not.
2. [Interaction decisions](02-interaction-decisions.md): playing, attacking, targeting, resources, prompts, confirmation, undo, keyboard, networking.
3. [Board and device design](03-board-and-devices.md): layout, inspection, hidden/public information, touch, density, effects, accessibility.
4. [Whole-session flow](04-session-flow.md): home, draft/open, build, saved decks, queue/lobby/invites, recovery, results.
5. [Prototype and evaluation guide](05-prototype-and-evaluation.md): scenarios, measurement, acceptance gates, and unresolved decisions.
6. [Interactive comparison lab](../interaction-lab.html): eight scenarios, two input approaches, two prompt placements, two inspection treatments, and all table environments.

Existing studies: [visual board](../real-board.html), [draft](../workshop.html?mode=draft), [builder](../workshop.html?mode=builder), [journey wireframes](../index.html). None is an authoritative game client.

## Recommended defaults at a glance

| Decision | Proposed default | Alternative to evaluate |
|---|---|---|
| Input | Karabast-like click/tap source → legal action/target | Optional drag shortcut; never drag-only |
| Routine single-target action | Last explicit legal selection commits | Optional drag to the same legal target; no added confirmation |
| Inspection | Desktop hover/right-click; touch long press; keyboard inspection | Pinned inspector on wide screens |
| Layout | Space left, central bases/leaders, ground right; local player below | Player-area leader/base layout remains optional |
| Card presentation | Full faces first | Cinematic units; full inspection always available |
| Prompt | Center on desktop, reachable dock on phone | Side decision rail on wide screens |
| Action completion | No more clicks/confirms than the equivalent Karabast action | Improve inline feedback without adding acknowledgement steps |
| Automation | Required mechanical transitions only | Opt-in engine-certified forced-choice resolution later |
| Mobile | Complete tap path, scroll distinct from action | Optional drag handle with visible cancellation |
| Build | Preserve all existing controls; prominent native Play when saved/eligible | Optional focused build view, never removed functionality |
| Multiplayer recovery | Authoritative resync; no blind action replay | No optimistic rules-state mutation |

## Why this is the starting point

The largest risk is changing a familiar interaction while simultaneously introducing a new native game service. Ship visual ambition with behavioral familiarity. Judge extra motion and shortcuts by completion/error evidence, not by how impressive they look in a demo.

These are design tradeoff documents, not an engine integration plan. Before implementation, reconcile the exact upstream Baize branch, adapter prompt coverage, and current live Karabast gestures. No source inspection here certifies rules parity or current live-client equivalence.
