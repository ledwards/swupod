# Plan: Purrgil back to engine + table; the website lives in PTP

Status: proposed, 2026-10-12. Nothing here is started. Decisions settled the same day (see the end).

## Goal

Purrgil runs games. Protect the Pod is the website.

| Owner | Keeps |
|---|---|
| **Purrgil** | Baize hosting (`purrgil-runtime`), the AI (`purrgil-ai`), the game table (board, replay playback, spectator links, sideboarding, rematch, recording download), table cosmetics and preferences, the gateway that seats a player (`/internal/launch`, `/launch`, `/complete`, game APIs), and **every game's record, replay and recording**: Purrgil's data, which PTP reads through a service API. |
| **PTP** | Identity, decks and pools, lobby and matchmaking, match results (who played, decks, winner), ratings (Elo, shown to players), history, stats, watch list, deck import, release notes, settings, the themes catalog page, and every page a player browses. |

When this plan is done:
- **No website code in Purrgil.** Purrgil ships no homepage, lobby, history, stats or decks UI, and stores no lobby state or ratings.
- **No embed in PTP.** PTP has no `public/play-home/homepage.js`, no `sync-play-home` / `sync-shared-play` scripts, and no `/api/lobby/*` relay.
- **One owner per kind of data.** Game records, replays and recordings live in Purrgil. Results, ratings, decks and accounts live in PTP's Postgres. Neither keeps a copy of the other's.
- **One public address.** Players only ever see `protectthepod.com`. The table and spectator pages are served through it from the Purrgil gateway (step 7).

## Where things stand (alpha, Oct 12)

**What alpha PTP shows from Purrgil**
- `/`, `/play`, `/history`, `/decks`, `/me` and `/watch` render Purrgil's `homepage.js` (1.9 MB JS, 0.5 MB CSS) through `src/components/PlayHomepage`.
- The site header's Themes, Settings and Release-notes buttons come from the same bundle (`mountWebsiteControls`).
- `LiveStrip` is the bundle's `mountLiveStrip`.

**What PTP relays to Purrgil**
- `app/api/lobby/[[...path]]/route.ts` forwards `/api/lobby/{shared, decks/played, import-url, ratings/reset, logout, reservation, matches/:id/replay|recording}` to `play.protectthepod.com`.
- It also forwards `/api/{entitlements, cosmetics, appearances}`, which Purrgil then proxies straight back to PTP's `/api/play/native/internal/*`. That's a double hop.

**What Purrgil stores** (single-replica Railway volume, no SQL)
- `lobby/sessions.json`: accounts and Elo, queue, matches, requests, handoffs, sessions.
- `lobby/replays/:matchId.json`: replay archives.
- An R2 bucket of game recordings.

**What PTP already has**
- `src/services/play/native` covers admission, `privateMatches`, `publicMatches`, `sharedPlay`, `reservationRecovery`, `gameRecords`, decks and rematches.
- Postgres tables from migrations 096–102. `ptp_native_game_records` (migration 102) holds a full copy of every PTP-owned game's engine record, which is also the input to `trainingExamples()`.
- The lobby is split today: each side holds half, and reservation recovery exists in both.

**How hosting works today** (`purrgil/hosting/README.md`)
- **`baize-pvp`**: the engine and AI bots (Rust). Private; only the gateway talks to it.
- **`purrgil`**: the gateway plus the game table page, at `play.protectthepod.com`. The browser loads the table from here and sends moves through it.
- **`swupod`**: PTP, with Postgres.

**Duplicated pages**

| Area | PTP side | Purrgil side |
|---|---|---|
| History | `app/history/HistoryPage.tsx` | `src/home/HistoryPage.tsx` |
| Stats | `/me` + `YourStats` | `LobbyStats` |
| Watch | `app/watch`, `/matches`, `/games` | Purrgil's watch list |
| Release notes | `ReleaseNotes.tsx` | Purrgil's `ReleaseNotes` |
| Melee settings | `MeleeConnection.tsx` | `MeleeSettings.tsx` |
| Play setup | `EntryFlow` + `SharedPlay/PlayWorkspace` (the latter copied from Purrgil, unused there) | `PlayModal` |

## Rules for every step

