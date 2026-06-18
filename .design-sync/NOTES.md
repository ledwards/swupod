# design-sync notes — swupod

Repo-specific gotchas for syncing swupod's UI primitives to claude.ai/design.
**Read this first on every re-sync.**

## What swupod is (and why this isn't a normal sync)

swupod is a **private Next.js application**, NOT a packaged component library:
`"private": true`, no `main`/`module`/`exports`/`types`, no library build — only
a `.next/` app build. So there is **no `dist/` to bundle**, and the converter's
default synth-entry mode (glob all of `src/` → `export *`) would pull in
contexts, hooks, Socket.io, `next/*`, and server code and fail to bundle.

**The approach:** a hand-authored entry, `.design-sync/entry.tsx`, re-exports
ONLY the 22 app-independent primitives we scope in. It's passed to the converter
via `--entry`, so the bundle is built from that file (NOT a `src/` glob). This is
`package` shape with an explicit entry, keeping `synthEntry=false`.
`componentSrcMap` in `design-sync.config.json` is the authoritative component
list (no shipped `.d.ts` for the converter to discover from). **Keep
`.design-sync/entry.tsx` and `componentSrcMap` in lockstep.**

## Toolchain (IMPORTANT — the default shell node is wrong)

- The repo requires **node ≥20.9.0** (`engines.node`), but this machine's shell
  defaults to **node v16.13.0** (nvm). Run every converter command under node 20.
  No `.nvmrc` exists. Prefix each command:
  `PATH="/Users/lee/.nvm/versions/node/v20.20.2/bin:$PATH" node …`
  (v20.20.2 was used; any installed ≥20.9 works — `ls ~/.nvm/versions/node`).
- **esbuild must be pinned to the repo's exact version (`0.27.2`)** when installing
  the converter deps. `.ds-sync/` lives inside the repo, so node resolution walks
  up and finds the repo's own `@esbuild/<platform>@0.27.2`; installing a different
  esbuild there triggers `Expected 0.28.x but got 0.27.2`. Install:
  `npm i --prefix ./.ds-sync esbuild@0.27.2 ts-morph @types/react`
  (do NOT `rm -rf` node_modules first — a plain pinned install reconciles fine).

## The full build cycle (run from repo root)

```bash
REPO=$(pwd); NM=/Users/lee/.nvm/versions/node/v20.20.2/bin

# 0. (re)stage scripts every sync; install deps only if .ds-sync/node_modules missing
mkdir -p .ds-sync && cp -r "<skill-base-dir>"/{package-build,package-validate,package-capture}.mjs "<skill-base-dir>"/{lib,storybook} .ds-sync/
echo '{"name":"ds-sync-deps","private":true}' > .ds-sync/package.json
PATH="$NM:$PATH" npm i --prefix ./.ds-sync esbuild@0.27.2 ts-morph @types/react

# 1. build (synth-entry avoided via --entry)
PATH="$NM:$PATH" node .ds-sync/package-build.mjs --config design-sync.config.json \
  --node-modules ./node_modules --entry ./.design-sync/entry.tsx --out ./ds-bundle

# 2. *** REQUIRED post-build asset copy *** (see "Assets" below)
cp -r public/icons ds-bundle/icons && cp -r public/branding ds-bundle/branding

# 3. validate (chromium already cached — see "Render check")
PATH="$NM:$PATH" node .ds-sync/package-validate.mjs ./ds-bundle
# 4. capture + grade per the skill; serve review:
#    PATH="$NM:$PATH" node .ds-sync/storybook/http-serve.mjs ./ds-bundle  → open /.review.html
```

There is NO pre-build step (no `buildCmd`) — the entry is source; esbuild compiles it.

## Styling & fonts

- **Component CSS is co-located** (`Button.css`, `Card.css`, … — esbuild bundles
  them into `_ds_bundle.css`, ~52 KB). This is why fidelity is high without a
  compiled Tailwind sheet. `.canvas-card` (Card) base rules live in `Card.css`
  and ARE bundled; some contextual `.canvas-card` variants live in the unbundled
  `DeckBuilder.css` but aren't needed for standalone previews.
- `cfg.cssEntry = src/index.css` — global base/reset (appended into
  `_ds_bundle.css`). Note: a `cssEntry` `@import` would land mid-file and be
  ignored — do NOT try to inject fonts via cssEntry.
- **Barlow is shipped self-contained** via `cfg.extraFonts =
  .design-sync/fonts/barlow.css` (4 latin weights 400/500/600/800, ~63 KB woff2,
  downloaded from Google Fonts — the family the app loads at runtime). The
  converter copies them to `fonts/` and `styles.css` `@import`s `./fonts/fonts.css`
  FIRST, so designs render in real Barlow, offline. The woff2 + barlow.css are
  committed under `.design-sync/fonts/` (durable sync inputs).
  - Channels that did NOT work here: `tokensGlob` (only fires with `tokensPkg`,
    i.e. a tokens npm package); `remoteImports` (only scraped from a Storybook
    static dir). Post-patching `styles.css` is unsound — it desyncs the
    `_ds_sync.json` anchor (`styleSha`). extraFonts is the only anchor-correct path.
