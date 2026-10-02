---
title: Purrgil launch — solo limited against AI
status: active
date: 2026-10-01
supersedes: 2026-09-30-native-limited-play-plan.md (launch scope and sequencing)
---

# Solo AI beta launch

PTP's first native-play launch is **solo limited against AI, for beta users only**.
Finish solo drafting or opening sealed, build a legal deck, then choose **Play vs AI**.
PTP launches the existing Purrgil client at **https://play.protectthepod.com**.
This decision replaces the previous multiplayer-first launch, including public
lobby/queue/private-link promotion. Existing PvP code is retained as deferred work;
the local WIP runtime is implemented, while the production release gates remain open.

The eventual play-site front door is deferred. For this beta, entry is a trusted
handoff from an eligible solo deck in PTP; a direct root visit explains where to
start or resumes an authorized game. No public lobby or standalone deck picker is
needed for launch. Karabast export stays a secondary utility, never a launch step.

## Confirmed product scope

- Beta members finish an ordinary solo draft or sealed session and build a deck.
  The builder's primary next step is Play vs AI, with the current pool/deck retained.
- In draft, the opponent is a bot from that exact draft, with a deck built from
  that bot's actual picks. Keep its draft-seat identity/name; do not substitute a
  random constructed or independently generated deck.
- Offer the existing competitive-style round/bracket journey. AI plays AI in all
  other matches; real simulated outcomes feed the standings and next pairings.
- In sealed, generate an independent bot sealed pool under the same set/product
  and pack-count configuration, build a legal limited deck, and start the game.
- Native AI play is beta-only. Multiplayer launch, queue, invitations, organized
  human play, standalone Play entry and the future play-site home page are deferred.
- Retain the responsive board, themes/preferences, legal-action interaction,
  reconnect, independently deployable Purrgil and Baize, and full game records.

## Revised delivery order — October 1

The primary journey is **Solo Draft / Solo Sealed → Deckbuild → Play vs AI**.
AI deck construction is part of preparation, not a separate user step. The mirror
match is a developer diagnostic, not this product flow. The human never chooses
cards for the bot or copies deck lists between applications.

1. **First playable loop (current implementation):** save the visible human build;
   route solo completion directly to Play vs AI; prepare and freeze an authentic
   opponent; launch the human seat. Draft uses the opposite seat's actual picks
   and persisted strategy. Sealed opens an independent pool with matching product
   and pack count, then builds from it. Preserve both sides across retry/refresh.
2. **Run lifecycle:** owner-bound resume/status, completed-game record archival and
   replay from PTP, next-game controls, clear completion and recoverable errors.
   No implicit new opponent/pool when resuming. No PvP stats for AI games.
3. **Draft event:** extend the frozen participants into the existing three-round
   BO3 Swiss journey; simulate the other bot matches; advance real results.
4. **Beta launch:** finish information-model/quality/load/recovery gates and deploy
   to play.protectthepod.com behind fresh beta entitlement. A standalone front
   door, multiplayer queue and invitations remain later work.

This sequencing lets us test the complete single-game product journey first;
it does not replace the agreed draft-bracket scope with mirror-deck practice.
For this checkpoint the new route remains local-development-only in addition to
beta/admin authorization. It is not enabled for production merely by deploying.

## Planned defaults based on existing competitive practice

The current competitive practice design uses three rounds of best-of-three Swiss
pairing, not single elimination. Reuse that structure for the solo draft bracket:
opening pairings follow the existing opposite-seat rule, then record-based Swiss
with existing repeat-opponent/bye behavior. Do not impose competitive drafting
or deckbuilding timers on an ordinary solo draft merely because it uses this UI.
Eight seats are the initial supported bracket; validate the actual pod size and
handle supported odd counts through the existing bye rules rather than inventing
bot decks for missing seats. Other solo variants must be explicitly certified.

A match is complete when a seat wins two games; the engine supplies game outcomes.
Use existing limited sideboard/deck-validation rules between games if supported;
pin each game's exact deck version. If sideboarding is not ready, explicitly keep
beta decks fixed for the match rather than implying an unsupported control.
Freeze bot decks when the run is prepared; no reactive rebuilding against the
human deck. One sealed AI match with an explicit new-match option is the initial
sealed flow; sealed does not acquire a draft bracket by default.