1. **Data before pages.** The data's owner (step 1 for Purrgil, steps 2 and 3 for PTP) is settled before any page reads it from its new place.
2. **Alpha keeps working after every step.** Each step ships on its own. A page moves only when PTP's version replaces Purrgil's on that route, behind `viewerHasAlphaAccess()`.
3. **Beta and regular users never see a change.** Production non-alpha pages are untouched until a step is promoted on purpose.
4. **No pushes or deploys without an explicit go-ahead,** in either repo. Purrgil lands through PRs to `main`; swupod lands as commits to `main`.
5. **Purrgil keeps working standalone** until step 6 retires its lobby.

## Steps

### Step 0: Freeze and record ownership (both repos, docs only)
- Add an ownership section to Purrgil `README.md` and `PRODUCT.md` that points here. It supersedes the Oct 7 standalone-lobby plan.
- Freeze new website features in Purrgil `src/home`, `Lobby.tsx` and `server/lobby*.mjs`. Bug fixes only until each piece moves.
- **Check:** confirm whether `LOBBY_ENABLED` / `LOBBY_SHARED_PLAY_ENABLED` are on in Purrgil production. That decides whether any real Elo or replay data needs backfilling, or only alpha data.
  - **Result (2026-10-12):** `GET https://play.protectthepod.com/api/lobby` (signed out) returns `"enabled": true`, so `LOBBY_ENABLED` is on in production. Treat the `/data` volume as holding real accounts, Elo and replays: steps 1 and 2 need a real backfill, with a volume backup first. `LOBBY_SHARED_PLAY_ENABLED` isn't visible signed out; check it when the backup is taken.
- **Done (PTP side):** `.claude/rules/purrgil-boundary.md` states the ownership and the freeze, and `CLAUDE.md` points to it.
- **Done (PTP docs):** current-state docs carry the new ownership: `docs/operations/native-play.md` (records move in step 1), `docs/integration/alpha.md` (bundle sync frozen), `docs/operations/play-urls.md` (table moves to www in step 7). Dated records (`docs/shared-play-release.md`, `docs/design/2026-10-08-homepage-migration-gaps.md`, the Oct 7 matchmaking plan) get a superseded note; their bodies are unchanged.
- **Purrgil side:** ownership and freeze in `README.md`, `PRODUCT.md` and an agent-facing note, with the Oct 7 plan marked superseded (branch `claude/ownership-freeze`, off `origin/main`, for a PR).

### Step 1: Game records, replays and recordings belong to Purrgil (data)
Purrgil becomes the one store for every game's engine record, replay archive and SWU-PGN recording, PTP-owned matches included. PTP reads them; it never keeps a copy.
- **Durable storage in Purrgil:** records go to Purrgil's R2 bucket (already used for recordings), keyed by match id, immutable once written, as `ptp_native_game_records` is today. The single-replica `/data` volume becomes a cache only, never the only copy.
- **Read API for PTP** (service key, like the existing `/internal/*` routes): `GET /internal/records/:matchId`, `GET /internal/records/:matchId/recording`, and a paged `GET /internal/records?since=` for bulk readers. Its access rules match today's PTP checks: members, the host, or public.
- **Replay mode:** Purrgil's replay mode stops fetching PTP `/api/play/native/internal/records/:matchId` and reads its own store.
- **PTP:** `archiveNativeGame` and `reconcileNativeArchives` stop copying records. `memberGameRecord` and `issueReplayLaunch` read from Purrgil's API. `trainingExamples()` reads records through the bulk endpoint.
- **Backfill:** a one-off script copies every `ptp_native_game_records` row (read-only on Postgres) and every `lobby/replays/*.json` (read-only on the volume) into Purrgil's store, checking `record_hash`. Run it on local and dev first. Drop the PTP table only after every replay link, training export and history view reads from Purrgil.
- **PTP keeps results:** who played, decks, winner and timestamps stay in `ptp_native_matches` (history, stats and ratings need them), with the match id as the link to Purrgil's record.
- **Done when:** every replay and recording link resolves through Purrgil, PTP holds no engine records, and Purrgil's volume holds no data that isn't also in R2.

