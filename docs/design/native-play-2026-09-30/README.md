# PTP native play — first design pass

September 30, 2026. These are review artifacts, not changes to the live application.

## Interaction research and prototypes

[Open the UX decision pack](ux/index.html) for the Karabast/Arena/Hearthstone comparison, control tradeoffs, board/device design, full-session flows, and evaluation plan. [Try the interaction lab](interaction-lab.html) to compare familiar clicks and optional dragging across eight fixtures, without extra confirmations.

## Customizable table studies

- [Gameplay + table options](real-board.html) — seven environments, full/cinematic cards, central/player-area leaders and bases, adjacent draw/discard piles.
- [Draft table](workshop.html?mode=draft) — interactive sample pack and pick tray.
- [Deckbuilding table](workshop.html?mode=builder) — dense controls on the same physical surface.
- [Control preservation and limitations](control-preservation.md).

## Real-card second pass

The latest [real-card battlefield](real-board.html) uses intact catalog images, real leader/base faces, and the unchanged SWU card back above a skeuomorphic command-table environment. The background material is a generated static asset; all cards, text, counters, and interactions remain live HTML/CSS/JS. See [implementation evidence and limitations](real-board-notes.md), [desktop screenshot](real-board-desktop.png), and [phone screenshot](real-board-phone.png). The earlier studies below remain available for comparison.

## Open the studies

- [Review gallery](review.html) — generated visual target beside the browser implementation.
- [Flow wireframes](index.html) — eight clickable screens, phone-width toggle, optional Stats entry.
- [Interactive battlefield](board.html) — real HTML/CSS, local card art, card inspection, targeting/impact previews, history, reduced motion, and a crowded-board toggle.
- [Requirements](../../brainstorms/2026-09-30-native-limited-play-requirements.md).

Open the HTML files directly, or serve this directory locally:

```sh
python3 -m http.server 4387 --bind 127.0.0.1 --directory docs/design/native-play-2026-09-30
```

Then visit `http://127.0.0.1:4387/review.html`. There are no remote scripts or runtime dependencies in these standalone studies. Local Barlow is used when installed, with a system fallback. Production should use the existing app font assets and shared Button/Card/Modal components; these portable HTML artifacts are not production component replacements.

## What to judge

1. Is the visual target sufficiently beautiful and professional? Its atmosphere comes from a restrained command-table surface, lighting, contact shadows, card art, and shallow perspective.
2. Is the browser study's simpler treatment a useful baseline? It implements actual depth/hover/touch behavior, while leaving the richer illustrated material work to a later pass.
3. Does the phone hierarchy preserve enough of the game at once? The same two arenas remain side by side; hand and full-card inspection are touch-accessible.
4. Do the flow wireframes make native play the obvious next step? Compare three homepage entries with four using the Stats toggle.

## Visual target versus implementation evidence

| Element | Generated target | Browser study / next work |
|---|---|---|
| Dark command table | Detailed illustrated surface and beveled panels | CSS gradients, a procedural noise texture, inset borders and shadows are implemented. Richer environmental art could be a static asset. |
| Card depth | Shallow perspective and contact shadows | CSS perspective, transform, and layered shadows are implemented; phone cards flatten. |
| Card faces | Generated illustrative names, stats, and rules text; not authoritative | Real SOR faces from the repository card catalog, plus compact art/name/stat projections and full-card inspection. |
| Selection | Mint rim, amber target, curved targeting arrow | Mint/amber highlights and target click/impact preview are implemented. The curved connecting arrow is not implemented. |
| Motion | A still image cannot demonstrate it | Card lift, hand inspection lift, and impact preview exist, with reduced-motion support. |
| Touch | Desktop composition only | Dedicated phone composition, tap inspection and target selection; portrait and landscape viewport checks. |
| Game rules | No rules evidence | No engine connection. This is not a playable rules implementation or a claim of Baize parity. |
| Multiplayer | Not represented | Flow simulation only; does not create listings, sessions, invitations, or results. |

The generated image was made with the built-in image-generation tool. The complete final prompt is saved in [generation-prompt.txt](generation-prompt.txt); the unchanged output is [board-concept.png](board-concept.png). It establishes an achievable-looking art direction, not a promise of identical output, measured performance, or correct SWU card content.

## Interaction coverage

Wireframe route buttons are deliberately simulated. Draft/opening is represented by an existing-workspace placeholder; those established screens have not been redesigned here. The selected saved deck is a fixed example. Stats is a placement toggle, not a new statistics screen. The invitation copy button copies a local preview URL only; permission denial presents a manual-copy fallback.

The battlefield supports inspecting every sample card, previewing a ready ground unit targeting an opposing ground unit, cancelling that preview, viewing history, and showing 20 units. No action modifies rules state. It does not yet show mulligan, resource selection, multi-target prompts, deployed leaders, attached upgrades, captured cards, disconnect overlays, or full accessible game navigation. Those are required interaction-design work before implementation, not additional product scope decisions.

Phone landscape currently allows vertical scrolling; it is not a validated full-viewport landscape game layout. Crowded-board mode tests wrapping and tap inspection, not a final answer to arbitrary board density. Actual iPhone/iPad hardware, Safari behavior, screen-reader navigation, contrast audits, and frame/memory budgets remain unverified.

## Validation completed

Local Chromium at desktop 1440×960, phone 390×844, iPad-sized portrait 1024×1366, and phone landscape 844×390. No page-level horizontal overflow or JavaScript errors were observed. Interaction assertions covered queue entry/cancel, relaxed private invitation text, rematch waiting for consent, tap card inspection, target selection, reduced motion, and 20-unit board rendering. The screenshots are snapshots of these artifacts, not live game screenshots.

The requirements review clarified the difference between confirmed direction and proposed defaults; added explicit unavailable/unsupported-deck recovery; made seat ownership, authoritative results, and hidden-information boundaries explicit; and carried external-listing migration into planning. The final engine branch and disconnect policies remain identified dependencies.

## Screenshots

- [Desktop battlefield](board-desktop.png)
- [Phone battlefield](board-phone.png)
- [Phone inspection](board-phone-inspect.png)
- [Phone crowded board](board-phone-crowded.png)
- [Tablet portrait](board-ipad.png)
- [Phone landscape](board-phone-landscape.png)
- [Home wireframe](wireframe-home.png)
- [Deck selection](wireframe-decks.png)
- [Deck ready](wireframe-build.png)
- [Opponent discovery](wireframe-opponents.png)
- [Queue](wireframe-queue.png)
- [Private invitation](wireframe-invite.png)
- [Accept invitation](wireframe-join.png)
- [Post-game](wireframe-result.png)
- [Phone flow](wireframe-phone.png)

## Asset provenance

Card image source URLs and printed metadata are in `assets/cards.json`, copied from `src/data/cards.json`. Leader portraits use the corresponding leader-unit reverse faces from that same catalog. These reference assets are included for local design review; the generated card content must never become source data for the game.
