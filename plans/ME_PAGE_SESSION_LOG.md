# /me Page + Wayfinder — Session Log & Verification

Branch: `design/critique-cleanup` (worktree `critique-cleanup`), 22 commits ahead of `main`.
Server for local verify: `PORT=3022 npm start` → http://localhost:3022
Companion extension repo: `/Users/lee/Repos/ledwards/wayfinder` (separate commits).

> **Before committing anything new:** `git checkout -- src/data/cards.json src/data/cards.raw.json`
> (the dev server rewrites these; they are not part of any change here).

---

## What shipped this session (newest first)

| Commit | What it does | How to verify |
|---|---|---|
| `be2ae13` feat(me): Pools filters/cards, My Stats menu item, Luck intro | Pools filter relabel (All / With decks built / No decks built / Friends); no-deck pools show a single **Build Deck** CTA; decks use **Edit** (was "Open"); Copy URL/JSON are now **link/copy icon** buttons; **My Stats** dropdown item below Home; bigger right margin on /me hero avatar; Luck intro line | See **Pools tab** + **Dropdown** + **Luck tab** below |
| `d5ddac3` fix(play): leader+base header, primary Karabast CTA, tight detected box | Play page shows leader **and** base under the H1; Karabast button is the standard primary CTA; green box hugs the Companion logo only | See **Play page** below |
| `15eec1a` copy(play): refresh Companion promo + casual manual flow | "Play on Karabast with Protect the Pod" promo + 3 value props; casual manual = bullets + "3 ways to play" numbered list + green Karabast CTA | **Play page** |
| `e666d1b` fix(play): tidy the Companion panels + install promo | Cleaned the detected/install panels | **Play page** |
| `da076d4` feat(me,play): side-by-side play layout, real matchup rows, compact buttons | Play page split layout; gameplay history rows show **leader card images + real player names** (no more "Y"/"O" letter boxes) | **Play page** + **Gameplay tab** |
| `b52f3b2` fix(me): default to current playable era, not future ASH | `getCurrentEra` no longer defaults to a future set, which had made /me look empty | **Gameplay/Luck show data** below |
| `5f9cbec` feat(wayfinder,pools): reliable cross-browser detection + archetype names | Site-wide plugin detection via injected `<meta>` + event + localStorage bridge; pool names use archetype short names | **Plugin detection** + **Pool names** |
| `a9125d4` feat(wayfinder): device-aware install buttons + play-page detect override | Browser-specific install buttons (Safari/Firefox greyed "Coming soon"); `?wayfinder=1/0` override | **Play page install state** |
| `3cd44e0` fix(pools): never display a match-style name for a pool | Pools never render "X vs Opponent" as a pool name | **Pool names** |
| `d1adf32` feat(me): casual (non-competitive) games appear in gameplay history | Casual matches surface in history | **Gameplay tab** |
| `783df7a` / `1727f85` / `6ff51ed` copy-user + identity + pool-title | `scripts/copyUserToDev.ts` (npm `copy-user-to-dev`): prod→dev user copy, FK order + json stringify fixes; opponent deck identity | **Copy script** below |
| `76a2ed4` fix(me): de-dupe match history, expandable rows, plugin cards, polish | De-duped matches; expandable rows; plugin cards | **Gameplay tab** |
| `22eace6` feat(pools,play): reposition records, sealed Copy Link, Companion play flow | Records repositioned; sealed Copy Link; Companion play flow | **Pools/Play** |
| `2d42daf` feat(home): My Stats button, gold Import Pool menu, resilient release notes | Home My Stats button; gold Import Pool menu | **Home** |
| `9c6820d` feat(stats): default to latest set, Competitive wording, set-tab registry | Latest-set default; "Competitive" wording; set-tab registry | **Stats tabs** |
| `98bda9c` feat(me): Wayfinder Companion personal stats page (/me) | The /me page itself | **All of /me** |
| `0a3e086` fix(draft): competitive drafts never showed the round timer | Timer fix (migration 069) | Competitive draft round timer |
| `9553230` fix(a11y,ui): Holotable critique remediation | A11y/UI critique fixes | Across app |
| `4ff574c` / `f351dbd` chore(data/design): card data + design-system context | Card data refresh, ASH art, design context | n/a |

### Wayfinder extension repo (separate commits, must be reloaded to test)
- `11f73b9d` feat(ptp): site-wide detect script for firefox + safari too — `content-ptp-detect.{js}` now injected site-wide on protectthepod.com/.net + localhost:3000/3001/**3022**, across chrome/firefox/safari builds.
- The detect script injects `<meta name="wayfinder-installed">`, fires a `wayfinder:installed` event, and posts metadata. `/me` + play pages read it via `useWayfinderDetection.ts`.

---

## Verification checklist (do these on http://localhost:3022)

### Pools tab
- [ ] Filter row reads **All · With decks built · No decks built · Friends**.
- [ ] "With decks built" shows only pools that have a built deck; "No decks built" the inverse; "Friends" shows others' / shared pools.
- [ ] A pool with **no** deck shows a single **Build Deck** button that opens the deck builder for that pool.
- [ ] A pool **with** a deck shows **Edit** (not "Open"), plus a **link icon** (Copy URL) and a **copy icon** (Copy JSON); hovering shows tooltips; clicking flips to "Copied".
- [ ] Decklists made by someone else show **"by XXXX"**.
- [ ] Large header avatar has comfortable right margin (not jammed against the name).

### Account dropdown
- [ ] **My Stats** appears directly below **Home**, links to `/me`.

### Luck tab
- [ ] Intro line under the heading: *"Think you're lucky or unlucky? Check here to find out."*
- [ ] (Unchanged this session) set selector + scope toggle + panels still render.

### Play page (`/pool/<id>/deck/play`)
- [ ] Under the H1, both **leader and base** are shown (e.g. "Cad Bane / Bounty Hunter Base").
- [ ] **Karabast** button is the standard green/primary CTA with a right arrow, opens a new tab.
- [ ] When the Companion is detected: a small **green** box hugs just the Companion logo, "Join Public Game (X in progress)".
- [ ] When not detected: install panel with browser-specific button; Safari/Firefox greyed "Coming soon"; "also available for mobile" note.

### Gameplay tab
- [ ] History rows show **leader card images** and **real player names** — no single-letter boxes.
- [ ] Casual (non-competitive) games appear.
- [ ] No double-counted matches.

### Plugin detection (requires extension reload)
- [ ] Reload the unpacked Companion extension (chrome://extensions → reload), then load http://localhost:3022/me.
- [ ] `/me` recognizes the plugin (detection meta tag present). If not: hard-reload; confirm the extension's `content-ptp-detect` matches port 3022.
- [ ] `?wayfinder=0` forces the not-installed state; `?wayfinder=1` forces installed (for screenshotting both).

### Copy script (prod→dev user data)
- [ ] `npm run copy-user-to-dev -- <email-or-id>` copies a user's pods/pools/decks/generations prod→dev in FK-safe order. Already run for `terronk`.

---

## Known limitations / things I could NOT verify myself
- I cannot drive Safari/Firefox to click-verify detection; only built the extension change.
- I cannot view terronk's logged-in `/me` (no session).
- Mobile has no extension yet (detection won't fire on mobile).
- Detection only works after the user **reloads** the unpacked extension.