### Step 2: Ratings and matchmaking (data + service)
- **PTP:** add migrations for `ratings` (user, format, season, elo, games) and `rating_events` (match, before, after), and port the Elo update (start 1500, K=32, queue games only). Elo is shown to players (on `/me`) as well as used for pairing.
- **PTP:** port `matchmaking.mjs` (the adaptive Elo window by arrival rate, ~1.5 KB) into `src/services/play/native` with its tests.
- **Backfill:** copy Elo and season data from `lobby/sessions.json` accounts.
- **Move with it:** sportsmanship commends and rating reset.
- **Done when:** PTP computes ratings on every finished queue game, and Purrgil stops writing ratings.

### Step 3: Lobby state (data + service)
- **PTP owns:** the queue, reservations, invitations and private games, folded into the existing `privateMatches`, `publicMatches`, `sharedPlay` and `reservationRecovery`. Delete Purrgil's copy of reservation recovery.
- **Purrgil keeps only:** `/internal/launch`, `/internal/authorize` and `/internal/revoke`. PTP pairs players, then asks Purrgil for a table.
- **Purrgil retires:** the `/internal/lobby/shared` callback, `lobby-store.mjs` queue/matches/requests/handoffs, and `POST /api/lobby/play|queue/ai|cancel|rematch`.
- **AI games:** PTP asks the runtime for a Leebo seat through the same launch path. The AI itself stays in Purrgil.
- **Done when:** PTP's relay only forwards read paths, and every write goes to PTP.

### Step 4: APIs served by PTP (relay shrinks to nothing)
Replace each allowlisted relay path with a native PTP route. One path per change, in this order:
1. **`entitlements`, `cosmetics`, `appearances`:** already PTP data, so this just drops the double hop.
2. **`lobby/import-url` (SWUForge) and JSON deck import:** validation uses the engine `/v1/support` catalog, which PTP already loads for native play.
3. **`lobby/decks/played`:** derived from the decks stored on PTP's match results (`ptp_native_matches`), not from engine records.
4. **`lobby/matches/:id/replay|recording`:** PTP checks the viewer and hands off to Purrgil's record API from step 1.
5. **`lobby/ratings/reset` and `lobby/reservation`:** from steps 2 and 3.
6. **`lobby/shared` and `lobby/logout`:** last.

Once the allowlist is empty, delete `app/api/lobby/[[...path]]`.

### Step 5: Pages, one route at a time (alpha only)
Rebuild each page in PTP with PTP components and the alpha look (the pod page vocabulary, site theme), then swap `<PlayHomepage path=…>` for it. Merge with PTP's existing page rather than adding a third:

| Route | Merge into | Notes |
|---|---|---|
| `/watch` | `app/watch` + `ReplayWatchLink` | Smallest; proves the pattern |
| `/me` | `YourStats` | Adds visible Elo and season record from step 2; drop `LobbyStats` |
| `/history` | `app/history/HistoryPage.tsx` | One timeline of limited runs and constructed games; port the matchup matrix and per-card analysis next to the deck stats page (`/pool/[id]/deck/stats`) |
| `/decks` | PTP pools + "played decks" | PTP already stores every deck; add played decks, JSON export and SWUForge import |
| `/play` | `EntryFlow` + `SharedPlay/PlayWorkspace` (PTP owns it from now on) | Stop `sync-shared-play`; PTP's copy becomes the source |
| `/` | New PTP home, alpha-gated | Last; home tiles, resume, activity, live strip |

**Site header and chrome**
- Themes, Settings and Release-notes buttons become native `SiteTheme` components.
- Release notes come only from PTP `RELEASE_NOTES.md`.
- Melee settings use the existing `MeleeConnection`.
- `LiveStrip` becomes a PTP component reading PTP's live-match data.

**Themes**
- Table environments and palettes are table assets, so they stay in Purrgil.
- PTP keeps importing theme data only (`scripts/presentation/import-purrgil.mjs` → `themes.json`); no UI code crosses.
- The themes catalog page (playmats, sleeves, tokens, event cosmetics) moves to PTP, since PTP owns the entitlements behind it. The in-table picker stays in Purrgil.

**Done when:** no PTP route renders `PlayHomepage`.