## Player journey

1. Finish a **solo** draft or sealed opening and build a legal deck.
2. For an authorized beta member, show **Play vs AI**. Ineligible decks explain
   the actual issue; an old solo draft without retained bot picks cannot pretend
   to support an authentic draft bracket.
3. Prepare a durable solo run: freeze human deck and provenance; build/freeze bot
   decks; assign the first opponent. Show Preparing opponent / Preparing round
   while this runs, with retry resuming the same job rather than rerolling pools.
4. Redeem the short-lived, single-use PTP launch into the human seat on Purrgil.
   No plugin, copy/paste, public queue or invitation is involved.
5. Play the AI through all engine decisions. Refresh/reconnect resumes the same
   game. The bot acts automatically; there is no second browser/player setup.
6. Persist outcome and replay; show game/match progress. In draft, finish AI-only
   matches, update the round view, then offer the next human match. Do not begin
   another human game while the user is away. A preparing state is shown if a
   background match is still running; never fabricate a result to advance.
7. Show final draft standings/run summary or sealed match result, with replays and
   a clear return to the same PTP deck/session. Past decks retain their provenance;
   editing the human deck outside allowed between-game changes requires a new run.

## Ownership and execution

| Component | Responsibility |
| --- | --- |
| PTP | Fresh beta entitlement, solo-pool ownership, deck legality/provenance, run/bot identities, sealed generation, draft pairings, match/round progression, product results, host launch authorization |
| Purrgil | One human seat, opponent AI identity, all decisions/board controls, thinking/reconnect/retry states, shared modal system, replay and return links |
| Baize and server-side AI worker | Authoritative rules, legal actions and seat-private observations, gameplay policy execution, durable journals, bounded AI-vs-AI simulation and terminal outcomes |

Draft-picking AI, deck-building AI and gameplay AI are separate capabilities. The
existing bot deck builder does not prove there is a usable gameplay agent.
Inventory and pin the actual Baize policy/model/version and compatible engine
revision before advertising Play vs AI. Exercise every decision family, including
mulligans, resources, targets, modes, optional abilities and damage distribution.
The worker consumes only its own permitted observation and the engine's legal
choices. It must not use human hidden cards or simulation/debug state as input.

For sealed, reuse the established server-side pack generation/validation pipeline
with an independent persisted seed/artifact. Build from the resulting pool, obey
leader/base and limited deck-size rules, and preserve the pool plus builder/policy
versions. For draft, reuse saved bot pick pools and bot identities. Reuse the pure
building logic from `src/utils/botDeckBuilder.ts`, separating its Discord posting
and other human-pod side effects: this solo flow sends no Discord messages.

## Durable run and simulation model

Persist a solo run bound to the human owner, mode, source draft/pool, configuration,
participants, immutable deck/pool snapshots, policy versions and run state. Bots
are explicitly typed participants, not fabricated human user accounts. Bracket
round/match/game records refer to those participants and authoritative outcomes.

Give opponent preparation, each AI-only game, and advancement an idempotency key,
a durable job state and bounded retry/time/action budget. Acquire worker leases;
restarts resume the same accepted state/seed. Duplicate terminal callbacks must
not add another win, schedule duplicate games or advance the bracket twice.
Timeouts/worker failures produce recoverable failed/preparing states, never a
random winner. Limit background concurrency so AI-only rounds cannot starve the
interactive human game. An AI failure keeps the human game resumable with a clear
retry; closing a browser must not silently concede or schedule the next game.

Record **every game**, human-vs-AI and AI-vs-AI, with both seat views, deck snapshots,
accepted actions, engine/policy versions, controlled-access seeds and authoritative
outcomes. Use the existing replay/training pipeline; label opponent/participant
kind and solo-run/round/match IDs. AI results must not enter human PvP ratings or
misrepresent play statistics. Authorized completed-game replay can reveal both
sides; active opponent hands, deck order and full AI journals remain private.

## Draft table presentation — October 1 scope clarification

The draft-table redesign belongs to this gameplay-engine feature on
`codex/native-limited-play`. Reuse Purrgil's table environments, materials and
presentation preferences through the shared presentation package described in
Unit 7 of the native limited play plan. Purrgil owns the table designs; PTP
adapts them to drafting and deckbuilding while preserving draft controls,
timers, card readability, keyboard/touch interaction and live synchronization.

