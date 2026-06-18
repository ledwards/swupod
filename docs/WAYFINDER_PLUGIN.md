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
- Downloads also via Wayfinder web: `/api/plugins/download?platform={chrome|safari}`
- Firefox / Safari mobile availability is limited by each browser's extension
  model (see `PluginInstallInlineCta` in the Wayfinder `apps/web` repo for the
  canonical per-platform copy/handling).

## How this app detects + talks to it

- **Detection:** the extension's content script injects a DOM marker
  `<meta name="wayfinder-installed" data-icon-url="...">` and fires a
  `wayfinder:installed` event. Components read the meta tag and listen for the
  event to set `wayfinderDetected` (e.g. `app/pool/[shareId]/deck/play/page.tsx`,
  `app/draft/[shareId]/pod/page.tsx`).
- **Messaging:** the extension posts `window.postMessage` events such as
  `wayfinder:lobby-count` and `wayfinder:metadata`.
- **URL:** `process.env.NEXT_PUBLIC_WAYFINDER_URL ?? 'https://plugin.wayfinder.news'`.

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
- `src/components/MatchCard.tsx` — links each match to `/matches/{wayfinderMatchId}`.
- The `.../deck/play` and format `.../play` pages — detection + the `WldBadge`
  (wins/losses/draws) record.
- `wayfinderMatchIds` / `wins` / `losses` / `draws` on a pool come from
  Wayfinder-tracked games.