### Step 6: Delete (both repos)
- **PTP:** remove `public/play-home/`, `src/components/PlayHomepage/`, `scripts/sync-play-home.mjs` and `scripts/sync-shared-play.mjs`, and the `mountWebsiteControls` wiring in `SiteTheme`.
- **Purrgil:** remove `src/home/` (keep only what the table uses), `src/components/Lobby*.tsx`, `Dlc.tsx` and the catalog components (keep the in-table pickers), `vite.ptp.config.ts`, `scripts/build-play-shell.mjs`, `scripts/ptp-css-scope.mjs`, `server/lobby*.mjs`, `shared-play.mjs`, `matchmaking.mjs`, `history-comparison.mjs`, `personal-card-analysis.mjs` and `replay-game-metrics.mjs` (ported in step 5), plus the orphans `LimitedSetup.tsx` and `LimitedDeckPicker.tsx`, and most of `home.css` and `lobby.css`.
- **Routing:** Purrgil `/` and `/lobby*` redirect to `protectthepod.com`. `play.protectthepod.com` serves tables, spectating and replays only, until step 7 retires it.
- **Docs:** update Purrgil `README.md`, `docs/host-integration.md` and `docs/integration/alpha.md` to the new ownership; archive the Oct 7 lobby plan.

### Step 7: Serve the table through www (routing)
`play.` remains only because the browser loads the table page from the gateway. Purrgil keeps running as a service; only its public address goes.
- **PTP forwards** `/table/*`, `/watch/*`, `/spectate/*` and the gateway's handoff routes (`/launch`, `/complete`, `/resume`) to the `purrgil` service over Railway's private network, as a rewrite or proxy.
- **Purrgil already scopes sessions by path** (`/table/:matchId/:seat/`), which suits sharing one host. Move its cookies from host-only `play.` to path-scoped on www, and make sure none clash with PTP's.
- **Asset and API paths** the table uses (`/api/game`, `/api/action`, artwork redirects, `/table-environments/*`) need a prefix or an allowlist, so they don't collide with PTP's own `/api/*`.
- **Redirect** old `play.protectthepod.com/table/…` and `/watch/…` links to www for a while, then retire the domain.
- **Done when:** a game, a spectator link and a replay all open on `www.protectthepod.com`, and nothing links to `play.`.

## Order and size

| Step | Repo(s) | Size | Unblocks |
|---|---|---|---|
| 0 Freeze | both | hours | everything |
| 1 Records to Purrgil | both | medium | `/history` replays, recordings, training export |
| 2 Ratings | PTP (+ Purrgil stop) | medium | `/me` Elo, queue pairing |
| 3 Lobby state | both | large | step 4's write paths, `/play` |
| 4 APIs | PTP | small per path | the relay's removal |
| 5 Pages | PTP | large (six routes) | step 6 |
| 6 Delete | both | medium | step 7 |
| 7 Table through www | both | medium | retiring `play.` |

Steps 1 and 2 can run in parallel. Within step 5, `/watch` and `/me` can start as soon as step 2 lands. `/play` waits for step 3.

## Risks

- **Purrgil's volume is the only copy** of standalone Elo and replays. Back it up before any backfill, and never let a backfill write to the source.
- **Moving records out of Postgres** touches `trainingExamples()` and the archive reconciler. Keep the PTP table read-only (not dropped) until the AI training export has run once against Purrgil's API.
- **Cookies:** Purrgil reads PTP's `ptp_session` on the parent domain. Keep that working for table sessions, through step 7's move to www.
- **Bundle-only behaviour:** some of it has no PTP twin yet. Examples: the five primary queue tiles, the Bo3 pod sideboarding entry, the Hearthstone-style decklist modal (`DeckView`, which PTP already re-implemented as `PlayerDeckImage`), and the name-card picker. List each before deleting the bundle.
- **Concurrent work:** other sessions are syncing Purrgil into PTP right now (`claude/alpha-consolidation`, `claude/deck-modal`). Agree on the freeze in step 0 before starting, or this plan races them.
- **Draft Log / Pod Review** (branch `claude/draft-reports-alpha-redesign`) already lives in PTP and reads PTP APIs. It needs no change, only links to the step 5 `/history` and `/me` once they move.

## Decisions (2026-10-12)

1. **The front door is `protectthepod.com`** (www or bare). Purrgil is not a standalone site, and no "replace Karabast" site lives on `play.`. `play.` is kept only as the table's address until step 7 serves the table through www.
2. **Game records, replays and recordings are Purrgil's data.** PTP gets read access through a service API and keeps no copy (step 1).
3. **Elo is shown to players** on `/me`, and used for pairing (step 2).