- `cfg.runtimeFontPrefixes = ["Avenir"]` suppresses `[FONT_MISSING]` for Avenir
  (a fallback-stack system font in `src/index.css`, not a brand font).
- **Tailwind** is present (`--tw-bg-opacity`) but the scoped primitives use ~0
  utilities → low risk; there is no `tailwind.config.*` at root (likely v4).
- **Previews use a dark surface.** These components are built for swupod's dark
  theme (`body` bg `hsl(0 0% 4%)`), but the converter's card html hardcodes
  `body{background:#fff}`. Every `.design-sync/previews/<Name>.tsx` wraps its
  content in a `#0a0a0a` surface — faithful composition, since these components
  only ever appear on dark.

## Assets — REQUIRED post-build copy AND upload (easy to miss)

Five components reference absolute `public/` asset paths the converter does NOT
copy, and the render check / design pane serve the bundle dir as web root:
- AspectIcon → `/icons/<aspect>.png` · CostIcon, Card(penalty) → `/icons/cost.png`
- UserAvatar, PlayerSeat → `/icons/friend-of-the-pod.png`
- WayfinderStoreButtons → `/icons/browsers/*.svg`, `/branding/wayfinder_*.svg`

**After every build, copy `public/icons` → `ds-bundle/icons` and
`public/branding` → `ds-bundle/branding`** (step 2 above), or these render as
broken images. **At UPLOAD, add `icons/**` and `branding/**` to the
`finalize_plan` writes** (on top of the skill's default writes list, which also
includes `fonts/**`) — otherwise the design pane shows broken icons.

## Scope (22 primitives — all render clean, all graded good)

- **Core (11):** Button, Card, AspectIcon, CostIcon, Modal, ConfirmModal,
  CollapsibleSection, InfoTooltip, SearchInput, EditableTitle, UserAvatar
- **Timers (5):** Countdown, CountdownTimer, DraftTimer, TimerButton, TimerPanel
- **Game/draft presentational (6):** DraftableCard, PassDirectionArrow,
  PlayerSeat, MatchCard, DraftReportButton, WayfinderStoreButtons

Excluded (app-coupled): AuthButton/Widget, ChatPanel, DeckBuilder, DraftLobby,
HostControls, LandingPage, LogoHeader, PackDraftPhase, PlayerCircle,
PlayInstructions, ResultReportModal, SealedPod(/Lobby), SetSelection,
Set/Subscribe banners, BetaWelcomeToast. Excluded (page content): About,
PrivacyPolicy, TermsOfService, CompetitivePracticeRules, ReleaseNotes.
Excluded (couples into DeckBuilder): CardWithPreview.

## Overlay components

Modal + ConfirmModal use `cfg.overrides.<Name> = {cardMode:"single",
viewport:"600x460"}` so the open dialog renders inside the card.

## Render check (no install needed)

The repo's own Playwright (`1.58.0`) + cached chromium-1208
(`~/Library/Caches/ms-playwright/` — macOS path, NOT `~/.cache`) drive the render
check with zero extra install. The validate script resolves `playwright` up the
tree from `.ds-sync/`.

## Status as of this build (local only — NOT uploaded)

Built + validated locally: **22/22 previews render cleanly, no warnings, anchor
matches.** Authored previews graded `good`. **The upload to claude.ai/design was
NOT done** — this session runs on `CLAUDE_CODE_OAUTH_TOKEN` which can't get design
scopes, and `/login` isn't available here. To finish: open an interactive
`claude` on this machine (where `/login` works), run `/design-sync` — it reuses
this config + previews + fonts, rebuilds deterministically, and goes to
project-pick + upload (remember the icons/branding/fonts writes).

## Re-sync risks (what can silently go stale)

- **`entry.tsx` ↔ `componentSrcMap` drift**: add/remove a primitive in BOTH. A
  renamed/moved `src/components/*` breaks the pinned path and the re-export.
- **Default-export assumption**: entry re-exports each primitive's `default`
  (all 22 currently have one).
- **Assets copy + upload writes** (above) is the single easiest thing to forget —
  icons/branding live OUTSIDE the converter's output and the `_ds_sync.json`
  anchor, so nothing downstream will flag their absence.
- **Barlow woff2** are pinned Google Fonts v13 latin-subset files committed under
  `.design-sync/fonts/`. Latin only — non-latin glyphs fall back. Re-download if
  the family/version must change.
- **Synth-entry weakness**: no shipped `.d.ts`, so `<Name>Props` is ts-morph
  extracted from source. Complex props may need `cfg.dtsPropsFor.<Name>`.
- **node 20 + esbuild 0.27.2 pin** (above) — a fresh clone / different machine
  must reproduce both or the build fails confusingly.
