# Purrgil execution status

## October 1 — draft-table rollout decision

The draft-table integration now reuses Purrgil's 31 environments on
`codex/native-limited-play`, under native-play enablement, the current local-only
rollout restriction, and fresh beta/admin authorization. The existing draft
table remains available outside that rollout. Six browser cases and four focused
unit tests pass; TypeScript and design-tells checks pass. The repository-wide
ts-nocheck ratchet is blocked by the pre-existing concurrent
`src/utils/botDeckConstruction.ts` entry, unrelated to table changes. Draft/build
continuity remains partial: deckbuilder presentation has not been integrated. See the
[active solo AI beta plan](2026-10-01-solo-ai-beta-launch.md#draft-table-presentation--october-1-scope-clarification)
for the shared-presentation and acceptance requirements.

Updated: 2026-10-01. **Active launch: beta-only solo limited vs AI.** [Authoritative launch plan](2026-10-01-solo-ai-beta-launch.md). Multiplayer remains deferred. Existing native services/UI are implemented; gameplay-AI integration and solo bracket orchestration are planned, not launch-ready.

The milestones and implementation history below describe completed or ongoing infrastructure work. PvP launch/cutover gates are no longer prerequisites for the solo beta; use the new plan’s sequence and checklist.

## Workspaces and services

- PTP: `codex/native-limited-play` in `.worktrees/codex/native-limited-play`, base `93a3c3d6`; design/plan committed at `6222a977`, host implementation at `858b49b7`, public matching/records at `0d8efa32`; [draft PR55](https://github.com/ledwards/swupod/pull/55); existing production app unchanged.
- Purrgil: private https://github.com/ledwards/purrgil ; `codex/native-play` in its own worktree; visual restoration and archived replay deployed at `b25775e`. [Review PR](https://github.com/ledwards/purrgil/pull/1).
- Baize: `codex/purrgil-pvp` in its own worktree, based on upstream PR5 `64d2221d6e8a9ee58ac57ba297f23948d3dd30d4`; record-capable runtime deployed at `4f49c0f`; branch includes HTTP smoke CI. [Review PR](https://github.com/caldred/baize/pull/6).
- Railway: separate `purrgil` and private `baize-pvp` services in the existing swupod project, each with its own persistent volume. Both deployments succeeded; public Purrgil readiness returned HTTP 200 after reaching Baize privately.
- Preview service: https://purrgil-production.up.railway.app . It requires a host-authorized seat; this is not yet a public matchmaking release.
- Custom domain registered; DNS pending: CNAME `play` → `4mxspvku.up.railway.app`. No DNS change made without account access.

## Milestones

- [x] Separate repository, isolated worktrees, pinned engine candidate and independently deployed services.
- [ ] Unit 1: contract implemented; independently measured current Karabast action parity and reviewed launch-card coverage remain gates.
- [ ] Unit 2: immutable decks, provenance, host authorization and durable result/revocation reconciliation implemented; end-to-end verification ongoing.
- [ ] Unit 3: two-human service and durable recovery implemented and tested; operational capacity and lifecycle drills remain.
- [ ] Unit 4: private invitation, seat launch, live board and mutual rematch implemented; real two-account host-to-game HTTP integration passed; browser/device and reference-parity gates remain.
- [ ] Unit 5: native shared public lobby/queue and primary UI implemented; real public-to-replay smoke passed; production cutover remains.
- [ ] Unit 6: seven surfaces, card treatments, layouts and efficient inputs implemented; physical-device performance/visual acceptance remain.
- [ ] Unit 7: authenticated solo server generation added; whole draft/build/play journey and pod transition remain.
- [ ] Unit 8: independent deployments verified; rollout, timeout policies and transition gates remain.
- [ ] Unit 9: both-seat durable records, immutable archives, replay and admin training export implemented and verified; long-game load, retention and existing stats integration remain.

## Current work

- Root: cross-repository integration, deploy verification, review and this project ledger.
- PTP agent: integration and review fixes complete; isolated local fixture remains available.
- Client agent: native public entry/replay actions and homepage lobby cleanup implemented; prototype depth, responsive hand fan and 0/30 base-damage display complete; visible Draw captions removed. Phone controls no longer cover cards and ordinary desktop hands fit at 1280×850. Attack dragging remains disabled without legal-target preview.
- Engine agent: authoritative runtime, authenticated solo provenance and independent host review/fixes complete.

## Verification so far (not full release acceptance)

- Purrgil: 58 adapter/history/transport tests and seven gateway tests passed; TypeScript and production bundle passed.
- Gateway tests cover browser-bound host handoff, one-use credentials, ownership/origin checks, revocation/expiry, restart persistence and fencing after uncertain disk writes.
- Real Rust-plus-gateway integration passed: independent cookie seats, wrong-seat rejection, 12 actual actions, idempotent retry, restart of both services, concession and persisted terminal result.
- Browser manually exercised an actual Baize game through initiative, mulligan and resource selection; hidden opponent cards stayed hidden. Separate real HTTP integration now covers both authenticated PTP accounts through invitation, browser-bound launch, action retry, concession/result, exact-deck mutual rematch and logout revocation. A full natural game in two browser UIs remains a separate acceptance check.
- Baize service tests include natural rules completion, journal recovery, privacy, command races/retries, corruption/revision refusal and concession at the command cap. Actual HTTP smoke also passed.
- PTP disposable PostgreSQL tests passed migrations 096–099 reruns, competing joins, native-versus-legacy admission, immutable history, mutual rematch, delayed results and durable revocation retries. Production migrations have not run.
- Solo sealed: seven focused tests passed, including real SOR/JTL-CB generation, forged-input rejection, ownership, expiry and idempotent window finalization. Migration 100 and real solo prepare/finalize HTTP checks passed in the isolated PostgreSQL fixture.
- Rendered browser suite: 24 cases passed across desktop and phone emulation, eight intentional device-specific skips; crowded screenshots inspected. No physical iPhone/iPad performance claims.

## Decisions and release gates

- User authorized execution, GitHub and Railway provisioning/deployment. No upstream merges or existing production PTP changes have been made.
- The current support manifest is explicitly an internal authored inventory, not a certified card-support allowlist. Engine authoring metadata alone cannot certify gameplay correctness.
- Historical sealed and anonymous browser-generated solo pools have no trusted generation evidence and remain ineligible; no invented provenance backfill.
- Public queue/lobby unification is now selected for implementation. Native pod transition remains a separate decision. Disconnect/inactivity outcomes, invite/rematch expiry and unrecoverable failure policy remain explicit release gates. Socket loss never creates a win.
- Backend and gateway currently require one replica and persistent private storage. Stop-before-start deployment, revision-pinned recovery and draining old matches constrain upgrades.
- No-extra-click acceptance is per equivalent action, not average. Additional real reference measurements and physical-device validation remain required.

## Review pass

Independent review found deck-minimum/capacity mismatches, admission-disabled cancellation, active-game relaunch after support-policy changes, completed-invitation result display and missing solo-generation tracking. All six findings were fixed before the host implementation commit. Full PTP TypeScript checking and 29 focused tests passed afterward; the actual two-account HTTP integration passed again. Five Chromium host-flow tests and real PostgreSQL generation-tracking retry checks also passed. The full production Next build passed against isolated local fixture configuration. TypeScript and design-system ratchets passed; five new host CSS colors were replaced with existing tokens.

## Latest visual acceptance

The actual running Baize game was reloaded in the in-app browser after the visual change: both base counters show 0/30, no Draw captions remain, and the complete six-card fan is visible at 1237×863. Desktop and phone fixture screenshots also verify raised card edges, recessed arena surfaces, dense layouts and unobstructed phone hand controls. These checks are separate from physical-device acceptance.

## Active follow-on phase

User authorized replacement of external limited matchmaking and complete both-seat game capture. Assignments: PTP agent native public availability/eligibility; client agent primary Play UI; engine agent durable both-seat record export and Purrgil replay; root plan, legacy retirement, immutable host archives, training export and integration. Migration 101 belongs to queue; 102 to archives.

## Public-play and records implementation checkpoint

- Native public service/routes and migration 101 implemented: one shared public listing/queue, oldest compatible matching, explicit join, cancellation, immutable snapshots, shared private/public admission and authoritative saved-deck eligibility. The backend agent reports real PostgreSQL race checks passing; real cross-service verification also passed below.
- Primary `/play` replaced with native Find game/open tables/private invitations. Public waiting seats resume and auto-launch when matched. Fifteen Chromium host browser contract tests passed (API doubles), including retry identity, cancellation, blockers, explicit join, recovered waiting-seat launch and replay-pending retry. Desktop/390px layouts inspected.
- Existing builder completion URL redirects to native Play while retaining save-before-play. Requested unsupported formats remain visible with explicit backend blockers. Homepage/lobby board entry now routes to native Play beside the existing pod list; external lobby polling hooks are removed from those entry components. Deck stats no longer require a Companion install to offer Play deck.
- Both-seat record export, immutable host archive/training routes (migration 102), authenticated replay launch and Purrgil read-only replay are implemented in the current worktrees. Actual end-to-end records and replay verification passed below.
- Replay UI handles archive-pending errors without manufacturing a replay; users retry the ordinary Watch replay action. Native records do not yet imply aggregation into every existing historical stats tab.

### Outstanding release work

The exact cutover checklist is in the plan's **Execution checkpoint — public entry and archive cutover** section. Remaining work comprises production host migrations/configuration/cutover; safe legacy resume and organized-pod/Swiss transition; certified card coverage and paired action parity; physical-device acceptance; lifecycle/capacity/recovery/drain policy; and custom-domain DNS/TLS plus staged admission. Draft/builder skeuomorphic redesign and broader homepage restructuring remain later units, not completed by these focused entry changes.

The latest public/record code is not represented by the earlier deployed-preview commit hashes above until root records a new deployment. No production migration or public admission is implied by this checkpoint.

### Verified real public-to-record integration

Root reports `scripts/native-play/verify-local-records.ts` passed against the isolated local PostgreSQL, real Baize and Purrgil stack (match `7ed5ba9a-1dfa-416d-8518-c43a0d265a20`). It covered public Find game pairing, a real engine action, concession, terminal-only both-seat immutable/idempotent archival, administrative pre-action training privacy, internal authorization/membership, both-seat bound replay sessions and rejection of replay mutations. This closes the basic real HTTP public-to-archive/replay smoke gate; it does not establish a natural full browser game, physical-device acceptance, production cutover or certified card coverage. No production deployment was performed for this follow-on evidence.

### Final follow-on verification and deployment

- PTP full TypeScript and production Next build passed. The first build attempt inherited development NODE_ENV from the fixture; rerunning with production NODE_ENV passed. Generated build-only tsconfig entries were removed. TypeScript/design ratchets pass.
- Twenty-eight focused host tests passed including disposable PostgreSQL native admission/migration regression; separate public PostgreSQL acceptance covered concurrent Find/Join/cancel, frozen decks, rate limiting and safe retry. Fifteen host browser cases passed including committed-but-lost admission response, cancellation retry retirement and correct reserved-deck display.
- Real public → action → completion → immutable record → both-seat replay → training privacy smoke passed. Four review findings (three client recovery/display issues and missing admission churn limit) were corrected and retested.
- Baize record implementation pushed at `4f49c0fac2ab7330874d429b998d4e443364387c`; Purrgil replay pushed at `b25775e70b15999d99be9886c9af60d70349a896`.
- Railway Baize deployment `04610f4e-b014-40fc-b209-f52f630aca16` and Purrgil deployment `f81bcd9e-216a-44d2-af6a-92d5178af29e` both SUCCESS. Engine persistent storage had zero journal JSON files before revision upgrade. Public gateway `/ready` returns ready=true through the private engine.
- Upstream Baize PR5 is now merged into `swu-full-card-pool`; the PvP PR targets that branch. No PTP production migrations or admissions were enabled.
- Public waiting-seat expiry/presence, organized Swiss migration, broad stats aggregation, certified support, physical devices and long-game storage/load remain explicit release work. Waiting-seat expiry must release availability without inventing a game result. The host cutover PR remains draft until these gates are addressed.

Thirteen affected legacy-route/service tests passed with zero skips against an isolated PostgreSQL database; migration103 rerun and preservation checks passed separately.

### Local full-app correction

Root DESIGN.md (not just STYLE_GUIDE.md) applied to native host pages; removed
blue resting gradient, gold branding eyebrow and green selection fill. Shared
background and replay action reused. All 15 browser cases and desktop/phone
visual inspection passed. Latest upstream Baize merged into PvP branch at
`bb5ec9e3`; full local app now uses that binary on4331 with all11 inventory sets,
not the prior SOR-only manifest. Real host validation and engine admission passed
for all nine main PTP sets. Production PTP remains unchanged by this correction.

### Play library and lobby layout correction

Replaced the unbounded saved-deck list with a bounded, searchable leader-art
library. Set and draft/sealed filters preserve selection; requested decks stay
first, then playable decks. Play controls sit beside the library on desktop and
above it on phones. Find Game and Invite a Friend remain direct actions. Open
tables scroll independently and collapse initially on phones; recent games and
private options are secondary disclosures. Card images come from the server
catalog, not saved-state URLs. This follows root DESIGN.md and the existing
DeckPicker's leader-art/filter pattern without calling its retired external API.

Prior art: [Karabast](https://karabast.net/) separates its public table list from
Quick Match/Create Lobby; [Arena's play-blade redesign](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-alchemy-2021-12-02)
separates play choices and deck selection rather than presenting a wall of choices.

Verification: existing 15 browser flow cases passed; three additional browser
cases use 80 decks and 30 lobbies at 1280×800, 834×1112 and 390×844. They check
initial-viewport actions, bounded scrolling, filters and unchanged selection.
Screenshots visually reviewed; TypeScript and the design ratchet pass. Tests
use explicit API doubles; they are UI evidence, not additional engine coverage.
The real local PTP app remains running at localhost:3000 on this feature branch.
No production cutover is implied.

### Same-account local play implemented

The real local `/play` page now offers **Test both sides**. Its setup page opens
both seats in separate windows using the same signed-in account and selected
saved deck. Purrgil isolates their HttpOnly game cookies by match/seat path and
uses independent handoff cookies. Reloading either window retains its seat.
The capability is explicitly enabled only for development on loopback origins.
Older builds are allowed for local testing after ownership/card/support/type/size
checks; ordinary admission and immutable provenance remain unchanged. These
practice games retain engine journals but are excluded from competitive host
records/training. AI play is still outstanding.

Verified against the running full PTP app, current Baize and Purrgil using an
existing ASH draft build: both windows in one browser context, real actions from
both seats, refresh without seat replacement, and successful concession. Gateway
seat-isolation, host feature-gate/deck checks and the browser entry flow also have
regression coverage. No synthetic user is needed to use this feature.

### Gameplay presentation audit and correction

Purrgil now puts hand cards above board surfaces without an overflow clipping
container; resource rows are face down with owner-only inspection. Decision
modals replace the right-side decision panel. Normal action controls and direct
board targeting stay at the table to preserve existing click counts. The right
rail now contains the persistent game log and authenticated match chat.

Karabast comparison also corrected duplicate deployed leaders, unit HP/damage
presentation and ignored public credit counts. See Purrgil's
`docs/karabast-presentation-audit.md` for the enumerated audit, source revision,
checks and unresolved gaps. Force tokens, captured-card lists, stable publicly
known opponent-resource slots and newer decision fields need further public
observation/adapter work; all-set UI parity is not claimed.

Verified with 58 engine/transport tests, 10 gateway tests, 34 browser cases
(eight platform-specific skips), final credit/resource checks, and a real local
ASH two-window game including cross-seat chat delivery, refresh and concession.
The local gateway was restarted with its existing session directory; engine
games were preserved. These changes remain on the feature worktrees.

### Player trays and persistent turn controls

Moved the fanned hand into the lower player tray and enlarged the opponent's
face-down hand within the matching upper tray. Resources and deck/discard piles
remain in their owner's tray. Pass and Take initiative now sit in a fixed
bottom-right control area during the player's turn, with availability derived
from the current engine prompt. Pending choices cannot submit these actions.
Choice dialogs are larger, centered, and use larger card faces; the right rail
remains reserved for logs and chat. Phone layouts stack tray contents and keep
the action controls reachable, with space to scroll the hand above them.

Verified desktop and phone layout and interaction tests (40 passed, eight
platform-specific skips), TypeScript/Vite production build, and a real local
PTP two-window ASH game including setup, resources, chat, reload and concession.
Updated the build served by localhost:4397 without restarting Baize or disturbing
existing games. Feature work remains isolated from production.

### Upgrade attachment correction

Rechecked Karabast's GameCard attachment rendering and replaced detached upgrade
miniatures with unit-width named attachment strips and full-card inspection.
Token upgrades retain individual card identities and inspection. Arena rows now
grow around the complete attachment stack. Verified 42 browser tests (eight
platform skips), additional desktop/phone attachment containment screenshots,
and production build; refreshed the local gateway's static build.

### Card fan, borders and exhaustion

Opponent card backs now share the player's fan geometry and physical sleeve
styling. Removed the heavy neutral card outline while retaining legal-action
and keyboard-focus indicators. Exhaustion now rotates cards 90 degrees,
including resources, and remains rotated on hover. Removed the redundant
exhaustion label and reserved horizontal space beside exhausted units.
Verified desktop/phone screenshots, 44 passing browser cases (eight platform
skips), and the production build served locally on port 4397.

### Layered player areas and table chrome

Resources now use larger face-down cards behind raised hand fans, with visible
ready/total resource and hand counters. Opponent hands use a smaller fan. Bases
face inward and leaders outward in the center command column. Full-card mode
hides duplicate unit power/HP overlays; damage, token upgrades and stat changes
have distinct markers. Printed stat comparisons use the existing PTP card data;
the engine remains authoritative for current stats and actions.

Replaced the header wordmark with the PTP logo, settings/concede text with
accessible gear/flag controls, and routine connection text with a status dot.
Removed the header return link, log numbering and heavy log/chat buttons. The
initiative marker uses the real SWU starter counter extracted from FFG's official
quickstart PDF; settings can switch to a PTP token, persisted locally.

Verified 46 desktop/phone browser cases (eight platform skips), engine/gateway
checks, production build, and a real local two-window ASH game with initiative
appearance switching, chat and refresh. Existing table-theme edits in the shared
worktree were preserved; this checkpoint has not been deployed to production.

### Viewport layout and stable hover

Removed the live-game top bar and logo. Settings and concession now use matched
SVG icons above the right rail, with the connection dot at the far right. The
board occupies the available viewport height; log/chat fills the rail, reserving
bottom space only when turn controls are present. Phone layouts keep a compact
log/chat area below the board. Dense arenas and logs scroll internally instead
of growing the document. Short landscape layouts reduce card/tray dimensions.

Fixed hand-hover oscillation by keeping the hover slot stationary and animating
only its card. Added a lower-edge hover stability regression and viewport tests
for desktop, phone and short landscape. Verified 50 browser cases (ten platform
skips), TypeScript/production build, and a real local two-window game including
chat and desktop/phone screenshots with zero document scrolling. Local static
build refreshed; existing theme work remains intact.

### Token sets: standard cards and Gamegenic

Added a persisted Token set preference with Default 1 selected initially: released
standard token cards for Shield, Experience and Advantage, with original FFG
SWU damage/initiative counters. Default 2 uses actual Gamegenic Premium Tokens
PRO artwork for damage, Shield, Experience, modifiers and initiative, retaining
Advantage as an attached token card. This replaces the prior initiative-only
SWU/PTP choice. Each piece declares its role and on-card/attachment presentation;
switching presentation preserves the existing engine UUID and legal targeting.

Token cards are local publisher images, selected from a release-dated catalogue
of standard printings. Damage counters use exact denominations and multiplicity
badges. Damage sits along the right edge, clear of token upgrades at the left.
Unsupported single-stat negative modifiers keep accurate numeric labels.
Artwork provenance and catalogue maintenance are documented in Purrgil's
`public/assets/tokens/SOURCES.md`. Settings now use a native dialog so fixed
turn actions cannot cover token choices.

Production build, 74 unit/gateway checks and 52 desktop/phone browser cases
passed (ten platform-specific skips); token cases rechecked after the placement
adjustment. Local static build refreshed. No production deployment in this pass.
Real local two-window ASH smoke also passed: PTP launch, separate seats, Baize
actions, chat, refresh, both token-set choices through settings, desktop/phone
viewport checks and concession of the test game. User's existing game untouched.

### Cinematic card faces and complete table catalogue

Cinematic arena cards now crop into the original card artwork with raised edges,
top titles and authentic SWU cost/aspect/attack/HP graphics from Wayfinder iOS.
Numbers use the existing centered Barlow overlay treatment, including reduced
two-digit text. Printed attack and printed maximum HP come from 2,361 standard
PTP card records; damage and current stat deltas remain separate counters.
Full-card mode, inspection and exhausted rotation retain their existing behavior.
Unknown catalogue entries keep a full readable card face. Asset provenance and
metadata refresh instructions live in Purrgil's public/assets/card-icons/SOURCES.md.

Verified all 31 packaged table environments are exposed through settings and
selecting each applies its matching palette and framing on desktop and phone.
The manifest already contained the complete current artwork/theme package.
Build, 74 unit/gateway checks and 56 browser cases passed (ten platform skips).
Local localhost:4397 build refreshed; no production deployment or engine restart.

### Compact player trays

Reduced both tray heights, with a shallower opponent area and the near hand
raised above its tray. At 800px desktop height the trays now take 200px combined
instead of 352px, returning that space to the battlefield. Resource rows retain
portrait card proportions; deck/discard piles are larger on desktop and show
count badges, with the actual top discarded card when nonempty. Phone hand and
resource layering keeps the resource count exposed; the opponent fan stays clear
of the command column on desktop. Hover uses the existing stationary hit area.

Build and 58 desktop/phone browser checks passed (ten platform skips), including
short screens, hover stability, hand visibility, card proportions, tray geometry
and discard artwork. Local static build refreshed; no engine restart/deployment.

### Upright cascaded upgrades and duplicate compression

Attached upgrades now expose their original printed bottom edges as a cascade
under the host card. They stay upright when the host rotates to exhaust; the
cascade tucks up against its rotated edge. Identical upgrades with matching
ownership/controller collapse to a single visible card and count badge (including
physical token presentation). Any selectable/selected group expands automatically
so individual legal targets retain their engine UUID and single-click action.
Inspection still opens the complete upgrade card; no engine state is merged.

Build, 75 unit/gateway checks and six focused desktop/phone upgrade/token browser
cases passed. Screenshots verify the exhausted cascade and eight-copy Advantage
badge. Local build refreshed; no engine restart or production deployment.

### Tray containment, translucent surfaces and lowered resting hand

Corrected opponent tray overflow with bounded card sizes, a contained fan and
compact player details. Both trays now use a 42%-opaque theme surface over the
actual table. Hand, Resources, Draw and Discard share attached label/count styling.
The local hand rests lower, with hover/focus raising a complete card; phone trays
clip only the resting bottom edge while keeping the exposed top touchable.
FFG damage artwork now uses a circular SVG mask in a square viewBox, eliminating
white corners caused by letterboxed image clipping. Physical sprite masks inset
the crop to remove edge fringe without changing printed token artwork.

Build passed. Full browser run passed 61 cases; the former fully-visible resting
phone-hand assertion was updated to the new requested behavior and passed on
rerun (exposed top touchable; full card revealed on focus). Opponent containment,
translucency, token switching and hover stability also passed. Local build updated.

### Upgrade hover-preview flicker

Reproduced the inspection overlay stealing the pointer from its source upgrade,
triggering mouseleave/close and reopening repeatedly. Hover previews now ignore
pointer events; explicit keyboard/right-click/touch inspection remains interactive.
Live play and replay share this behavior. Upgrade cascade hover no longer changes
stacking order, keeping overlapping strip hit regions stable. Regression forces
the preview directly beneath the stationary pointer and verifies sustained display,
then verifies explicit inspection and close. Eight focused desktop/phone cases
passed (two platform skips), along with the build. Local client refreshed.

### Overlay zone labels

Moved zone captions onto the cards/piles with translucent backgrounds instead of
reserving a header row. Expanded resource cards, draw/discard piles and opponent
hand backs into the recovered space, with responsive sizes for phone and short
screens. Build and nine focused browser cases passed (one platform skip),
including opponent containment, discard interaction and hover reveal. Local build
refreshed; desktop screenshot reviewed.

### Viewport, hand motion, player profiles and card details

Pinned the game to the browser viewport and bounded root overflow; added narrow,
tablet and short-screen geometry checks. Tightened the player trays again, enlarged
resource cards and piles within them, and clipped the opposing hand at the outer
edge. The near hand sits deeper and reveals with a 240ms eased, smaller lift.
Labels sit at the bottom of their areas, with the near-hand label beside the fan.
Piles use thin layered card edges rather than thick offset slabs.

Removed duplicate player-name base damage and base damage tokens; bases retain
X / maximum HP. Unit damage now renders separate denomination pieces without
multiplication badges; multiplicity remains available for other token types.

Added authenticated player-profile lookup from PTP, including HMAC-bound local
practice games. Existing Discord avatars display beside player names; missing,
failed or stock Discord avatars use an original circular cartoon Purrgil SVG.
Gateway refresh preserved durable sessions and the live Baize process.

Reused Wayfinder's image-plus-details composition: rounded card image, subtle
borderless panel, text, printed stats/aspects and public SWUAPI rulings, with no
repeated title beneath the image. Details load separately from the game bundle;
failed ruling requests are explicitly unavailable. Hover remains pointer-transparent,
and pinned inspection no longer disappears when its panel covers the source.
Corrected the browser fixture's Academy Training identifier from SOR-099 to SOR-120.

Verified build, PTP typecheck, 76 unit/gateway checks, two practice tests, 68 browser
cases (12 platform skips), authenticated profile access/denial and a real local
two-window game with chat, settings, refresh and concession. Screenshots reviewed.
Local services/build refreshed; no production deployment or engine restart.

### October 1 — tray borders, hand hit testing, visible viewport, SWUAPI

- Tray captions now align along the inside bottom frame edge, with pile labels
  positioned independently of the cards. Resource/pile sizes follow the actual
  tray height. Removed a stale, more-specific -16px own-resource translation.
- Hand hover starts only on the visible card, retains its original footprint
  while lifted to prevent oscillation, and never triggers hover inspection.
  Explicit keyboard/context-menu/touch inspection is retained.
- Game dimensions and position track VisualViewport resize/scroll as well as
  window resize. Normal desktop/tablet/phone and reduced visual viewport tests
  pass. Exact live in-app browser viewport metrics were not accessible this turn.
- Added basic avatar frames and PTP's existing Friend of the Pod badge/frame,
  driven by authenticated player-profile is_patron status.
- SWUAPI requests were being blocked by the gateway CSP. Allowed only the SWUAPI
  origin in connect-src and verified an actual browser fetch through the running
  gateway security policy returns the matching card.

Build, PTP typecheck, 76 unit/gateway checks, 72 browser cases (14 platform skips;
three stale assertions corrected and rerun), authenticated profile access checks,
and a real PTP two-window Baize smoke game passed. Desktop live screenshot reviewed.
Local build and gateway refreshed; user's existing game preserved; no deployment.

### October 1 — artwork panning correction

The prior viewport fix left `.table-scene` fixed to the layout viewport while
controls followed the visual viewport. Attached the artwork absolutely to the
same game container, covering its dimensions; root overflow now clips instead
of creating hidden scroll containers. Build and three targeted browser regressions
passed, including simulated visual viewport offsets plus wheel input verifying
art/frame relative position remains zero, and the existing zoom/size checks.
Local build refreshed and screenshot reviewed; no engine restart or game actions.

### October 1 — exhaustion, orientation and unit-value presentation

- Exhausted artwork is desaturated/dimmed while retaining its 90-degree turn and
  readable counters. Larger command cards are positioned near the top of each
  half and shrink to available height. Legal leader outlines are thin and inward.
- Captions are centered on the outer player-frame lines; pile/resource footprints
  remain inside. Resting hands clip at the outer tray edge but can lift inward.
- Added persisted Natural/Intelligent stat display and opponent orientation.
  Across-table orientation is default, rotating opponent faces and reversing the
  opposing fan; Facing you is optional. Natural remains the default stat mode.
- Intelligent shows engine attack/max HP and retains every upgrade/token target.
  Hover inspection explains printed stats, grouped printed upgrade/token bonuses,
  residual effects and damage. Natural no longer duplicates attachment bonuses as
  additional stat tokens. Upgrade facts generated from Baize's SWUAPI catalogue.
- Limitation: continuous/conditional source attribution is not provided by Baize's
  current observation. Those contributions are explicitly Other effects /
  adjustments; per-source engine explanations remain follow-up work.

Build, unit/gateway tests and desktop/phone browser interaction/layout checks pass.
Two older token-selection tests were updated for concurrently renamed token sets
(FFG/Gamegenic), then passed. Screenshots reviewed and phone label clipping fixed.
Design rationale recorded in Purrgil docs/design/stat-presentation.md.
Local build refreshed; no engine restart, production deploy or user-game actions.

### October 1 — themed action panels and modal surfaces

Moved turn-action, decision-dialog and inspection portals under the themed app
instead of body so they inherit current theme variables and scoped styles. Added
shared palette-driven surface/frame/shadow styling for action panels, decisions
and settings, themed backdrops and inspector text/borders. Removed browser-default
focus outline on the focused dialog shell; interactive keyboard rings remain.
Verified build plus 13 desktop/phone browser checks (one hover-only skip), including
actual computed theme inheritance in Purrgil and Dejarik, native modal behavior,
action legality, centering and inspection hover. Screenshots reviewed. Local only.

### October 1 — fit crowded arenas and unify decisions

Removed arena scrolling. ArenaRow measures the available half-board and complete
unit/attachment footprints, chooses a grid, and scales the entire contents to fit.
This includes exhausted faces and upright upgrade cascades. Pass/Take initiative
is now positioned absolutely inside the game viewport rather than independently
against the browser layout viewport.

Target selection, resource choices, pile dialogs and settings use DecisionDialog
and the same theme surface/frame/backdrop. Target decisions now open centered with
all legal targets inside; selecting one sends the original card action directly,
with no new confirmation. Noninteractive waiting status uses the compact shared
surface. This supersedes the temporary compact targeting-panel approach.

Verified desktop/phone crowded-card containment, zero arena scroll offsets, stable
artwork/action-panel positions under wheel input, target-selection click parity,
settings and theme inheritance. Fixed dialog mounting so its portal is selected
after the themed container mounts. Reviewed crowded and targeting screenshots.
Build and unit/gateway checks pass. Existing user game untouched; local build only.


### October 1 — launch pivot to solo AI beta

User changed first launch from human multiplayer to Play vs AI after SOLO draft or sealed deckbuilding. Draft opponents retain their actual draft pools/decks; the competitive-style round view includes simulated AI-vs-AI matches. Sealed prepares an independent bot pool and deck. Purrgil remains at play.protectthepod.com with no front-door project required yet. Fresh beta/admin entitlement is required server-side.

Created the authoritative solo-AI launch plan and marked the old PvP launch plan/requirements superseded. Existing runtime, board, handoff, deck provenance and full replay/training records are retained. AI gameplay readiness, bot participant contracts and durable solo scheduling are now launch work. No application behavior, feature flags or deployments changed in this planning turn.

### October 1 — WIP Baize AI local integration

- Implemented explicit AI seats in Baize's durable service using existing WIP
  ISMCTS (`wip-search-v1`, 128 iterations/depth 16). No new model or random-policy
  substitution. Local engine and Purrgil gateway updated; existing game journals
  and browser sessions retained.
- Local PTP Play now has a beta/admin-only **Play vs AI · WIP** test using a copy
  of the selected saved deck. Bots take turns automatically; bot-seat launch is
  denied. This is the runtime integration checkpoint, not authentic draft/sealed
  opponent preparation or the production beta launch.
- Search is decklist-conditioned and its default rollouts use starter-trained
  weights. The launch plan records these limitations and remaining evaluation.
- Automated AI/AI smoke finished by rules (127 moves / 128 frames / 17.6 seconds).
  Durable-service tests and gateway bot-seat/retry authorization checks pass.
- End-to-end browser check passed from the real PTP button, using a real local
  beta account and saved deck: bot profile, automatic turns, mid-game refresh,
  86 moves / 87 frames / rules result. Non-beta and bot-seat requests denied.
  Live local entry: `http://localhost:3000/play` → choose a saved deck →
  **Play vs AI · WIP**. No production deployment.

### October 1 — solo deckbuilding → authentic AI opponent

Launch plan reordered around the single-game product loop, followed by run
lifecycle/replays and then BO3/Swiss. Implemented locally in the existing worktree:

- Side-effect-free shared bot deck construction; solo draft completion no longer
  posts the group bot-deck summaries to Discord.
- Migration 104: immutable private run preparation and write-once AI deck.
- Beta-checked solo launch API. Draft uses the opposite retained bot seat and
  actual picks/strategy. Sealed persists an independent server pool using the
  human pool's product and pack count. Both decks pass source/provenance checks.
- Builder explicitly saves before leaving; solo completion goes to a compact
  Play vs AI page, not the lobby. Retry/resume keeps the same prepared opponent.
- Verified both real-data source paths; verified sealed builder completion →
  solo page → Purrgil with its AI profile. Non-beta denied; repeat request kept
  the exact frozen preparation and bot deck. Local DB migration applied.
- Not deployed. Full run status/result/replay UI and BO3/Swiss orchestration are
  still next; current AI gameplay limitations remain as previously documented.

Evidence: `artifacts/verify-solo-opponents.ts`, `artifacts/solo-sealed-ai.png`.

### Solo progression checkpoint — October 1

Local implementation now includes real draft-seat/sealed AI preparation, one-match
sealed BO3, three-round draft Swiss (AI plays the other matches), durable records,
private replays/training, resume and explicit retry. Full local draft and sealed
progression checks passed, plus browser replay playback. PTP server restarted with
the reconciliation worker; Purrgil rebuilt for the latest decision vocabulary.
Production is still disabled. See `2026-10-01-solo-ai-beta-launch.md` for evidence
and remaining AI quality, information-model, scheduling and release work.