Release the redesigned draft table under the same native-play rollout enablement
and beta/admin audience as this feature. Reuse the shared eligibility decision;
do not ship a separate public redesign or enable it just because the branch is
deployed. When that rollout is disabled or the viewer is outside the beta,
render the existing draft table. Engine health and individual deck eligibility
must not switch table presentation during an active draft.

The draft-table integration is implemented: PTP consumes a portable snapshot of
Purrgil's 31 current environments, with WebP artwork, original crop/palette data,
and a persisted table selector in solo/group/chaos setup and the waiting lobby.
The selector is absent from leader preview and active drafting. Player labels
use feathered shade and text shadows instead of solid rectangular backgrounds.
`PTP_NATIVE_PLAY_ENABLED`, the current
`localPracticeEnabled()` restriction, and fresh `requireBetaAccess()` checks
jointly control visibility. Turning off either rollout switch restores the
existing table. Theme changes and gate transitions retain staged selections.

Six browser checks cover enabled beta/admin access, disabled/non-beta fallback,
theme persistence, pick confirmation, gate revocation, phone layout and missing
artwork. Server tests cover stale privileges and both switches; all 31 artwork
checksums and text/focus palette contrasts pass. Physical-device acceptance and
production rollout remain separate gates. The planned deckbuilder integration
remains unfinished and must use the same presentation rollout when it lands.

## Beta admission and release gates

Use existing `requireBetaAccess` in `lib/auth.ts` (beta testers plus admins, with
privilege freshness). Enforce this on server-side prepare/start/resume/launch and
owner-authorized run/replay APIs; UI hiding is not authorization. A known pool,
run or game URL must not let a non-beta user launch, join or select the bot seat.
Return useful sign-in / beta-access / expired-launch recovery without exposing
private records. Apply the same host gate to all launch entry points and leave
public PvP admissions disabled. Existing human-PvP membership checks cannot be
blindly reused for bot participant identities.

Before enabling the beta:

- [ ] Pin and test the live gameplay AI contract against the deployed Baize revision.
- [ ] Complete a real solo draft: actual bot pools/decks, human match, all AI-only
      matches, BO3 results, three-round pairing/standings, and all recorded replays.
- [ ] Complete sealed for each enabled product configuration, with independent bot
      pool, legal bot deck, full human-vs-AI game and replay.
- [ ] Verify authenticated beta success and non-beta/other-owner/stale-privilege
      denial, including direct Purrgil launch/seat and replay routes.
- [ ] Verify refresh, worker restart, duplicate launch/result, preparation failure,
      AI timeout and resume without new pools, duplicate games or invented winners.
- [ ] Verify the bot never receives the other seat's private information.
- [ ] Measure think time, full background-round completion time and concurrent
      beta load; set operational budgets from measurements before release.
- [ ] Verify custom-domain TLS, PTP-to-Purrgil launch/return, and independent service
      deploy/rollback. The previous DNS/deployment notes are not proof of readiness.
- [ ] Verify no multiplayer/queue/Companion/Karabast promotion in the solo launch flow.
- [ ] Preserve desktop/tablet/phone interaction and replay/training-record checks.

## Implementation sequence / current status

The sequence below remains the launch roadmap. The October 1 checkpoint records
the completed local WIP integration; it does not mark the full launch steps done.

1. Audit gameplay policy readiness and solo bot-pool persistence; prove one human
   vs AI game through the existing runtime with complete legal decisions/replay.
2. Add durable solo participants/runs and fresh beta admission; adapt trusted
   launch/result contracts for human/bot and bot/bot games without fake users.
3. Implement opponent preparation: retained draft pools and generated sealed pools,
   pure deck construction, validation, freeze and resumable jobs.
4. Integrate builder Play vs AI → human-seat launch → result/return/resume; remove
   multiplayer promotion from the beta entry flow without deleting future PvP work.
5. Add competitive-style solo rounds and AI-only background match execution,
   results/standings advancement and run resume.
6. Prove recovery, beta boundaries, complete records and measured performance;
   deploy behind the beta gate, then enable only when the checklist passes.

