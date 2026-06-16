# Wayfinder Companion → PTP: make the extension detectable site-wide

**Hand this to the Wayfinder team.** Small, backwards-compatible manifest change.

## Why

PTP wants to know "does this visitor have the Companion installed?" on **every**
page — to hide the install pitch on `/me`, the homepage, the stats pages, etc.,
and to switch the play page into the "Play with Wayfinder" flow.

Today the extension only injects its `<meta name="wayfinder-installed">` marker
(and fires `wayfinder:installed` / postMessages) on the **play** pages, because
`content-ptp-play.js` is scoped to:

```
https://www.protectthepod.com/pool/*/deck/play*
https://www.protectthepod.com/formats/pack-wars/*/play*
https://www.protectthepod.com/formats/pack-blitz/*/play*
*://protectthepod.net/...
http://localhost:3000/pool/*/deck/play*   (etc.)
```

So PTP can detect the extension on play pages, but **not** on `/me` or the
homepage — the marker isn't injected there. PTP currently works around this by
remembering a past play-page detection in `localStorage`, which is a heuristic
(can go stale). To make it **live and 100% reliable everywhere**, the marker
needs to be injected on all PTP pages.

## The change

Add a tiny, dependency-free **detect** content script that injects ONLY the
marker (the existing `<meta name="wayfinder-installed">` + `wayfinder:installed`
event — no lobby polling, no metadata fetch), scoped to all PTP pages:

```jsonc
// manifest.json (all three builds: chrome / firefox / safari)
{
  "content_scripts": [
    // ...existing content-ptp-play entry stays as-is...
    {
      "matches": [
        "https://www.protectthepod.com/*",
        "https://protectthepod.com/*",
        "*://protectthepod.net/*",
        "http://localhost:3000/*",
        "http://localhost:3001/*",
        "http://localhost:3022/*"
      ],
      "js": ["content-ptp-detect.js"],
      "run_at": "document_start"
    }
  ]
}
```

`content-ptp-detect.js` is just the marker injection you already have, factored
out of `content-ptp-play.ts`:

```ts
function injectMarker() {
  if (document.querySelector('meta[name="wayfinder-installed"]')) return
  const marker = document.createElement('meta')
  marker.name = 'wayfinder-installed'
  marker.content = 'true'
  try { marker.dataset.iconUrl = chrome.runtime.getURL('icons/icon-16.png') } catch {}
  ;(document.head || document.documentElement).appendChild(marker)
  document.dispatchEvent(new CustomEvent('wayfinder:installed'))
}
injectMarker()
```

Notes:
- Keep `content-ptp-play.js` exactly as-is — it still owns lobby polling,
  metadata, and the create/join-lobby message protocol on the play pages. The
  new script only adds the *presence* marker on every PTP page.
- Please also add **localhost ports 3001 and 3022** to the play-page matches (or
  `http://localhost:*/...`) so detection works on whatever port PTP dev runs on,
  not just 3000.
- Optional but nice: stamp the marker with the version and browser so the page
  can show "Companion v1.11.20 (Chrome)" — `marker.dataset.version` /
  `marker.dataset.browser`.

## What PTP does on receipt (already built)

`useWayfinderDetection()` already reads the meta tag, listens for the event +
postMessages, and bridges via localStorage. Once the marker is injected
site-wide, the localStorage bridge becomes a belt-and-suspenders fallback and
every page detects the extension **live**. No further PTP change needed.
