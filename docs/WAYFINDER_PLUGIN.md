# Wayfinder Plugin (browser extension)

**Wayfinder Companion** is the browser extension that tracks Star Wars: Unlimited
games — personal match log, replay, and meta analysis. It is the **source of the
game/match records** surfaced in this app (deck W/L/D, `wayfinderMatchIds`, the
`WldBadge`). Anything in Protect the Pod that talks about "play with the plugin",
"your record", or matchmaking depends on it.

## Where the code lives

The extension is **not in this repo**. It lives in a sibling repo:

```
/Users/lee/Repos/ledwards/wayfinder/
├── apps/extension-chrome     # Chrome / Brave / Edge build (Manifest v3)
├── apps/extension-firefox    # Firefox build
├── apps/extension-safari     # Safari (macOS) build
└── apps/web                  # wayfinder.news web app (canonical install CTA: PluginInstallInlineCta)
```

- Name: **Wayfinder Companion**. Description: "Track your Star Wars Unlimited
  games online. Personal match log, replay, and meta analysis."
- The Chrome manifest's `host_permissions` include `www.protectthepod.com`, so
  the extension's content scripts run on this site.

## Install / store links

- Chrome Web Store: `https://chromewebstore.google.com/detail/wayfinder-companion/econclbajpendbppldcnpngjfddcogfh`
- Safari / App Store: `https://apps.apple.com/app/id6779564194`
- Firefox AMO: `https://addons.mozilla.org/en-US/firefox/addon/51dd34375c8e4087bdf5/`
- Downloads also via Wayfinder web where applicable:
  `/api/plugins/download?platform={chrome|safari|firefox}`

## How this app detects + talks to it

- **Detection:** the extension's content script injects a DOM marker
  `<meta name="wayfinder-installed" data-icon-url="...">` and fires a
  `wayfinder:installed` event. Components read the meta tag and listen for the
  event to set `wayfinderDetected` (e.g. `app/pool/[shareId]/deck/play/page.tsx`,
  `app/draft/[shareId]/pod/page.tsx`).
- **Messaging:** the extension posts `window.postMessage` events such as
  `wayfinder:lobby-count` and `wayfinder:metadata`.
- **URL:** `process.env.NEXT_PUBLIC_WAYFINDER_URL ?? 'https://plugin.wayfinder.news'`.

## Data contract and UI surfacing

Protect the Pod receives Wayfinder game data through two service endpoints:

- `GET /api/plugin/v1/play/{format}/{shareId}` returns the set code, format,
  Karabast card pool, competitive flag, and public lobby name needed to launch
  the correct Limited game from a PTP pool.
- `POST /api/plugin/v1/match/result` records the completed game or match with
  `poolShareId`, `matchId`, `result`, optional `gameNumber`, `replayUrl`,
  `practiceMatchGameId`, `wayfinderGameId`, `format`, and captured deck identity
  fields for both player and opponent.

Those fields surface in the app in three places:

- `src/components/PlayInstructions.tsx` shows the user that the pool/match is
  linked, results return to PTP, and replays appear in My Stats.
- `src/components/MatchCard.tsx` shows live Swiss status, spectate links, and
  per-game replay links once Wayfinder reports them.
- `src/components/YourStats/GameplayDashboard.tsx` and
  `app/api/stats/me/gameplay/route.ts` display personal replay history from both
  `practice_matches` and `casual_matches`.

## Personal performance page ("My Stats")

The personal-performance page **is in this repo: `app/me/page.tsx` → `/me`**
(added on branch `codex/me-wayfinder-ui-polish`; not yet on `main`). The homepage
**"My Stats"** button links to the relative `/me` — NOT to the Wayfinder domain.
Don't confuse this with `/stats`, which is meta/pick stats (its "You" tab is just
activity counters from `/api/stats/me/summary`, not game W/L). Per-match detail
still lives at `{wayfinder}/matches`.

## Where it's used in this repo

- `src/components/PlayInstructions.tsx` — the **"Play with Wayfinder" vs "Manual"**
  tabs (create/join lobby with the plugin, or copy-deck-link manual flow). This is
  the existing plugin-aware play UI to reuse/extend.
- `docs/WAYFINDER_PLUGIN_LIVE_SWISS.md` — the live Swiss Practice
  create/join/lifecycle/result contract for competitive draft pods.
- `src/components/MatchCard.tsx` — links each match to `/matches/{wayfinderMatchId}`.
- The `.../deck/play` and format `.../play` pages — detection + the `WldBadge`
  (wins/losses/draws) record.
- `wayfinderMatchIds` / `wins` / `losses` / `draws` on a pool come from
  Wayfinder-tracked games.