Existing work remains useful: rules service, native board, host handoff, immutable
deck validation, recovery and replay. Public matchmaking, waiting-seat presence,
private links and the human-player front door are a **later release track**, not
blockers for this solo AI beta. Gameplay AI readiness is now a launch dependency.

### October 1: WIP Baize AI integration

The existing Baize gameplay AI is usable for the first **local experimental**
vertical slice. The `codex/purrgil-pvp` checkout includes the WIP agents/search
code from `swu-premier-cadbane-luke` plus subsequent search reporting changes;
there is no need to replace the complete-card-pool engine with that older branch.

Implemented in the current worktrees:

- Baize durable service accepts explicit bot seats with the allowlisted policy
  `wip-search-v1`: existing ISMCTS, 128 iterations, depth 16, using the engine's
  default per-seat greedy rollout evaluators. These are starter-trained weights,
  **not a newly trained general limited model**. This is an initial bounded
  interactive budget, not a claim that ISMCTS beats the existing FlatMC champion.
- A server worker takes bot decisions automatically, outside the shared store
  lock. Both one-bot and two-bot games use the same durable action/frame journal.
  Decisions are step-fenced, reproducible from a separate per-step RNG stream,
  and reconstructed after restart. Declaration/cancel-loop protection follows
  the existing Baize browser driver. Search failure pauses for explicit retry;
  it never invents a winner or substitutes a random bot.
- The authenticated Purrgil gateway rejects entry to a bot seat, labels the
  opponent, and exposes a scoped retry through Reconnect when the AI pauses.
- PTP's local Play page offers **Play vs AI · WIP** to beta/admin sessions, with
  server-side fresh beta checks. It launches the selected saved deck against
  a **copy of that deck**, and says so explicitly. The existing two-window test
  remains. AI testing also requires the development-only local testing flag;
  nothing here enables production AI play.

Important information-model limitation: Baize determinization resamples hidden
hands/resources/deck order **conditioned on each submitted decklist**. It is
therefore decklist-aware. It does not select directly against the true hidden
hand/order, but this is not the strict closed-decklist observation-only policy
specified for launch above. Keep this distinction visible in the WIP test; decide
and validate the beta information model before release. AI inspection that reveals
opponent hands remains disabled. The current rollout evaluators also need limited
quality evaluation across sets and leaders.

Verification completed during this checkpoint: release tests for the durable
service, policy allowlist, replay/restart, deterministic decisions, stale-result
rejection and pause recovery; existing local journals successfully restored on an
isolated instance; a real starter AI-vs-AI game finished by rules in 127 moves,
17.6 seconds, producing 128 verified frames. This is one local smoke measurement,
not a load/performance guarantee.

Still required for the actual beta launch: real draft-seat deck preparation,
independent sealed opponent pools, durable solo runs/typed participants,
round/BO3 progression and background AI matches, PTP archival/result integration,
closed-decklist policy decision, wall-clock cancellation/process isolation,
interactive-vs-background scheduling, and the release checks above. The current
worker has one search slot and a fixed iteration/depth budget; it does not yet
provide production job leases, hard think-time cancellation, or load isolation.

The subsequent browser check also passed: real local beta account → PTP's
**Play vs AI · WIP** button → Purrgil human seat → automatic bot turns → refresh
→ terminal game by rules. The saved-deck game used 86 accepted moves and 87
replay frames (37 seconds with scripted human choices). Non-beta and bot-seat
launch requests were denied. Evidence script:
`artifacts/verify-local-ai.ts`; screenshot: `artifacts/local-ai-game.png`.

### October 1: authentic opponent preparation implementation

- Extracted `constructBotDeck` into `src/utils/botDeckConstruction.ts`. Existing
  draft completion continues using the same construction policy; solo preparation
  imports the side-effect-free module rather than Discord/pool-publishing code.
- Added migration 104 and private `ptp_solo_ai_runs`: immutable human/source-pool
  snapshots, typed AI participant identity, pinned engine/policy/builder versions,
  and a write-once AI deck. Preparation is committed before construction; retries
  preserve the generated bot pool even if building or runtime launch fails.
- Added beta-checked `POST /api/play/native/solo`. It validates the saved human
  deck against server provenance, rejects group drafts/sealed pods, uses actual
  opposite-seat bot picks for eight-seat solo draft, or persists an independent
  server sealed generation with matching product/pack count. All decks are checked
  against their own source cards and the pinned engine catalogue before launch.
