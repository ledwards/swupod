# Prototype guide and validation plan

## What is runnable now

[Open the interaction lab](../interaction-lab.html). It uses the same actual SOR assets and table environments as the visual studies. It starts in familiar click mode and the Karabast-derived arena orientation. A comparison mode never claims to reproduce Arena or Hearthstone exactly.

| Scenario | What to try | What it isolates |
|---|---|---|
| Attack | Marine → Guard; try the invalid space target, inspect, cancel | Source/target clarity and click vs drag without additional confirmation |
| Play a card | Click Marine to play; optional drag into ground; wrong arena cancels drag | Play intent, destination, cost acknowledgement |
| Resource | Select two hand cards → Done; change selection first | Multi-selection, count, separate irreversible completion |
| Allocate | Split a fixed three-point sample effect using +/- | Dense choice controls, exact total, edit-before-submit |
| Leader | Select Luke → Deploy; inspect the reverse | Action versus inspection and transformation |
| Attachments | Expand a unit's two sample child objects; choose one | Parent/child identity, explicit small-target alternatives |
| Initiative | Compare one-click Pass and one-click Take initiative | Different consequences, stable action names |
| Reconnect | Send one action, lose acknowledgement, reconnect | Pending lock, uncertain commit, resync without duplication |

The allocation and attachment scenarios are generic prompt fixtures, not claims about an included card's real ability. Attack/play/leader outcomes are scripted. Source data is real; legal-action generation and multiplayer are not connected. A prototype reset is not an in-game Undo.

Controls: A familiar clicks; B the same clicks plus mouse/pen dragging directly from eligible card faces. No cautious-confirmation mode, per-card Inspect buttons, or drag-handle buttons. Inspect with hover, right-click, long press, or I on a focused card. A complete click/tap/keyboard path remains available. Inspector can be dialog or pinned; narrow screens use a dialog. Prompt can be central or side rail; phone moves it below the board. Settings also change theme and full/cinematic presentation.

The lab records local elapsed time, action activations, invalid attempts, cancellations, and accepted fixture commits. Download produces local JSON only. These are exploratory observations, not user-study results, game analytics, or performance certification. Mode/scenario changes reset a trial; export before switching if keeping it.

## How to compare fairly

Recruit existing Karabast players, SWU players unfamiliar with digital clients, and touch-first players. Suggested first qualitative round: 6–8 people across those groups, not a statistically powered experiment. Counterbalance mode order; first-run learning otherwise makes the last mode look faster. Use the same scenarios/artwork. Ask each person to explain what will happen before they commit.

Record completion without coaching, unintended commits, invalid targets, cancellation success, inspection confusion, time, and subjective confidence. Distinguish intended slow strategic thinking from control friction. Do not collect hidden deck contents or chat in production telemetry by default. Consent and scope of research recording need to be settled before external testing.

Suggested acceptance gates (proposals, not measured results):

- Every essential task completes without dragging, hover, or keyboard shortcuts.
- No action submitted on scroll, long-press release, pointer cancellation, or inspection.
- Pending/uncertain commands cannot be submitted twice.
- Users correctly distinguish Pass from taking initiative in the test explanation.
- Classic mode remains at least as understandable to Karabast users as the reference client in matched tasks.
- Add dragging only if users find it useful and accidental commits do not increase. No variant may exceed the per-action Karabast click/confirmation budget, even if users report feeling safer.

## Production validation matrix

| Dimension | Required cases |
|---|---|
| Device/input | Desktop mouse and keyboard; iPad touch plus trackpad; iPhone portrait/landscape; Safari and Chromium/Firefox |
| Display | 360–430 px phone widths; tablet split view; desktop; browser zoom; safe areas; long/localized names |
| Density | Empty, typical, 20+ units, many attachments, large hand, long discard, offscreen target |
| Rules decisions | All prompt families in interaction catalog, optional zero, exact/max selection, repeated copies, changed legality, no legal action |
| Timing | Rapid double tap, moving pointer at release, pointer leaves window, long press then scroll, focus lost, slow/rejected response |
| Recovery | Refresh, background/resume, reconnect before/after commit, opponent leaving, invite race, cancelled queue matched concurrently |
| Accessibility | Keyboard completion, visible focus, screen-reader labels/prompts, reduced motion, contrast, no color-only status |
| Security-visible UX | No hidden card identity in DOM/logs/accessible text; inspection never changes seat visibility |

Browser automation verifies the lab's scripted mechanics and viewport overflow. It cannot establish iOS gesture feel, screen-reader usability, current Karabast parity, engine rules correctness, or live PvP recovery.

## Decisions to settle next, in priority order

1. Record a current live Karabast session and reconcile exact play/attack/menu shortcuts with the local fork.
2. Test the baseline first. Decide whether dragging belongs at launch or as a later opt-in.
3. Record per-action Karabast completion steps, including initiative, pass, deployment, mulligan, and concession. Any contextual warning must fit the same budget; prefer non-blocking text.
4. Choose center prompt versus wide-screen side rail from target travel and crowding tests.
5. Approve phone crowded-board/target-list composition on physical iPhone and iPad.
6. Verify every Baize decision can be represented with stable IDs, legality, visibility, and authoritative cancellation boundaries.
7. Set inactivity, disconnect grace, abandonment, and takeback policy before implementing those flows.

## Handoff order

First establish the classic control contract against Baize fixtures and replay cases. Then ship table appearance and responsive inspection around it. Validate complex prompts and recovery before adding drag shortcuts or advanced auto-resolution. Reuse production PTP components and the Karabast-derived interaction structure where appropriate; these portable HTML studies are not production component replacements.


## Automated checks completed for this revision

Chromium and Firefox passed all eight fixtures, two input approaches, valid/invalid mouse drags, keyboard attack/cancel, inspection without selection changes, one-submission reconnect recovery, both prompt placements, and five viewport sizes (360, 390, 768, 1024, 1500 pixels). Chromium touch emulation additionally passed tap targeting and synthetic long-press inspection without a commit. These are scripted prototype checks, not participant results. See [machine-readable results](../interaction-lab-validation.json) and the sibling `verify-interaction-lab.mjs` script.

The phone lab places the prompt below the board to expose each fixture clearly; the fixed/reachable production decision dock and crowded-board target list are specified in the device document but are not implemented here. Cross-device layout screenshots do not establish their usability.


## Click-budget acceptance gate

Capture a paired trace in current Karabast and PTP for each representative state, on the same input device. Count all activations from an idle action prompt to accepted submission, including source selection, action menus, target selection, Done, and any confirmation. Track game-required choices separately from redundant approvals. A PTP path fails if either its activation count or confirmation count exceeds the reference, regardless of improvements elsewhere.

Current fixture budgets: attack 2 clicks or 1 drag; simple hand play 1 click or 1 drag; deploy 2 clicks (leader, named action); initiative 1; single attachment 2 (expand, child); select two resources 3 (two selections, Done). Allocation uses point edits plus the decision's Done step. These are tested prototype budgets, **not measured current Karabast counts**. Every unmeasured counterpart remains a parity gate before implementation acceptance. If Karabast is faster, reduce PTP's path.
