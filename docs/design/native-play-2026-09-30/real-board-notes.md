# Real-card battlefield: browser rendering proof

This study keeps the actual PTP catalog and card back while restoring the skeuomorphic environment from the original visual target. Open `real-board.html` using the local HTTP server, or visit the running preview at `http://127.0.0.1:4387/real-board.html`.

## What is real

- Every visible card face is an intact catalog image, rendered as an image element without replacing its frame, name, cost, rules text, or stats. Leaders and bases use their real landscape faces; leaders also expose their actual reverse face in the inspector.
- Face-down hands, resources, and decks use `public/card-images/card-back.png`, copied unchanged and SHA-256 verified against the original.
- `real-board-data.json` holds 18 cards selected from `src/data/cards.json`. Inspector names, printed rules, cost, power, HP, traits, and source URLs come from that data, not invented display values.
- The physical table now uses a generated EMPTY environment asset, `assets/command-table.png`, beneath the live interface. It supplies worn metal grain, machined seams, screws, and baked material lighting. `table-materials.css` combines it with responsive inset edges, warm/cool tinting, and contact shadows. Card perspective, selection, hand fan, and motion remain CSS; the targeting arc remains SVG. No cards, rules, counters, or controls are baked into the environment asset. There is no WebGL dependency.
- Barlow is the existing PTP type family. This artifact serves it locally; source: Google Fonts Barlow CSS and its referenced font files. `assets/Barlow-OFL.txt` contains its license.

## Working interactions

The initial position selects Battlefield Marine and highlights Cell Block Guard, whose printed Sentinel ability restricts this example attack. Click the highlighted Guard to run the fixed attack sequence: two printed 3/3 units deal damage and both leave the board. The discard counters and history then update. Reset restores the sample position, including if pressed while the animation is still running.

Tap/click other cards for the original full face and structured catalog metadata. Inspect a leader and flip it. Presentation settings offer reduced motion, a flat table, and a 20-unit layout. Keyboard-accessible native buttons and dialogs support focus/escape behavior; hover lift is restricted to fine pointers. Phone layouts keep both arenas visible, use smaller intact cards, and rely on full-card inspection for text.

## What this proves, and what it does not

The rendering approach works in real browsers with real assets and data. It does not establish a production-ready game client. The position, available attack, initiative interaction, and attack outcome are explicitly scripted; there is no engine connection, live opponent, authentication, save, or matchmaking.

Production integration should replace the fixture's visible state and action list with Baize's seat-filtered observations, legal actions, and ordered events. The client should animate received outcomes rather than implement the rules or decide winners. Do not replace production shared UI components with this standalone HTML; port the renderer into the app's existing component and data boundaries.

Further work before shipping:

- Connect the authoritative engine/session state, all decision types, and reconnect behavior.
- Exercise deployed leaders, upgrades, shields, experience, captured cards, prompts, and high-density boards. The doubled board is a layout stress fixture, not a rules-valid position.
- Validate real iPhone/iPad hardware and Safari/WebKit, GPU compositing, touch target usability, screen readers, zoom, and color contrast. Chromium/Firefox viewport emulation does not substitute for those checks.
- Optimize the original card PNGs and the environment texture through the production asset pipeline. The earlier CSS-only skin transferred about 3.99 MB; the new material skin adds a background PNG and stylesheet. Current measured bytes and request counts are recorded in `real-board-validation.json`. There are no external runtime requests. These are payload observations, not latency or frame-rate guarantees.
- Refine phone landscape: the current study deliberately permits vertical scrolling. Portrait fits a normal sample game in approximately one phone screen; crowded boards need more space.

The standalone HTML/CSS/JS source plus material stylesheet has no runtime package dependencies. It performs no continuous rendering loop; the SVG path updates on layout changes and selection, and motion uses CSS transforms/opacity.

## Repeatable evidence

From the repository root, serve the artifact directory:

```sh
python3 -m http.server 4387 --bind 127.0.0.1 --directory docs/design/native-play-2026-09-30
```

In another terminal, using the repository's installed Playwright:

```sh
node docs/design/native-play-2026-09-30/verify-real-board.mjs
```

Optional `PTP_BOARD_URL` points the check at another local URL. The check validates catalog fields and card-back bytes; card inspection, leader flipping, scripted attack, reset during animation, and image loading; and eight viewport sizes in Chromium and Firefox. The Chromium pass additionally exercises crowded layout and reduced-motion attack resolution. It records results in `real-board-validation.json` and captures the screenshots below. Browser binaries must already be installed.

To rebuild the catalog subset and missing face assets:

```sh
node docs/design/native-play-2026-09-30/build-real-board-assets.mjs
```

This rebuilds only cards using the source catalog and its official image URLs. Existing face files are retained; the card-back copy and catalog manifest are regenerated. Fonts and the separately generated environment asset are checked-in assets, not part of that rebuild script.

## Design iterations

1. Rebuilt the composition around intact cards, horizontal leader/base pairs, genuine hidden backs, and a common perspective table.
2. Corrected intrinsic image sizing for the card backs and reserved enough shelf space to preserve the hand's complete card faces.
3. Added the subtle inset edge treatment and corner fixings; verified the warm/cool surfaces, targeting arc, and 20-unit phone layout in actual screenshots.
4. User feedback: the CSS-only material pass lost the skeuomorphic table. Added an empty illustrated command-table asset generated with the built-in image tool using the original concept as a material reference. Combined it with angular inset frames, darker equipment trays, and contact lighting. The final prompt is in `table-material-prompt.txt`. Real card faces/backs and interaction data remain unchanged. The prior screenshot is preserved as `real-board-before-materials.png`.

## Files

- [Desktop screenshot](real-board-desktop.png)
- [Firefox screenshot](real-board-firefox.png)
- [Phone screenshot](real-board-phone.png)
- [Phone crowded board](real-board-phone-crowded.png)
- [Phone inspection](real-board-phone-inspect.png)
- [HTML](real-board.html) · [Base CSS](real-board.css) · [Material CSS](table-materials.css) · [JavaScript](real-board.js)
- [Environment art](assets/command-table.png) · [Generation prompt](table-material-prompt.txt)
- [Source data subset](real-board-data.json) · [Validation results](real-board-validation.json)