- Builder completion saves the current owned deck before leaving, then routes
  solo play to `/play/solo`. This compact page starts/resumes preparation directly;
  it does not send the user through a lobby or a second deck selector. Group
  destinations remain available. The gateway profile shows the prepared AI identity.
- Local migration applied. Existing bot builder characterization tests pass before
  and after extraction; new tests cover opposite-seat selection, malformed/group
  rosters, no invented deck cards and unchanged source pools.

Next: complete the run lifecycle/record UI, then BO3/Swiss orchestration. The new
run schema is the first-game foundation, not a claim that the full bracket, job
leases or PTP replay archival have already shipped.

### October 1: local results, BO3 and Swiss milestone

Implemented and exercised locally (production remains disabled):

- Migration 105 adds immutable typed rosters/decks, persisted round pairings and
  unique games with append-only completed records. New draft runs freeze all seven
  real bot pools; their decks are constructed exclusively from those picks. Existing
  first-game runs without seven frozen pools remain one-opponent BO3 runs.
- Solo sealed is one BO3 match. New eight-seat draft runs play three Swiss rounds,
  with opposite-seat round one and existing standings/pairing rules. Human games
  require Start; AI-only games start in the background. Wins come only from verified
  terminal engine records. Draws do not count as wins. A 20-game safety limit pauses
  unresolved matches without fabricating a result.
- A leased reconciliation worker runs in the PTP custom server. It creates/resumes
  requested games idempotently, validates engine revision, both decks and AI policy,
  stores both-perspective records and advances scores under the run lock. Paused
  bots can be retried explicitly without resetting decks, commands or scores.
- `/play/solo` now provides Start/Resume, round selection, BO3 scores, standings,
  completed-game replay links and Start new run. Four draft matches fit at
  1280×800; smaller screens wrap. APIs enforce owner access and beta eligibility.
- Completed records feed Purrgil's authenticated read-only replay mode and a private
  training endpoint with participant-kind, round, match and game metadata. Results
  do not enter PvP ratings. The replay client recognizes the pinned engine's newer
  structured decision kinds; unknown kinds still fail validation.
- Fixed LAW reprint mapping: use another inventoried printing only when canonical
  name/type/subtitle and complete stored rules fields match. No invented cards or
  unsupported-card bypass. Rebuilt the local support manifest against the same pin.

Verification: 21 PTP native/solo tests passed (one existing opt-in integration test
skipped); 39 Purrgil protocol/interaction tests passed; both TypeScript checks and
Purrgil build passed. A real draft completed all 12 BO3 matches across three rounds;
all nine AI-only matches played through the engine. A separate sealed BO3 completed.
Only test-human seats were conceded to accelerate progression. Every resulting
record was present, owner-only, and repeated reconciliation preserved scores. All
archived draft frames parsed/projected from both perspectives. Browser replay loaded
135 steps and advanced; results fit 1280×800 without page overflow. Evidence lives in
`artifacts/verify-solo-progression.ts`, `verify-solo-results-ui.ts`,
`debug-solo-replay.ts`, and the corresponding screenshots. The progression script
requires explicit disposable fixture run IDs because it concedes their human games.

Remaining before beta deployment: AI quality/limited coverage evaluation,
closed-decklist policy decision, production think-time cancellation and process
isolation, interactive/background scheduling and load testing, release migrations
and deployment checks. This milestone uses the existing WIP decklist-aware policy;
it does not claim production readiness or complete human interaction coverage for
all newly recognized decision kinds. Sideboarding between BO3 games remains outside
this milestone; decks stay frozen for the run.

## Access and supporter customization — October 1 update

All new native-play entry points, including the future Solo / With friends / My decks / Stats homepage experiment, are beta-only for now. Existing public drafting, sealed, deck building and stats access are not newly restricted by this rollout.

Table environments and alternate token sets are Friend of the Pod customization benefits during beta and after general launch. A non-supporter beta user plays with the default table and default tokens, sees locked customization controls, and gets a Become a Friend of the Pod CTA. Functional display/accessibility preferences remain available. Entitlements come from PTP's current user record, never local storage or the opponent's profile. Removing beta access blocks native sessions; removing membership restores default presentation. Patreon perk lists use the shared PATREON_FEATURES source.
