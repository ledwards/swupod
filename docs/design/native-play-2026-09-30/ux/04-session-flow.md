# The whole-session UX

Preserve the accepted limited-first native PvP direction. The user should carry a deck and a clear next action through the session. This document compares alternatives; it does not reopen settled scope such as AI later or Karabast export being secondary.

## Home and entry

| Choice | Recommendation | Tradeoff / recovery |
|---|---|---|
| Three versus four entries | Draft / Sealed / Play; Stats optional fourth | Stats can support repeat use but adds a competing destination; measure usage before making it equal |
| Resume versus new session | Active game/rejoin first, then unfinished draft/build | Avoid silently launching a second activity; a reconnectable game must be easy to recover |
| Play first | Choose a saved eligible limited deck | Empty state offers Draft/Sealed; unsupported deck explains why without exporting elsewhere |
| Discovery before deck | Keep as secondary Browse lobby path | Let users browse, but preserve the chosen lobby through compatible deck selection |
| Karabast export | Secondary utility in deck export menu | Existing integration remains available; no installation/copy-paste detour in native play |

## Draft and sealed

Keep the skeuomorphic tabletop around the existing pick workflow. Default to a single click/tap selecting a candidate and a separate Confirm pick. Compare optional double-click/drag confirmation only after accidental-pick testing; drafting is irreversible enough that saving one click may not be worth it. Inspection must not submit a pick. Keep original pack order available even when grouping by cost or aspect.

Persist reviewable picks, pool counts, pack/pick identifiers, pod status, and return-to-pick control. On phone, review can be a sheet but the current pick and timer status remain apparent. Do not require dragging or hover. If there is a timer, its server policy, expiry selection, and background behavior must be explicit; the static seat ring in the workshop proves none of this.

Sealed opening may be atmospheric, but Open all/Skip must reach the same pool immediately. Replaying a reveal is cosmetic, not a new random pool. Continue to Build becomes the clear next action when the pool is ready. Player choices and generated pool identity survive reload.

## Deckbuilding

**Recommendation: reskin the workspace, preserve the controls.** Keep pool/deck/sideboard, sorting, grouping, search/filter combinations, grid/arena/list, density, leader/base selection, aspect-cost information, bulk operations, statistics, and utilities. Use opaque toolbar surfaces against the table. See the existing [preservation matrix](../control-preservation.md).

| Approach | Benefit | Cost | Recommendation |
|---|---|---|---|
| Full workbench | Expert speed, familiar controls | Dense on phone | Default desktop; responsive disclosure on phone |
| Guided sequence: leader → base → cards | Easier first-time orientation | Interrupts experienced iterative building | Optional first-use guidance, not mandatory wizard |
| Minimal cinematic table | Strong visual focus | Hides filters, counts, and validation | Optional presentation only; not the sole builder |
| Click/+/- movement | Precise, accessible, reversible | Less physical | Baseline; explicit sideboard destination |
| Drag movement | Tactile and fast for bulk spatial work | Misdrop/scroll ambiguity | Optional with same destination validation and undo |

Autosave has visible Saving / Saved / Save failed states. Play uses an exact saved legal deck version; it must not launch an old deck while the screen shows new edits. Show why Play is unavailable and offer direct correction. Retain bulk-edit undo where existing behavior supports it; building reversibility does not imply in-game takebacks.

Native Play should be prominent once valid. Avoid a persistent modal begging the user to play or a confetti interruption while they are still tuning. An inline ready state and clear button provide the push the user requested.

## Lobby, queue, and private links

Use three explicit choices: Find opponent, Browse games, Invite friend. Preserve deck, set, format, and pack count throughout. Public matches remain strictly compatible; private mismatch is an explicit shared condition, never an accidental filter bypass.

A unified queue/public-listing backend is a proposal, not accepted architecture. UX must avoid creating two competing waits for one player. Whichever approach is implemented, show one waiting state, cancel reliably, and resolve simultaneous cancellation/join authoritatively. Do not display fabricated wait estimates or bots while human matchmaking is empty.

Private flow: create invitation → copy link → waiting room → friend signs in/selects compatible deck → both ready → game. Link copying is user-controlled; no automatic Discord messages. Preserve invitation context through authentication and deck creation. Distinguish expired, full, cancelled, and unavailable links, each with a recovery action. A link does not grant the host's seat. Keep an opponent's deck identity hidden before play where the existing product policy requires it.

## Game startup, recovery, and completion

| State | User-facing treatment | Decision still needed |
|---|---|---|
| Loading assets / waiting for opponent | Distinct status, deck identity, reconnect/cancel where safe | Startup timeout policy |
| Unsupported card/deck | Specific blocker and edit/change-deck route | Exact engine support manifest |
| Opponent thinking | Stable board, clear actor indicator | Inactivity and clock policy |
| Local connection lost | “Reconnecting — actions paused”; preserve visible last-known board | Grace duration and server restart recovery |
| Action sent, acknowledgement lost | “Checking last action”; fetch command status/current state | Adapter support for idempotency and state versions |
| Opponent disconnected | Inform without declaring a win | Abandonment and result policy |
| Game over | Authoritative outcome and short cause; exact deck versions | No client-inferred result |
| Rematch | Each player explicitly accepts; waiting/declined/left states | Same versions initially; edits begin fresh preparation |

Result actions: Rematch, Find another opponent, Adjust deck. Existing organized pod series/standings must retain their rules; casual single-game behavior does not overwrite them. Stats is a useful destination from results, but AI statistics remain a separate future category.

## Onboarding and settings

A returning Karabast player should not need a tutorial to attack. Offer a short optional control guide and an isolated practice interaction (not a promised AI match). Explain inspect, select, cancel, Pass, and Take initiative. Show context-specific help when an invalid target is chosen. Keep controls and visual preferences separate, with per-device layout preferences where appropriate. A theme change cannot reset the active prompt.
