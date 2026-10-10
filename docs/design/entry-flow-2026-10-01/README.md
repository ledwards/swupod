# Entry flow study — October 1, 2026

Run from the repository root with `python3 -m http.server 4318 --bind 127.0.0.1`, then open http://localhost:4318/docs/design/entry-flow-2026-10-01/.

Clickable mockups, fictional data, no API writes. Home, Draft, Sealed, saved-deck Play, public lobby, public waiting, private invitation, empty library, and table preferences. The review toolbar switches screens and toggles returning/first-time player states. Desktop and phone screenshots are alongside the source.

## Grounding

- Inspected localhost:3000, served from `.worktrees/codex/native-limited-play` with active uncommitted work.
- `codex/native-limited-play` at e8f97aa6: native launch, deck library, private/public play; current homepage still splits Solo / With Friends / Deckbuilder.
- `codex/available-to-all` at f4e7eb98: Homeworlds public availability banner.
- `codex/table-environments` at 208f59f3: preference continuity; game-client ownership of environmental presentation.
- September 30 native-limited-play requirements and whole-session UX: three entry choices, deck continuity, strict public compatibility, explicit private relaxation, no mandatory Companion handoff, optional Stats prominence.

## Proposed design

Draft / Sealed / Play are primary. Choose solo versus pod within format setup. A returning-player resume strip goes above entry choices; the sample uses a saved legal deck. Reconnectable games should take priority in implementation. Stats and other formats stay secondary. Theme choice is optional and outside the critical path. Pack availability is distinct from supported native-play eligibility; SOR decks are illustrative, not a coverage claim.

Build/draft/game screens are explicit handoff boundaries rather than simulated full implementations. Sign-in preservation, live availability, actual eligibility, reconnect state, preference persistence, invitation expiry, and service failure remain production integration work. Prototype preferences persist only during the current page session.

Verified with Playwright: selected deck survives public/private transitions, queue cancellation, private mismatch label, 8-pack selection, first-time empty library, no horizontal overflow at 390px on six screens, and no JS page errors. Screenshots checked visually. No production components changed.

## Style correction

Restored production background layers, real PTP logo, Button.css variants, and SiteFooter content/styles. Removed marketing headlines/descriptions, directional CTA arrows, and table-preference rows. Homepage utilities use outlined buttons. Production styling takes precedence over prototype styling.

## Entry-flow revision 3

Restored “Welcome to Protect the Pod.” beside the Homeworlds notice. Account destinations live in a dropdown; removed duplicate product-header navigation. Pods and public lobbies appear side by side. Utility buttons reuse production card-art hover CSS. Draft and Sealed use expansion key-art buttons and a keyboard-accessible graphical set-picker dialog. Setup CTAs sit in the summary panel with green ready styling. Removed account helper and Play’s new-pool row. Every deck has Edit; competitive decks lock only during an active event. Play vs AI is a beta-only mockup entry. Review toolbar toggles beta access and competitive event state; no real game launch or authorization changes.

Verified picker selection and summary propagation, pack-count CTA, all deck Edit paths, competitive lock/unlock, beta AI visibility, account dropdown, hover artwork, Escape dismissal, and mobile layout. All use sample state.

## Unfinished-session resume

“Pick up where you left off” appears only for an opened pool without a built deck, an unfinished pod, or a competitive event still in progress. Completed saved decks alone do not trigger it. Each unfinished activity has its own resume action and preserves its context. Concurrent unfinished activities appear as rows under one heading. The review toolbar’s Unfinished selector and competitive-event checkbox exercise these sample states. Verified hidden/visible states, concurrent rows, and all three resume destinations.

## Latest-set entry artwork

Homepage artwork must follow the latest set: three common cards for Draft, three distinct complete booster fronts for Sealed, and the two most popular leaders by usage for Play; use that set’s starter/Spotlight leaders if usage data is unavailable. Current mockup fixtures use Homeworlds Grand Army Marine, Wookiee Protector, and Starlit Purrgil; all three HMW booster arts; Chewbacca and Grand Moff Tarkin. The local HMW leader statistics returned zero matches for every leader; the public endpoint did not return usable JSON, so the explicit starter fallback is used. This static mockup’s current fixtures are HMW; production implementation must resolve the latest set and refresh imagery from canonical data rather than hardcode these cards. Verified all rotated booster bounds fit inside their artwork region.

## AI opponent selection — accepted October 1 follow-up

Solo setup is labeled “Practice Solo.” Pod visibility uses Public / Private buttons, and the summary preserves that choice. AI practice is one game; defer the previously requested solo-draft tournament bracket. For sealed, default to a newly rolled sealed pool with an automatically built legal deck using the player's set and pack count. Allow generating another. For draft, offer the decks built by opponents from that same draft. In either format, permit replacing the default with one of the user's legal saved decks of the matching format. Preserve the player's selected deck and the chosen opponent deck into launch. Beta access remains required.

The clickable mockup simulates generated decks and draft seats; it does not open real pools, build real decks, or launch AI games. The generated/own-saved choice, draft seat selection, same-format filtering, and single-game handoff are interactive. Verified these paths plus beta gating, Public/Private persistence, and 390px layout. This decision extends the earlier native-PvP-only design scope for beta AI practice without introducing a solo tournament bracket.
