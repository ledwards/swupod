# Release Notes

## 08.01.2026 Part 2

### 🔒 Bug Fixes
- **"Findable by Karabast users" only appears on public lobbies.** It was offered on private ones too, and because the setting is remembered between lobbies, a private lobby could be listed publicly on Karabast without you touching the checkbox — the opposite of what "Private" means.

## 08.01.2026

### 🎉 Karabast Games Show Up For Everyone

**There have been live limited games on Karabast this whole time. Unless you had the Companion extension installed, the lobby never showed you a single one.**

The board only ever learned about Karabast games from the extension relaying them out of your own browser. No extension, no games — forever, with no hint anything was missing. Protect the Pod now reads Karabast's public lobby list itself, so the draft and sealed games waiting over there are on the board for everyone.

You can join one with any of your limited decks. Karabast listings don't say which set they want, so the deck picker doesn't guess — every limited deck is offered and the lobby name tells you what the host is after.

### 🎮 A Calmer Lobby

- **The lobby leads with the logo again**, with the online counts underneath it where they used to be.
- **"Play Now" and "New Lobby" are gone.** Play Now grabbed whichever pool happened to be first — built or not — and then told you to go finish building it. Creating a lobby now lives on the Open Lobbies panel itself.
- **The whole lobby fits one screen** on a desktop, with no fold. A busy board scrolls inside its own panel instead of pushing everything else off the bottom.
- **The activity line only counts what's happening.** No more "0 open lobbies · 0 pods forming" — an activity that isn't happening simply isn't listed. "Browsing" is now "solo play".

### 🐞 Bug Fixes

- **The deck picker stopped hiding its own controls.** The deck list sat in an invisible scrolling window, so the page buttons, the set filters and the public/private choice were all parked below a fold with nothing to indicate they were there. Everything is visible at once now, and the number of decks per page adapts to your screen so it stays that way.
- **Deck tags stay on one line** instead of wrapping and doubling the height of every row.
- **The picker opens on the current set**, which is the deck almost everyone is reaching for.
- **Ashes of the Empire and Jump to Lightspeed count as current sets again.** The list of rotation-legal sets was written out by hand, so it went stale the moment a set released — ASH had been out for three weeks without being added, and JTL had been dropped a year early. Games launched with those decks asked Karabast for the wrong card pool. Rotation is now worked out from the release calendar, so it can't drift again.
- **"Private link" is just "Private."**

### 🎨 UI Improvements
- **Leader thumbnails show art, not card edges.** Every small square leader image on the stats pages — the usage legend, the leader list, the match rows, the opponent thumbs — was cropped by its own hand-tuned offset, and most of them let the card's trait bar sit along the bottom of the box. They all now use the same crop as the win-rate grid, which frames the illustration and nothing else. Because that crop is a ratio rather than a pixel nudge, it holds at every thumbnail size instead of drifting back on the small ones.
- **Chaos pools say "Chaos" in your menu.** A chaos pool's set list ran to `SOR,SOR,GC2026_SILVER,GC2026_BLACK…` and wrapped the menu row onto a second line. In the menu it now reads "Chaos Sealed", the same name it goes by everywhere else.
- **The Your Open Lobby row is one line.** It said the lobby was waiting for an opponent directly under a heading that already said so. The subtitle now carries just the deck or format that's queued up.

## 07.31.2026 Part 2

### 🎨 UI Improvements
- **The "Coming Soon" badge sits flat.** The blue gradient behind it is now a single solid blue, matching the rest of the interface, and it reads the same way everywhere it appears — set pickers, pack pickers, and rotisserie.

## 07.31.2026

### 🔧 Under the Hood
- **Deck builds now update live across your other tabs and devices.** Saving a deck in one place has always been meant to refresh the build list everywhere else you have that pool open. The socket carrying those updates was configured in a way that could never connect, so it had quietly never worked — the notification was sent and nothing was listening.

## 07.30.2026 Part 3

### 🟢 The Lobby Tells You What Everyone's Doing

**"21 players online" next to "0 open lobbies" reads like a room full of people who won't play with you. It never meant that.**

The online count includes everyone with the site open — mid-draft, mid-build, or reading stats. Now the lobby says so: **N online — X drafting · Y building · Z browsing**, with a count of games finished in the last day. When nobody's queued up, you can see it's because they're busy, not because they passed on your game.

### 🃏 Open Lobby Page Polish
- **The lobby page sits on the site's proper background** instead of flat black.
- **Deck Image works from the lobby.** It was producing grey boxes with card names instead of the cards.
- **Your Deck stays put.** The deck pane no longer grows tall enough to scroll the whole page — it scrolls inside its own panel.
- **Copy confirmations appear right under the buttons** that fired them, instead of in the corner of the screen.
- The **Your Open Lobby** row in your profile menu no longer cuts off its own text or border.
- **"PROTECT THE POD" in the lobby header is set in the logo's own type** — the wide, squared letterforms with the logo's steel finish — instead of a plain bold sans that didn't match the art sitting next to it.

## 07.30.2026 Part 2

### 🎨 UI Improvements
- **Quieter lobby copy.** A public game no longer tells you "Listed on the board." in the post-game modal and on the open-game screen — posting it there is the whole point, so the note only stated the obvious. Private games still say "Only people with the link can join," where the distinction actually matters.

### 🔧 Under the Hood
- **Solo drafters see draft lobbies again.** A solo draft deck was being described to the lobby as a sealed deck, so its owner was offered sealed games their deck could never join. It now matches on draft, like every other draft deck.

## 07.30.2026

### 🎴 8-Pack Sealed

**Sealed now comes in two sizes: the classic 6-pack pool, or 8 packs for a deeper build.**

The choice sits right where you pick your set, solo or in a pod, and it's open to everyone — no account needed for solo sealed.

Two extra packs changes the shape of a pool. There are more playables to sort through, a better shot at the bombs and the cheap interaction that hold a deck together, and enough depth to commit to a second aspect instead of settling for what showed up. If you've wanted sealed pools with more to build from, build from more.

- **Every pod remembers what it was created with**, and the lobby shows the count up front, so everyone knows what they're sitting down to before they join.
- Competitive Sealed pods choose too — they just start at 8.
- **Pool size is part of the format.** Sealed decks carry their pack count in the name, and the lobby only pairs like with like — a 6-pack pool never lands across the table from an 8-pack one.

### 🏆 Competitive Sealed
- **Sealed goes competitive.** Friends of the Pod can spin up a Competitive Sealed pod for a full table of 8: everyone opens 8 packs, decks lock after a 20-minute build window, and the pod flows straight into Swiss practice rounds — the same structured play Competitive Draft pods get, now for sealed.
- **Anyone can join one.** Creating a Competitive Sealed pod is a Friends of the Pod perk; sitting down at someone else's table is open to everybody.
- The gold competitive treatment carries through the whole flow, from the create page to the lobby, so everyone at the table knows the stakes.

### 👀 Leader Reveal Before the Draft
- **Drafts now open with a leader reveal.** When the host hits **Ready**, packs are dealt and every player's leader options appear around the table — a moment to scope out what the pod is working with before anything is picked.
- Nothing can be selected and no clocks run during the reveal. When the table has had its look, the host hits **Start Draft** to open picking (and start the pick timers in timed and competitive pods).

### 🏆 Tier Lists Now Graded by Real Draft Picks
- **ASH tier grades on Stats and My Stats now come from how the community actually drafts**, not from small-sample win rates. Leaders are ranked by a Plackett–Luce model over every reconstructed leader pick, and deck cards by a within-aspect Bradley–Terry model over 160,000+ pick decisions — the same methodology behind our GC 2026 Draft Prep report, which independently matched expert rankings.
- **No more one-game A+ leaders.** Grades now require a real sample; ultra-rare leaders show as ungraded until enough drafts have seen them. Thin samples are labeled Provisional.
- **The tier list is complete**: every graded leader and card appears, even ones without recorded match results yet. Win rates (GIH, OH, GD, GP) stay visible as context — they just no longer decide the tiers.
- **Cost and Turn lenses** now grade on the same pick-preference scale, so a great 2-drop finally out-grades a mediocre 5-drop.

### 🔧 Under the Hood
- **Draft timer reliability**: a round of refinements to how pick timers stay in sync across every player's browser, so the countdown you see always matches the one the draft is actually running on — in casual and competitive pods alike, and across pauses.

## 07.19.2026

### 🔧 Under the Hood
- **Matchmaking fix**: starting a new game now properly closes out any earlier game you were still nominally in. Previously a game that never got a recorded result could leave your next one impossible for anyone to join.

## 07.16.2026

### 🔧 Under the Hood
- **Infrastructure groundwork and fixes** across matchmaking, deck exports, and the Wayfinder Companion pipeline. Deck JSON exports are now fully compatible with Karabast's paste-import.

## 07.14.2026

### 🔬 Every Card Re-Verified by Collector Number
- **We went back through all 11 real Ashes of the Empire boxes and re-read every leader and base by its printed collector number.** The result: hyperspace leaders and bases pull at the true 1-in-6 rate, and real boxes land almost exactly 4 of each per box, so ours do too.
- **Prestige tuned to reality**: about 1 tier-1 prestige per box (occasionally 2, never a flood), matching what the verified boxes actually held.
- **Foil slot locked to the real print sheet**: the rarity mix now matches 261 real foils within a fraction of a percent.

### 🔀 Randomize Packs Deals Like a Store
- **Randomizing a sealed pool now hands you a consecutive run of packs from your box**, the same cut a store would pull off the shelf. The old version grabbed 6 packs from random spots in the box, which made pools noticeably clumpier with duplicates than real product.

### 🤖 Bots Draft Like Humans
- **Draft bots now value main-deck cards using real human picks**, built from over 160,000 pick decisions in completed drafts. Bots recognize the cards players actually fight over, so they compete for them too.

### 📊 Pick Pref on Draft Picks
- **New "Pick Pref" column in Draft Picks stats**: how often players take a card over other cards sharing its color in the same pack. It's the cleanest read on what the community thinks a card is worth.

## 07.13.2026

### 🎮 Clearer "Opening on Karabast" feedback
- **The Companion lobby buttons now acknowledge your click.** Create Private/Public Lobby and Join now show an "Opening on Karabast…" state the moment you press them, so launching a game never feels like nothing happened. If Karabast is slow or unavailable, the Companion itself now follows up with a clear "didn't respond — try again" prompt instead of leaving you waiting.

### 🎴 Pack Contents
- **Continued improvements to pack contents** as we calibrate against more real boxes.
- **Foil rarity distribution tweaks** to better match real packs.

## 07.11.2026

### 🐳 Cracking Packs for the Pod

**We opened over 300 real Ashes of the Empire packs, nearly 5,000 cards, catalogued one by one, and refined our pack generator to match.**

This is the most extensive calibration we've ever done. Two full sealed cases, a display box, and a complete Carbonite case went under the microscope: every card, every slot, every duplicate, every foil. Then we tuned the simulator against what real printers actually do.

You should notice:

- **Our simulator produces same-name duplicates at the same rate as real 6-pack pools.**
- **We validated pull rates across the board**, from legendaries, to uncommon slot upgrades, to the distribution of rarities across foil slots, and more.
- **Legendaries now hit the official ~1-in-5 rate for every Jump to Lightspeed–era set.** JTL, LOF, and SEC join LAW and ASH at Fantasy Flight's published rate (up from 1 in 6); pre-JTL sets (SOR, SHD, TWI) keep their original 1 in 8.
- **Rares, uncommons, and foils updated to even more closely match the real print-sheet patterns**, down to details like how far apart a repeated card rides on the factory line. If you've opened a real box, our boxes should feel indistinguishable.
- **Carbonite packs got the same treatment**, calibrated from a full real Carbonite case: pull rates, prestige placement, and pack layout now mirror the real product.
- **Live pack-quality stats reset to today**, so the QA dashboards now reflect the freshly calibrated generator rather than older, pre-tuning data.

Why it matters: if you practice sealed here, the pools you build from should be statistically the same pools you'd crack at your kitchen table or a store event.

### 📊 Smarter Leader Draft Stats
- **First-pick rate up front**: The Leaders table in Draft stats now leads with how often each leader is taken first, so the most-prioritized leaders rise to the top. The old "selection %" read near-identical for every leader — in a draft each leader gets picked eventually, so it told you nothing.
- **"Picked over" head-to-heads**: Click a leader to see which leaders it's taken over when they share an opening pack — how often it beats a specific rival, with sample sizes. Friends of the Pod can split it by All vs Top players.

## 07.10.2026

### 🔥 Ashes of the Empire is Live!
- **Open to all**: Ashes of the Empire has graduated from beta to pre-release and is now available to everyone. Expect subtle changes as we get our hands on more packs for analysis. Happy pre-release week, and thanks to everyone who helped test!

### 🐛 Bug Fixes
- **Discord pod chat is back**: A behind-the-scenes limit on Discord webhooks had quietly broken chat sync between pods and the #draft-now channel. Pod chat and lobby chat now share a single connection per channel, so messages flow between the web app and Discord reliably again.

### 🃏 Deck Builder — Bulk Actions in Every View
- **Playmat & Table get the full ACTIONS bar**: The bulk controls that used to live only in Arena view — **Swap**, **In Aspect**, **Out of Aspect**, and **+ All / − All** — now appear in Playmat and Table views too, so you can build fast no matter which view you prefer.
- **Cleaner sticky header**: Your own pool now reads simply as **"Original"** in the sticky nav instead of "by Original".

## 07.04.2026

### 📸 Import Pool tune-up (under the hood)
- **Faster, leaner sheet reading**: Reworked how the AI reads registration sheets during import — same accuracy, roughly 40% less compute per sheet, and better internal telemetry so we can keep improving it.

## 07.03.2026

### 🎴 Collation Fine-Tuning (LAW & ASH)
- **Calibrated against a real box**: Thanks to [Porg Depot](https://porgdepot.com/2026/07/02/ash-box-opening), we went through a real ASH booster box card-by-card and used it to fine-tune pack generation — small refinements to hyperspace upgrade slots, foil rarities, and card ordering.
- **Factory stacking order**: We also added the physical order packs get stacked into a box off the printing line, sharpening how sealed pools and draft boxes distribute duplicates.

## 07.02.2026

### 🐛 Bug Fixes
- **Competitive pack review no longer burns the next timer**: The next pack timer now starts after the 30-second review window, so each new pack opens with the full scheduled pick time.

## 06.29.2026

### 🐛 Bug Fixes
- **Draft countdowns are steadier with server latency**: Pick timers now sync to the server clock, so the visible countdown better matches when auto-picks actually happen.
- **Leaders collate more like real draft boxes**: Thanks to @Scary3074, we found and fixed a bug where leaders were not being collated correctly, allowing far too much variance in common/rare leader occurrence. You should notice far more realistic leader distribution now, especially in draft pods.

## 06.26.2026

### 🔥 Ashes of the Empire
- We spent the day watching ASH box opening videos and brought improvements to the realism of the packs. A few details remain, and our goal is to have those ironed out before ASH graduates from beta in a few weeks.

## 06.24.2026

### 🏆 Competitive Practice — Swiss Practice [Experimental]
- **Play your competitive draft out in Swiss practice rounds**: After a competitive draft, your pod is paired into Swiss rounds automatically. Owners get a **Swiss Practice** toggle (on by default), and the same matchup never repeats while a rematch-free pairing exists.

### 🎮 Live Play with the Wayfinder Companion [Experimental]
- **One-click into your match**: With the Companion installed, hit **Play** and Protect the Pod spins up the Karabast lobby for you — your opponent sees **Join** appear automatically, no link-pasting.
- **Results report themselves**: Game results flow back from the Companion to your match card automatically; the card shows three game dots for a Bo3 (grey until played).
- **Manual reporting always works**: Even without the Companion, you can report a match's result by hand so a round can still advance.

### 📊 Event Summary
- **Results & Play tabs after the event**: A post-event view defaults to **Results**, with a **Play** tab alongside.
- **See the metagame and your pool**: Meta-share pie charts and **Your Pool** rarity stats round out the event summary.

### 🔧 Data Quality
- **Manual-lobby recovery**: If the automatic lobby launch hiccups, you can still create the lobby yourself — your opponent's **Join** surfaces from it, and a result reported after a failed attempt is accepted.
- **No more jammed events**: A match stuck "creating" resets after 30 seconds, and a practice game stuck in progress can no longer jam your matchmaking — even hours later.
- **Only your series counts**: Games that don't belong to the Swiss series are rejected, so a stray Karabast game can't mis-grade your match.

### ✨ Polish
- **Set expansion art** now decorates draft lobby cards.
- **Card picks show 2-up on mobile** for an easier read. Because I keep drafting on my phone in the Waymo.

## 06.22.2026

### 🐛 Bug Fixes
- **Per-set stats now add up**: Filtering your stats by a set shows the correct matches, win rate, and game counts. Thanks for the quick report, @spacejunktroy.

## 06.20.2026

### 🎴 Competitive Draft — Pack Review
- The between-pack **Review Your Cards** peek now fills the screen, so you can take in your whole pool at a glance during the 30-second window.
- Group your drafted cards three ways with one tap — **Pack Order**, **Cost**, or **Aspect** — with graphical buttons matching the deck builder.
- **Pack Order** lays cards out in rows by pack (like a freshly opened pool); **Cost** and **Aspect** stack them into labeled columns with cost and aspect icons.
- **Small / Medium / Large** toggle to fit more cards in or see them bigger.

### 🏆 Competitive Practice Lobby & Timer
- The Competitive Practice Mode rules are now a collapsible panel (collapsed by default), tucked below Host Controls so the lobby stays clean.
- Timer settings read as fixed in Competitive Mode — **Round Timer: Competitive Rules** and **Pick Timer: disabled** — making it clear the official schedule is in effect and can't be changed.
- The in-draft timer is now labeled **Round Timer** in Competitive Mode, matching the official per-card round schedule.

### 🎥 Draft Report Slideshow
- New Slideshow mode for Draft Reports
- Review a finished draft with your pod, full-screen, ideal for screensharing on Discord — Slideshow Mode shows every seat's pack at each pick, sized to fill the screen with no scrolling.
- Tabs across the top allow you to review one player at a time or the whole team at once
- Step pick-by-pick with on-screen or left/right arrow keys, from leaders through all three packs.
- Visually highlight a player row with up/down arrows.

### ⏱️ Competitive Draft Pick Timer
- The round timer dial now follows the official per-card schedule (more time early, less as the pack empties), so the clock always matches how long you actually have — even deep into a pack.
- Pick timer is disabled in Competitive Mode (all players have the full round time to pick a card.)

### 🃏 Deck Images
- Pod deck images now include the QR code, set-art background, and full footer — matching the play-page export. All four deck-image surfaces share one renderer now.

### 📊 Your Stats
- New Your Leaders and Your Archetypes data visualization, plus a cleaned-up luck histogram and corrected spread (σ for the math dorks).

## 06.19.2026

### 🎮 Deck Stats + Homepage Polish
- **Gameplay and Matchups empty states are clearer**: Players outside the Wayfinder rollout now just see `Coming Soon`, while flagged users get the right deck-specific prompt. If Wayfinder is installed but there are no games yet, the tab points you at the play page for that deck.
- **The homepage Discord login button is easier to hit**: Logged-out visitors now get a larger `Login with Discord` button with more breathing room above and below it, while logged-in Discord prompts keep their existing size.

### ⚡ Performance
- **My Stats loads faster**: We've made the **My Stats** page noticeably quicker to load — it now fetches less behind the scenes, loads what's left in parallel, and reuses shared data across visitors, so your stats fill in faster.

### 🐛 Bug Fixes
- **Watch links on My Stats open the right replay**: On the **My Stats** Performance tab, a recorded game's **Watch** button could hit an "out of range" error and a Discord login — even for replays you own — because the replay link was built from the wrong identifier. Watch now opens the correct replay, and clicking the game row itself takes you to its match page on Wayfinder.

## 06.15.2026

### 🧭 Wayfinder Companion
- **Record your games automatically**: Install the **Wayfinder Companion** browser extension and Protect the Pod can carry your pool straight into Karabast, then tie every game you play back to that pool — wins, losses, and replays you can rewatch.
- **A new My Stats page**: Visit **My Stats** to see your win rate, format and set performance, and full game history, all linked to the pools you built. Your luck and pull data live here too.
- **Study your pools and your play**: Because games connect back to the exact pool you drafted or opened, you can finally see which of your pools and decks actually win — and learn from the replays.
- **Available across major browsers**: The Companion is live for Chrome, Brave, Edge, Safari, and Firefox — add it from your browser's store and start recording games.

## 06.11.2026

### 🔥 Ashes of the Empire
- **Starter leaders in the deck builder**: ASH's starter-deck leaders — Luke Skywalker and Emperor Palpatine — can now be added to your pool while deckbuilding with the **+ Starter Leaders** control.

## 06.07.2026

### 🐛 Bug Fixes
- **Friend of the Pod access works the moment you subscribe**: If you subscribed on Patreon and then linked your Discord account, the site used to leave you stuck waiting up to a week for a background sync. Now it asks Patreon directly on your next page load — you're in immediately.
- **Beta access is now truly automatic for patrons**: Subscribing to Patreon now grants ASH Early Access Beta in one step. No need to visit `/beta` or click an extra button — your patron status is your beta access. Existing patrons missing the beta flag are auto-healed on the next site visit.

## 06.04.2026

### 🔥 Ashes of the Empire — Early Access Beta
- **ASH is live for Friends of the Pod**: The first Ashes of the Empire cards have landed in Early Access Beta. Build ASH pools, run sealed and drafts, and start exploring Set 8 weeks before general availability.
- **Try Friends of the Pod free for one week**: Want in on ASH Early Access? [Join the Pod](https://patreon.com/ProtectthePod) — your first week is free, so you can try it with no commitment.
- **Mark your calendar**: ASH hits general availability on the **prerelease date, July 10, 2026**, with full release on **July 17, 2026**.
- **Free ASH pods for everyone**: Any ASH draft pod started by an Early Access Beta user is open to all players — non-patrons can join, draft, and play ASH for free.

## 05.24.2026

### 🐛 Bug Fixes
- **Home is back at the top of the user dropdown**: The Home shortcut has been restored to its old first-item placement in the account menu so you can quickly jump back from anywhere in the app.

## 05.22.2026

### 🦾 Infrastructure
- **Groundwork for Ashes of the Empire (Set 8)**: ASH is now scaffolded behind the scenes — set config, expansion art, pack art, and Block B belt rules are all in place, mirroring LAW. The set will stay hidden from selectors until real spoilers start landing.
- **When you'll see ASH**: Friends of the Pod in the beta program will see ASH in set pickers as soon as the first cards are on FFG's card search database. Everyone else gets it starting on the prerelease date (July 10, 2026).

## 05.12.2026

### 🐛 Bug Fixes
- **Fixed multi-aspect card sorting (LAW Finn and similar)**: Dual-primary cards like LAW Finn (Vigilance + Cunning) were bucketing into different aspect columns depending on the variant — the Normal copy sorted into the Cunning region while the Hyperspace copies sorted into the Vigilance region. The aspect sort key now ignores the source aspect order, so all variants of a multi-primary card always group together. Thanks to Bastian Winkelhaus for the report.

## 05.11.2026

### 🎮 UI Improvements
- **History card on the homepage**: The Deckbuilder column now leads with a History card so you can jump straight to your past pools and decks.
- **Smarter recent activity dropdown**: The user menu's recent list now groups by pool, so multiple builds of the same pool collapse into one entry. Each entry shows the leader of the deck you most recently worked on, making it easy to tell pools apart at a glance.

## 05.08.2026

### ✨ Multiple builds per pool
- **Build multiple decks with a pool**: Hit the + on any pool to create multiple builds with that pool. Want to try different builds with the same pool? Now you can!
- **Build together!**: Share your pool with friends and they can also try builds with your pool!
- **Play games with any deck in a pool**: Every pool has multiple decks. Select one and hit Play to try it out on Karabast or TTS.

### 🎮 Deck Builder (Arena view)
- **More settings for Pool and Deck** Both Pool and Deck have even more filter, sort, group, and view settings in Arena view. Everyone has a favorite way to organize their cards during deckbuilding, and now you can do it all.

### ❤️ Friends of the Pod \[BETA\]
- **Import Pool**: Experimental feature: Take a photo of your decklist registration to import it as a pool and deck.

## 04.23.2026

### ✨ Limited Deckbuilder
- **New Limited Deckbuilder mode**: "@BobbySapphire mode" The homepage now includes a Limited Deckbuilder mode with set selection and an infinite-pool builder. Pick any set and build from unlimited copies of its legal limited cards, with all leaders plus common and rare bases available.
- 

### 🎮 UI Improvements
- **Homepage mode art refresh**: Solo Sealed, Solo Draft, Live Draft, and Limited Deckbuilder now use updated button art treatments.

### 🐛 Bug Fixes
- **Removed starter leaders from unsupported modes**: The `Starter Leaders` control no longer appears in Draft Mode deckbuilders where it doesn't make sense.

## 04.22.2026

### 🎮 Deck Builder (Arena view)
- **Card density toggle on Pool and Deck**: Arena view Pool and Deck accordions now have S / M / L density buttons on the right-hand side. Large shows full-size cards, Medium shows the top ~25% of each card (enough to see the aspect icon) in a vertical list, and Small shows the current stacked/fanned tops. Cards keep their natural width across all three sizes. Playmat view is unaffected — density is an Arena-only control.
- **Removed duplicate Pool eye icon**: The second eye icon in the Arena Pool header row (pool aspect-penalty toggle) was redundant and has been removed. Aspect-penalty visibility for the Pool is still controlled from the Deck section's toggle.

### 🃏 Pack Generation
- **Major printer-faithful collation improvements**: Pack generation has been refined to follow physical printing methods more closely, with broader use of belt-driven upgrades, better seam-aware spacing, and collation-first handling across standard packs and LAW slot behavior.

### 🤖 AI Players
- **Bots now build the deck they actually drafted toward**: During draft, bots persist their committed leader and planned base color as they form a lane. Post-draft deck building now reuses that exact commitment instead of re-deriving a new leader/base from the final pool.

### 🐛 Bug Fixes
- **Fixed SWUDB export failures for some legacy decks**: A bounded set of older deck builder saves had card objects missing `cardId`, which could prevent Hyperspace cards from downgrading to their regular versions during export. A production data backfill repaired these saved decks so exports work again without adding permanent compatibility code.
- **Fixed legacy Hyperspace exports**: Affected legacy decks now correctly convert Hyperspace cards down to their regular versions when exporting to SWUDB.
- **Shared pools now preserve each person's own build**: When you open someone else's shared sealed pool and build from it, Clone and Ready to Play now use your current deck state instead of snapping back to the pool creator's saved build.

## 04.15.2026

### ✨ Competitive Practice Mode (Friends of the Pod)
(still in beta testing, be patient while we get this feature working perfectly)
- **New Competitive Practice Mode drafts**: Friends of the Pod can create Competitive Practice Mode drafts with official tournament pick timers, no chat during drafting, no card review between picks, and a 30-second inter-pack review period.
- **20-minute deck build timer**: A countdown timer enforces the competitive deck building time limit.
- **Full 3 Rounds of Swiss matchmaking**: After deck building, the host starts 3 rounds of BO3 Swiss-paired matches. Round 1 uses opposite-seat pairings, rounds 2-3 use Swiss pairings with Opponent Match Win % tiebreakers.
- **Game-by-game result reporting**: Players report each game of their BO3 match individually. Results auto-confirm when both players submit matching results. Wayfinder plugin results are auto-ingested.
- **Matchmaking panel**: The play page shows round tabs, match cards with player pairings, and a standings view with W-L-D records after all rounds complete.
- **Pod owner controls**: The host can override match results, boot players (forfeiting their active matches), and reassign byes.
- **Gold competitive theme**: Competitive drafts have a distinctive gold visual treatment on UI elements.

### 🐛 Bug Fixes
- **Fixed competitive toggle on draft creation**: The Competitive Practice toggle was always disabled due to checking the wrong property for patron status. Now correctly reads patron status from the auth context.
- **Moved competitive toggle**: The competitive toggle now appears on the draft landing page next to "Create Draft" instead of on the set picker page, making it more discoverable.
- **Fixed wrong leaders appearing in archetype stats**: 24 Leader slots (including Grand Moff Tarkin, Yoda, Darth Vader, Boba Fett, and Moff Gideon) were being overwritten by Organized Play promo variants that share the same cardId. Card lookup now correctly prefers the Normal variant, so leaders display correctly in stats views and external platforms like Wayfinder.

## 04.08.2026

### 🤖 Bot AI Strategy Improvements
- **Neutral leader alignment fix**: Bots with neutral leaders (Tobias Beckett, Saw Gerrera, DJ) no longer pick Heroism/Villainy cards they can't play. Previously these cards had zero alignment penalty with neutral leaders.
- **Turn-1 play saturation**: Bots stop hoarding 1-cost cards once they have enough. A bot with 8 one-drops now deprioritizes picking more, making early-game cards less likely to dry up in the draft.

## 04.07.2026

### ✨ Draft Reports (Friends of the Pod)
- **New Draft Report page**: After completing a draft, Friends of the Pod can view a comprehensive report of their draft at `/draft/{id}/report`. Includes tabbed sections for Draft Seating, Draft Log, Pool, Deck, and a Gameplay placeholder (coming soon with Wayfinder integration).
- **Golden glow Draft Report button**: A glowing gold button appears on Pool, Deck Builder, and Play pages linking to your draft report.
- **Draft Reports list page**: Access all your past draft reports from the user dropdown menu under "Draft Reports".
- **Public/Private sharing**: Toggle your draft report between public and private, and share with a direct link.
- **Deep-linkable tabs**: Each report tab has a hash anchor (`#seating`, `#log`, `#pool`, `#deck`, `#gameplay`) for direct linking.
- **Notes tab**: Write and save personal markdown notes on your draft reports. Notes are publicly visible when the report is shared. Includes a markdown reference popup.
- **Seating shows final state**: The seating chart now shows all 3 drafted leaders per player (not the current pack). The chosen leader is bolded.
- **Non-patron upgrade prompt**: Non-patrons see a description of Draft Reports and a link to the Patreon page instead of just a back button.
- **Draft Reports perk listed**: The Support the Pod page now lists Draft Reports as a patron perk.

### 🎮 UI Improvements
- **Expand/collapse draft pick window**: New button in the upper right corner of the cards section lets you expand it to full width (hiding the player circle) or collapse back to default. Press Escape to collapse.
- **No more layout shift from timers**: The draft pick area no longer jumps up/down when timers appear or disappear. Space is always reserved.
- **Selection and passing banners moved below cards**: "Selected: Card Name" and "Passing Left/Right" banners now appear below the card grid instead of above it, in both leader and pack draft phases.
- **Timer centered in Your Cards modal**: The pick timeout timer in the "Your Cards" review modal is now centered at the top instead of clipped to the right.
- **Draft Log button moved to top**: The Draft Log button now appears next to Practice Hand at the top of both the pod page and play page.
- **Wayfinder on pod page**: Plugin users now see the Wayfinder lobby buttons on the pod page after drafting, not just on the play page.
- **Draft Report shows username**: The Draft Report label now shows "DRAFT REPORT | username" with the username in bold white.
- **Deck tab fallback**: When a deck hasn't been built yet, the Deck tab shows the full drafted card pool instead of a blank page.
- **Drop button redesigned**: The drop/leave button on the draft landing page is now an X icon instead of a door icon.
- **Draft Log button on Deck Builder**: The Draft Log button now appears in the Deck Builder header alongside other action buttons.
- **Draft Log button spacing**: Fixed missing spacing between the Build Deck and Draft Log buttons on the pool page.
- **Play buttons get triangle icon**: All Play buttons across the app now show the play triangle icon consistently.
- **Solo draft text update**: "Find a human opponent to play your deck!" now reads "You need to find a human opponent to play your deck!"
- **Support the Pod page scrolls**: The support page now scrolls vertically on smaller screens instead of clipping content.
- **More spacing on Support page**: Added breathing room between the action buttons and the sponsor/teammate sections.

### 🐛 Bug Fixes
- **Fixed card pool detection for Karabast**: Play instructions now dynamically detect the latest released set instead of being hardcoded to LAW. Current set drafts correctly show "Card Pool: Current" instead of "Unlimited".
- **Fixed broken Showcase Collection page**: Showcase card images were not loading because card IDs in the database were in an old numeric format that didn't match the current UUID-based card data. A data migration converts all old card IDs to the correct format across all tables.
- **Fixed draft pick recording**: Draft picks were failing to save to the analytics table due to a column rename that wasn't applied everywhere. Picks now record correctly for both human and bot players.
- **Fixed draft report pages**: Draft reports were returning 500 errors due to a nonexistent column reference. Reports now load correctly.
- **Fixed broken draft log and picks endpoints**: Several API endpoints were returning 500 errors due to a column name that was missed during an earlier table rename.
- **Fixed deck inclusion stats**: The deck inclusion stats page was failing to match deck cards against pool cards because internal IDs and display IDs were being compared. Deck stats now use display card IDs consistently.
- **Improved card enrichment in draft stats**: Draft pick and draft log APIs now look up cards by multiple ID formats, so older draft data displays correctly with full card details.

## 04.06.2026 (2)

### 🃏 Draft Pool
- **Draft Log button on draft pool page**: The Draft Log button now appears on your draft card pool page, right next to Build Deck.

### 💬 Chat Improvements (continued)
- **Join Discord nudge**: If you're logged in but not yet in the Protect the Pod Discord server, the chat panel shows a dismissible invite button.

### 🐛 Bug Fixes
- **Fixed "Still deckbuilding..." showing incorrectly in draft log**: If your pool isn't linked yet in the draft log, your own seat now shows a "Go to pod to build deck" link instead of the misleading "Still deckbuilding..." message.

## 04.06.2026

### 💬 Chat Improvements
- **Chat messages now visible to everyone**: Pod chat and lobby chat messages are now visible even if you're not logged in. No more empty chat panel for newcomers.
- **Anyone logged in can chat**: You no longer need to be a member of the Protect the Pod Discord server to send messages — any Discord login works.
- **Join Discord nudge**: If you're logged in but not yet in the Discord server, a dismissible banner in the chat panel invites you to join.

### 🐛 Bug Fixes
- **Fixed deck builder redirect loop**: Clicking "Build Deck" on a solo sealed pool was redirecting back to the set selection page in some cases. This was caused by a database migration not yet being applied when the API was first hit. The API now handles this gracefully.

## 04.05.2026

### ⚡ Wayfinder Integration
- **Wayfinder integration?**: Preparing the way for a new set of features. More soon!

### 🎮 UI Improvements
- **Recent pods and pools now at the top of the user menu**: Your most recent live pod and solo pool now appear right at the top of the user menu dropdown (just below Home), making it faster to jump back into a game in progress.

### 💬 Chat
- **Chat hidden in solo draft mode**: Solo drafts are solo — chat is now hidden when there's no one else in the pod.

## 03.20.2026

### 🃏 Pack Changes
- **Fixed missing neutral, mono-Heroism, and mono-Villainy cards in packs**: These cards were appearing less frequently than expected. The belt interleaving algorithm was clustering small aspect groups (neutrals, mono-alignment cards) in the first few positions, so they were rarely drawn in 6-pack sealed pools. All card types now appear at equal rates. This improvement applies to all sets.

## 03.19.2026

### 🎮 Karabast Limited Format Support
- **Play your draft and sealed decks directly on Karabast!** Thanks to the Karabast team, Karabast lobbies now support Limited format decks. You can create or join lobbies with your Protect the Pod deck — use your deck link or JSON paste as your decklist. The "Ready to Play" instructions have been updated with the new lobby settings.
- **Two Limited modes on Karabast**: Current (LAW, 30+ card decks) and Unlimited (any set, anything goes). The play page now tells you which Card Pool setting to use based on your deck's set.

### 🐛 Bug Fixes
- **Fixed rainbow selection border missing on foil/showcase cards**: The selection highlight was being clipped on foil and showcase card styles, making it impossible to see which card was picked in draft logs.
- **Draft Log preserves card order**: Cards in each pick now display in their original pack order instead of moving the picked card to the first position.
- **Non-picked cards dimmed in Draft Log**: Cards you didn't pick are now dimmed so your actual pick stands out clearly.

## 03.17.2026

### 🖼️ Deck Images
- **Deck images now generated by swuapi**: Discord deck image posts (for both players and bots) are now generated server-side via the swuapi card image API, replacing the old broken Playwright approach. Images now render correctly with proper card art and variant support.
- **Fixed wrong card art in deck images**: Cards like "Bodhi Rook" that appear in multiple sets were sometimes showing the wrong version. Deck images now use exact collector number lookups to always show the correct card.

### ⚡ Performance
- **Stats page loads faster**: Added database indexes and caching for the stats page queries, which were previously scanning 500K+ rows. Stats now load significantly faster and cache for 5 minutes.

## 03.15.2026

### 🐛 Bug Fixes
- **Fixed card preview hijacking taps on iPad**: Quick taps on cards were opening the enlarged preview instead of adding cards to deck. Card preview now requires a long press on all touch devices (tablets and phones), so normal taps work as expected.
- **Fixed bot decks having fewer than 30 cards**: When bots drafted many off-color cards, the aspect penalty caps would reject cards without backfilling, resulting in decks under 30. Bot decks now always hit 30 cards.

### 🤖 AI Players
- **Bot draft logs are now public**: Bot players' draft logs are now visible to everyone, not just pod participants. You can see exactly what bots picked and why.
- **Better bot Discord posts**: Bot deck posts now link to the Draft Log and View Pool (for drafts) or View Pool (for sealed), instead of the old play page link.
- **Fixed viewing bot decks**: Non-owners viewing a bot's deck builder no longer trigger 401 errors from failed auto-save attempts.

### 💬 Post to Discord
- **Post to Discord** Once you build a deck, share your deck, pool, and draft history to the Protect the Pod Discord for feedback and discussion at #pool-discussion. Posts your deck image, leader, base, and a link to your pool — and creates a discussion thread automatically. I'm hoping this ends up a very popular feature as we all try to learn from each other!

### ❤️ Support the Pod
- **Fixed automatic Discord role assignment**: Patreon subscribers should now automatically receive the "Friend of the Pod" Discord role. Previously, the webhook wasn't able to find your Discord connection — now it does an API lookup as a fallback.
- **Free trial support**: Free trial Patreon subscribers now get immediate access, same as paid patrons.
- **Helpful error message**: If we still can't find your Discord link, the beta page now shows a message explaining how to fix it (link Discord on patreon.com/settings/apps).

### 🎮 Gameplay
- **Clearer post-draft instructions**: The play page now says "Deck Complete!" and explicitly tells you to find a human opponent on Karabast. Bots draft with you, but you play against other humans.
- **Solo draft notice**: Solo drafts now show a clear message that this was a simulated pod — you can't play the bots, but you can check out their decks.
- **Draft log on play page**: The draft log is now accessible from the play page so you can review picks without navigating back.
- **Smart timeout picks**: If you time out on a pick, the system now uses the top player bot strategy to make a smart pick for you instead of picking randomly. It considers your drafted leaders and cards to pick something in-color. Doing you a bit of a favor here I suppose, but if you disconnect randomly, at least it won't pick garbage for you.

### 💬 Chat UX Improvements
- **Smarter chat defaults**: Chat now opens automatically during pod formation on desktop, then closes by default once you move into drafting/sealed/deck building so it's not in the way. If you manually open or close chat, your preference is remembered as you navigate between pages.
- **Unread message indicator**: When chat is closed and a new message arrives, the chat toggle pulses with a green glow so you never miss a message.

### 🤖 AI Players
- **Bots now read signals**: Bots track which colors are available in the packs they receive — if good cards in a color keep showing up at mid-to-late picks, that color is open. Bots use this to choose leaders whose colors are flowing at the table, and will pivot to a different leader if their colors are being cut. This is the same signal-reading technique real players use.
- **Earlier, smarter commitment**: Bots commit to a leader and base color earlier (by mid-pack-1) and will continuously re-evaluate if the signals say their colors aren't open.
- **Fixed bot deck building**: Bot decks now strictly enforce the 5 off-aspect card limit for LAW and at most 1 opposing alignment card. Previously, bots could have 10-16 off-aspect cards.
- **Fixed color vs alignment scoring**: Bots were treating alignment aspects (Heroism/Villainy) as color matches — a card like Scarif Lieutenant [Command, Heroism] was scored as "in-color" for an Aggression/Heroism leader. Alignment is NOT a color. Fixed.
- **Bot pools are now public**: Bot deck links are always accessible — no more broken links when viewing bot decks from Discord. Check out #draftbots to see their decks.
- **Smarter drafting**: Off-color penalty post-commitment is now absolute — any in-aspect card always beats any off-aspect card, no exceptions. Off-aspect cards only enter the pool as forced last picks.

### 🎨 UI Improvements
- **Various draft UI tweaks**: Several small UI fixes and improvements on Draft.

## 03.14.2026
Major updates to the draft bot AI. Try it out and let us know what you think!

### 🤖 AI Players
- **7 unique bot strategies**: Draft bots are no longer all the same! Each bot now uses one of 7 distinct strategies: Top Player (drafts like the best), Tournament Player (drafts like competitors), All Player (community consensus), Nemesis (counter-drafts you in solo mode), Diversity (maximizes aspect spread), Primary Color Corner (locks one color early), and Secondary Aspect Corner (locks hero/villain alignment). No two bots in a pod use the same strategy.
- **Mixin modifiers**: Each bot also gets a random personality modifier — High Optionality (stays flexible longer), High Conviction (commits early), or High Groupthink (follows the crowd). This means even bots with the same strategy will draft differently.
- **Per-leader card popularity**: Bots now use leader-specific card popularity data. After committing to a leader, they prioritize cards that are popular with that specific leader, not just overall.
- **LAW splash rule**: In LAW, bots will now intelligently splash 3-5 off-aspect bombs when exactly one primary color is out of aspect, matching how real players build LAW decks.
- **Leader trait synergy**: Bots recognize when their leader's text mentions a trait (like SPECTRE or OFFICIAL) and prioritize cards with that trait.
- **Bot deck summaries on Discord**: After every draft, Leebo posts each bot's deck to the #draftbots Discord channel — including their strategy, personality modifier, leader choice, and a link to view their full pool and deck. See how the bots build!
- **Consistent bot strategy**: Bots now use the same strategy for deck building that they used during the draft. Previously, deck building used a random strategy, which could lead to inconsistent leader/card choices.

### 🐛 Bug Fixes
- **Chaos Draft pack count**: Fixed a bug where Chaos Drafts with more than 3 selected packs (e.g., 2 SHD + 2 LAW) would only generate 3 packs. All selected packs are now properly generated and drafted, with leaders and cards mixed across sets as expected.

### 🎨 UI Improvements
- **Landing page redesign**: Solo and Live Pod columns now each show Sealed, Draft, and Other formats. Smaller logo, bigger buttons, tighter spacing, players-online count moved under logo.
- **URL consolidation**: `/formats` is now the canonical hub for casual formats. `/casual` redirects to `/formats` for backward compatibility.
- **Release notes**: Yo dawg, I heard you like release notes. Fixed horizontal scrolling in release notes — text now wraps properly.

## 03.13.2026
Happy LAW release day! It's also a big release day for Protect the Pod!

Analytics is now much more fully featured for all users, check it out: [https://protectthepod.com/stats](https://protectthepod.com/stats).

We've added a lot of benefits to the Patreon membership. Professional Analytics, early access to features and beta release exapnsion sets, and golden flair for your avatars so everyone know you are awesome.

What are "Professional Analytics?" Two things so far:
1) **Tournament Players** We've cross referenced melee.gg data to our user list and found almost 300 of you who are competing limited tournaments around the world! These "tournament players" have slightly different stats than the general population, so players can compare their choices to these global tournament players.
2) **Top Players** Using melee.gg, we can also determine the subset of these tournament players who have ranked highly at these events. The data aggregated among the best of the best players is maybe the most exciting part of Professional Analytics.

I always want the entire community to have access to important data about online limited play. But analytics is not free! (I've already had to upgrade the database once since rolling out analytics.) Professional Analytics is intended to be a perk for our power users who want to support development and hosting of PTP, not as a gate for information.

We've also added a button to the analytics page to let anyone download their raw draft and sealed data to do analysis on it. Even if you aren't a data expert yourself, try pasting that downloaded file into an AI chatbot like ChatGPT or Claude and ask the chatbot questions about your data. You might be surprised at how much you can learn this way!

### ❤️ Support the Pod
We've launched all new rewards for Friends of the Pod (our Patreon supporters).
Join [https://www.patreon.com/c/ProtectthePod/membership](here)! Or try a free 7 day trial of these perks via Patreon.

- **Professional Stats**: Access draft and sealed data across top limited players.
- **Beta Access**: Access early features and pre-release sets by becoming an exclusive beta tester.
- **Discord Access**: Join the supporters-only Discord channel with the dev team.
- **Avatar Flair**: Special avatar treatment so everyone knows you're a supporter.
- **Support the Pod**: Earn the eternal gratitude of the community for being a supporter of the pod!

### 🎮 Gameplay
- **A Lawless Time!**: LAW is now in release mode. Thanks everyone for helping test, especially my data collectors and beta testers!

### 📊 Stats Page
- **Data visualizations**: Pie charts for leader draft frequency and bar charts for top 25 cards now appear at the top of each tab, giving you an at-a-glance view before the detailed tables.
- **Search and aspect filters**: Filter buttons let you filter stats tables by aspect and search them by text.
- **Download personal data**: Logged-in users can click "Download Personal Data" to export all their pods, pools, decks, and draft picks as a JSON file. Includes opponent Discord handles and their drafted leaders, draft picks in order, and IDs linking everything together. Other users' data is not included in the export other than their Discrd handles.
- **Delta badges**: Your stats now show comparison arrows (green/red) against All, Tournament, and Top players so you can see where you're above or below average.
- **Deck inclusion bug fix**: Card variants (Normal, Foil, Hyperspace, etc.) are now aggregated as one card in deck inclusion stats instead of being counted separately.
- **Off-aspect inclusion rate**: New column in sealed stats showing how often each card is played outside its natural aspects (with the +2 resource penalty). Includes a bar chart visualization.
- **Leader synergies**: Each leader now shows its top 5 "high synergy" cards — the cards most disproportionately included in decks with that leader compared to overall. Each card also shows the top 3 leaders it's most popular with.

### 🐛 Bug Fixes
- **Patreon free trial support**: Free trial signups on Patreon now correctly assign the Friend of the Pod role automatically. Previously, trials could be missed because Patreon sends a different webhook event for brand new users.

### 🤖 AI Players
- **Smarter bot leader picks**: Bots now pick leaders based on overall popularity (total times picked by humans) instead of first-pick rate. This fixes an issue where bots were over-drafting niche leaders like Darth Vader in LAW. Bot popularity data excludes other bots to avoid feedback loops.
- **Updated fallback rankings**: Default leader rankings for all 7 sets updated from real production draft data.

### 🐞 Bug Fixes
- **Stats hydration error**: Fixed a React hydration error on the stats page caused by `<div>` inside `<p>`.
- **Sort indicator spacing**: Sort arrows in stats tables now have proper left padding.

## 03.08.2026

### 🃏 Pack Generation
- **Real prestige card data**: Prestige cards in Carbonite and standard packs now use real card data from the API instead of synthesized clones of Normal cards. This means correct prestige artwork, accurate collector numbers, and the real prestige card pool — which includes Uncommons, not just Rares and Legendaries. All three tiers (Standard Prestige, Foil Prestige, Serialized Prestige) are now distinct variant types with real images. Affects JTL, LOF, SEC, and LAW.
- **Improved belt collation from physical pack research**: Common and uncommon belts now match real-world printing behavior more closely. Same card never repeats within 24 positions (was 4-12), and adjacent cards on the belt never share the same primary aspect. Fixed a bug where recent cards were excluded from boots entirely, causing unequal occurrence rates — every card now appears exactly once per belt cycle as intended. These improvements apply to all sets.

### 📊 Stats Page
- **"Built Deck Only" filter**: New checkbox to filter draft pick stats to only include data from players who actually built a deck and hit Play. Helps distinguish serious drafters from those who abandoned their pools.
- **Stats page restructured**: The stats page now has Draft and Sealed tabs per set. The Draft tab shows leader draft pick order, leader deck selection rates, and card draft pick analytics. The Sealed tab shows leader selection rates and card inclusion rates (how often a card is included in a deck when it appears in a pool).
- **Leader stats**: New leader analytics showing draft pick order (average pick position, first pick rate) and deck selection rates (how often each leader is chosen when building a deck). Leader card previews display in landscape orientation.
- **Editable date range**: Stats can now be filtered by date range with an inline date picker UI.
- **Default to LAW**: Stats page now defaults to LAW (latest set) and lists sets in reverse chronological order.
- **Default to humans only**: Bot data is excluded by default — toggle bots back on with the filter checkbox.
- **Pool type filtering**: Deck inclusion and leader selection APIs now support filtering by pool type (draft vs sealed), so Draft and Sealed tabs show format-specific data.

### 🐞 Bug Fixes
- **Draft picks API fix**: Fixed a column reference bug (`pod_id` → `draft_pod_id`) in the draft picks stats endpoint that caused all draft pick queries to fail.

## 03.07.2026

### 🃏 Pack Generation
- **LAW UC3 upgrade rate and rarity distribution updated from physical data collection**: Based on observation from #community-box-mapping, the UC3 slot now upgrades to Hyperspace at ~1/3 rate (was 1/5), and upgraded cards follow weighted rarity distribution: 60% Uncommon, 30% Rare, 7.5% Special, 2.5% Legendary. Previously UC3 could only upgrade to R/L — now it correctly produces HS Uncommons ~60% of the time, matching real-world packs. Prestige rate remains ~1/18 (checked first, takes priority).
- **LAW Carbonite rarity distribution updated from physical data collection**: Carbonite pack HS and HSF slots now use a tiered architecture verified from a real LAW carbonite case opening. HS slots: 4 fixed Common + 3 weighted flex (63% UC, 32% C, 3% R, 1% S, 1% L) + 1 guaranteed R/S/L top slot. HSF slots: 4 weighted flex (44% UC, 43% C, 10% R, 1.5% S, 1.5% L) + 2 fixed Common. Overall distribution now closely matches observed rates (~62% C, ~24% UC, ~9% R, ~3% S, ~3% L for HS).

## 03.06.2026

### 🃏 Pack Generation
- **LAW common belt assignments verified from physical packs**: Belt A/B rules for A Lawless Time commons now match real-world print collation. Belt A contains blue-first, red-first, and mono-faction (Villainy-only, Heroism-only) commons. Belt B contains yellow-first, green-first, and neutral commons. This is different from Sets 4-6 which grouped by different aspect combinations.
- **LAW common slot HS upgrades**: 1 in 48 packs upgrades Belt A's 4th common to a Hyperspace common; same for Belt B's 1st common. Controlled by a 48-pack collation belt so every box (24 packs) gets exactly 1 of these upgrades. The upgraded slot gets a fresh card from the Hyperspace common belt.

## 03.05.2026
Happy pre-release everyone! As we are able to open physical product, we will be improving the algorithm for generating A Lawless Time booster packs. Let us know in the Discord how your PR event went, and if PTP helped you prepare. Good luck, and have fun!

### 🤖 AI Players
- **Data-driven bot drafting**: Bots now use real human draft data to make smarter picks. They learn from leader first-pick rates, card average pick positions, and deck profiles from actual human drafts. An exploration phase (picks 1-5) keeps options open before committing to a leader and color identity for the rest of the draft. Falls back to hardcoded rankings for sets without enough data.

### 🎮 Game Modes/Gameplay
- **Pod mode requires 2+ humans**: People using multiplayer mode for solo draft against bots are spamming the matchmaking Discord! Pod mode is for multiplayer, Solo mode is for solo players — so pods now require at least 2 human players to start. If you start a Pod mode pod with only bots, you'll see a message with a link to Solo Mode instead. This should reduce noise in the matchamking channels on Discord.
- **Auto-cleanup Discord embeds**: When a pod with fewer than 2 humans is cancelled, the Discord embed is automatically deleted instead of leaving a red ❌ cancelled card. Pods with 2+ humans still show the cancelled state for history and to help the human players know what happened.

### 🎨 UI Improvements
- **Ownership-aware play page**: When viewing someone else's shared deck, the play page now shows whose deck it is with appropriate instructions instead of "Your deck is ready." Non-owners see steps to get their own deck, and the Edit Deck button is hidden. The "Save Your Deck" login banner only shows for anonymous (unowned) pools.

### 📱 Mobile
- **PWA Discord login fix (Android)**: Logging in with Discord from the "Add to Home Screen" PWA now works correctly. Previously the OAuth flow would complete in the browser but the PWA wouldn't pick up the session.
- **Mobile draft lobby overhaul**: Player circle uses all available screen width, tighter spacing between title/circle/player count/share URL, "Share URL" label and button on one line, and host control buttons (Randomize Seats, Shuffle Packs, Add Bot) flex-wrap on one row.
- **Mobile leader draft circle fix**: Player avatars pulled inward so they don't overlap with leader pick info labels. Labels wrap instead of overflowing off-screen.
- **Pack opening animation fixes**: Skip button now says "Skip →" instead of ">>", prerelease banner is a full-width top bar instead of a floating pill that overlapped packs, Open All/Shuffle buttons moved to top-left on mobile, and broken pack images no longer show "PACK" fallback text.
- **Carbonite pack alignment**: Carbonite edition packs in chaos sealed now align left like normal packs instead of centering.
- **Back button alignment**: Back button on the Other Formats page is now pinned top-left instead of centered.

### 🐞 Bug Fixes
- **Draft pack passing with fewer than 8 players**: Fixed a bug where drafts with empty seats would stall during pack passing. Packs would show a loading animation instead of cards, and refreshing showed the same pack. Seat assignment now uses sequential numbering instead of spread seating.
- **Solo draft play page**: Solo drafts (1 human player + several bots) now show sealed-style instructions on the play page instead of suggesting you try to find a nonexistant opponent for the draft.
- **CORS fix for deck export API**: External tools like Karabast can now fetch deck JSON via cross-origin requests. The preflight OPTIONS request was missing CORS headers, blocking browser-based imports.

## 03.02.2026

### 📱 Mobile
- **Chat starts collapsed**: Chat overlay no longer opens automatically on mobile. Tap outside or the close button to dismiss.

### 🐞 Bug Fixes
- **Chaos sealed/draft naming**: Pool names now show unique sets only (e.g. "SOR-TWI" instead of "SOR, SOR, SHD, SHD, TWI, TWI") and use range format for consecutive sets.
- **Pack opening animation**: Booster pack images are no longer clipped during the opening animation.

## 03.01.2026
This is a huge update, maybe the biggest yet. We are now a deck provider for Karabast, pods can be organized via chat and Discord (which sync with each other)

### 🎉 New Features
- **Karabast deck source**: Instructions at the end of a draft or sealed experience will now guide you to paste a URL into Karabast, where we are an official deck source.
- **New homepage navigation**: You can choose btween Draft and Sealed, Solo Play and Pod Play right from the homepage.
- **Discord threads per pod**: Now you can keep an eye on #draft-now and #sealed-now to see pods forming and get in on the action. Every pod created on the site makes a new thread in Discord. Click the link provided by our friendly (maybe not so friendly) server droid Leebo to join.
- **Pod chat persistence via Discord**: Chat messages in public pods are now persisted through Discord threads. Navigate between lobby, draft, deckbuilder, and play pages without losing chat history. Private pods still have live real-time chat, but no history persistence.
- **Carbonite Booster Packs**: Premium all-variant packs for Sets 4-7 (JTL, LOF, SEC, LAW). Every card is a foil, hyperspace, prestige, or showcase variant. Pre-LAW packs have rarity-specific foil and hyperspace slots; LAW packs use weighted mixed-rarity hyperspace. Each pack includes a guaranteed prestige card and a hyperspace leader (with a chance of showcase upgrade). Selectable right now only in Chaos Sealed and Chaos Draft.
- **Private pods**: Pods can be made private to prevent showing up in the lobby and having chat available publicly. Private chats are also never stored to the database, or anywhere else server-side.
- **Chaos Sealed/Draft improvements**: Pack count now goes up to 12 (was 10).

### 🎮 Host Controls
- **Kick player from pod**: Hosts can now remove players from draft and sealed lobbies. Hover over a player's seat to reveal a red X button, click it, confirm in the modal, and the player is removed. The kicked player is redirected to the LFG page with a message explaining they were removed. Works for both human players and bots.
- **Bot join messages**: Bots now show a join message in the pod chat when added, matching the behavior of human players joining.

### 📦 Pack Generation
- **LAW pack structure update**: Slot 5 is now a dedicated Hyperspace common from its own belt (equal distribution across all HS commons). The other 8 common slots no longer upgrade to Hyperspace. UC3 can now upgrade to Prestige tier 1 (~1/18 rate, checked before HS R/L fallback). The rare/legendary slot can no longer upgrade.

### 🎮 Game Modes/Gameplay
- **Hide Discord banner for members**: The "Join the Community" Discord banner on pod play pages is now hidden for users who are already Discord members.

### 🎨 UI Improvements
- **Clickable links in chat**: URLs in pod chat messages are now clickable hyperlinks that open in a new tab.

### 🐞 Bug Fixes
- **Auto-rejoin bug**: Fixed a bug where leaving a pod would immediately re-add the player due to the auto-join logic firing.
- **Deck builder loading state**: The deck builder no longer shows misleading action buttons while loading. Removed "Login to Clone" text in favor of just "Clone".
- **Consistent status labels**: Unified player status labels to "Deckbuilding" and "Ready" everywhere (was inconsistent between different views).
- **Sealed remove player fix**: Fixed the sealed remove player API using the wrong ID field, which caused "Player not found" errors when trying to kick players (including bots).

## 02.28.2026

### 🎮 Game Modes/Gameplay
- **Draft Pod and Sealed Pod pages**: Draft and Sealed pod modes now have dedicated landing pages with create, join, and history sections. Solo modes show "Solo Draft" and "Solo Sealed" titles.
- **Draft table visibility restored**: During leader draft, all players can now see each other's available leader packs again (simulating a physical table). Pack card counts are also visible for all players during the draft.
- **Host controls improvements**: Public/private visibility toggle, configurable round timer and last-player timer durations, and reorganized button layout.

### 🎉 New Features
- **Copy Deck Link for all users**: The "Copy Link" button on the Play page is now available to everyone, not just beta testers. Paste your deck link directly into Karabast to play your drafted or sealed deck online.

### 🐞 Bug Fixes
- **Empty draft packs fix**: Fixed a bug where draft pods could be created with empty packs if the card cache wasn't initialized. Card cache now self-initializes on first access, preventing silent empty results.

## 02.27.2026

### 📦 Pack Generation
- **LAW foil position**: In LAW packs, the Hyperspace Foil card now sits between the commons and uncommons (index 11), matching real-world pack collation. Sets 1-6 are unchanged.
- **Special rarity in UC3 upgrades**: For sets 4+ (JTL, LOF, SEC, LAW), Special rarity cards can now appear when the 3rd uncommon slot upgrades to a Hyperspace rare/legendary. Specials appear at the same per-card frequency as rares.

### 🎮 Game Modes/Gameplay
- **Spread seating**: Players joining a draft or sealed pod are now seated to maximize distance from existing players around the circular table, rather than filling seats sequentially. This improves fairness in pack passing for partially-filled pods.

## 02.26.2026

### 🎉 New Features
- **Solo and Pod modes**: The homepage now separtes into Solo and Pod modes. Use Solo to rpactice by yourself, or to make Limited format decks that you can play against someone later. Use Pod Play to join an existing Draft or Sealed Pod listed publicly on the site, or to start a private pod with your friends.
- **Sealed pods**: You can now start a Sealed Pod. Just like a Draft Pod, but sealed!
- **Draft logs**: You can now see your Draft picks in order after the fact to help improve your draft picking. These default to private, but can be made public by clicking the lock icon so you can share with friends and teammates for feedback.
- **Stats overhaul**: Stats is now focused on competitive data based on anonymized, aggregate data collection. Pack quality metrics are moved to the QA page.
- **Public API**: A very early API supports these statsand also exporting your personal data. Documentation at [https://www.protectthepod.com/api](https://www.protectthepod.com/api)

### 📦 Pack Generation
- **Foil legendary rate fixed**: Fixed foil slot over-representing legendary cards. 

### 📊 Stats & Quality
- **Duplicate metrics split by format**: Duplicate/triplicate tracking now separates sealed pools (6 packs per pool) from draft (3 packs per player). Previously draft data was mixed into sealed expectations, producing extreme z-scores. Sealed groups by pool, draft groups by the 3 packs each player opens. Both display separately on the QA page.

### 🐞 Bug Fixes
- **Card preview on hover not working in Draft**: Fixed a bug where the enlarged card preview on hover was broken for some Chrome desktop users during the draft picking phase.

### 📝 Terms of Service
- **No tournaments allowed** We want to make clear that Protect the Pod exists to support the Star War Unlimited limited scene, not replace it. Tournaments are not allowed on the platform, which is intended purely for competitve practice and fun casual formats. More information about this rule on the Discord.

## 02.24.2026

### 🎉 New Features
- **Karabast deck source integration**: Added a deck.json API endpoint for compatibility with Karabast and other SWU tools. A companion PR has been submitted to the Karabast project to add Protect the Pod as a supported deck source.
- **Copy Deck Link on Play page**: Copy your deck link directly from the Play page to paste into Karabast.
- **Play page improvements**: Updated instructions with Discord link for finding opponents.
- **Card preview on iPad**: Tap any card on iPad to see an enlarged preview. Tap anywhere outside the card to dismiss. (Phones still use long-press.)

### 🔒 Security
- **Leader draft pack visibility**: During the leader draft phase, other players' available leader packs were visible via network inspection (browser DevTools). Leader packs are now only sent to the owning player, preventing opponents from seeing what leaders are available to other drafters.

### 🐞 Bug Fixes
- **Sticky nav bar positioning fix**: Fixed a rare bug where the deck builder's sticky navigation bar could appear in the middle of the page with blur overlay covering content. Caused by CSS `will-change: transform` interfering with `position: sticky` during view mode transitions.

## 02.23.2026

### 📦 Pack Generation
- **Rare slot never upgrades to Hyperspace**: Fixed incorrect behavior where rares/legendaries in the rare slot (index 14) could upgrade to Hyperspace variants. Per real-world TCG collation, the rare slot card is ALWAYS the Normal variant. Hyperspace rares/legendaries only appear via UC3 upgrade (3rd uncommon slot → random HS R/L from belt). This affects all sets 1-7.

### 🎉 New Features
- **Practice Hand**: On the Play page, click "Practice Hand" to draw 6 random cards from your deck and see what your opening hand might look like. Click "Draw Another" to shuffle and draw again. Shows the probability of drawing at least one turn-one play and the average number of turn-one plays in your opening hand, accounting for aspect penalties from your leader and base.

### 💽 Data Changes
- **Built deck tracking**: Added database tracking for when users play decks from pools. This data will help analyze pool-to-deck conversion patterns and improve pack generation quality metrics.

## 02.19.2026

### 📦 Pack Generation
- **LAW rare bases fixed**: Rare bases in LAW now correctly appear in the rare/legendary slot, same as all previous sets. Previously they were incorrectly placed in the base slot.

### 🐞 Bug Fixes
- **Deck name no longer grows infinitely**: Fixed a bug where switching leaders/bases kept appending to the deck name (e.g., "SEC Sealed (Jabba Green) (Jabba Green) (Lama Su Green)..."). Names now correctly replace the leader/base suffix. Dates removed from default names for cleaner display.
- **Deck names capped at 80 characters**: SWUDB rejects names over 80 chars, so we now enforce this limit in the UI and truncate in all export paths.
- **Deck export variant fix**: Hyperspace and Foil cards now correctly export as their Normal variant IDs for SWUDB/Karabast compatibility. Also fixed Chaos Sealed exports not building the variant map across all selected sets.

## 02.18.2026
This is a big one. I'm proud to get this live within just a few hours of the full set being spoiled, including major changes to how packs are made (no regular foils, guaranteed hyperspace per pack) and how aspect filters need to work from a UI design perspective to accommodate multi-aspect cards.

One of the big use cases here will be practicing for pre-release, so we also added the ability to put hyperspace leaders into your sealed pools.

Finally: Hope to see some of you at the largest U.S. SWU Limited event in Milwaukee, WI this weekend!

### 🎉 New Features
- **A Lawless Time (LAW) Now Live**: Set 7 is now available for all users! Pre-release disclaimer shown during pack opening notes that collation is our best guess until we have more real-world data.
- **Starter Leaders**: In the deck builder, click "+ Starter Leaders" next to the Leaders header to add the Hyperspace versions of the set's starter deck leaders to your pool. Great for practicing with the pre-release leaders in sealed!
- **Shuffle Packs**: New button in sealed and draft lobby to shuffle which packs you receive from a simulated 24-pack booster box. Just like cracking a real box, you can now randomize your position in the box before opening your packs. This matters, becuase the way TCG packs and boxes are collated in real life invovles some amount of patterning that reduces variance. Shuffling packs increases variance, and shoudl result in more duplicates and triplicates in sealed pools. We will be collecting data as people use this feature to see how it affects statistical distributions.
  - Sealed: Click "Shuffle Packs" before opening to get a random selection of 6 packs from the 24-pack box
  - Draft: Host can shuffle packs in the lobby before starting

## 02.15.2026

### 🌀 Chaos Mode Improvements
- **Chaos Sealed open access**: Chaos Sealed no longer requires authentication. Jump right in without logging in, select your 6 packs, and start building!
- **Full base selection**: Chaos draft and chaos sealed now show deduplicated common bases from ALL selected sets, not just the primary set. For example, a 6-set chaos pool now shows 8 common bases (4 aspects × 2 HP tiers) instead of only 4 from one set.

### 🔐 Draft Authentication
- **Friendly auth flow**: Draft modes (including Chaos Draft) now show helpful login prompts instead of dead-end errors. Click "Login with Discord" and you'll be redirected right back to continue where you left off.
- **Why drafts need login**: Multiplayer drafts require Discord login to track players, but we've made the process seamless.

### 📦 Pack Generation Quality Fixes
Stats page caught three issues in production data - fixed them all:

- **Same-treatment duplicates eliminated**: Added final deduplication pass after variant upgrades to catch edge cases where the same card+variant+foil appeared twice in a pack. Previously 13/876 packs had this issue, now 0.
- **Hyperspace common rate fixed**: Hyperspace common upgrades now always succeed. Previously some upgrades failed silently when variant card data was missing (~2.3% observed vs 3.7% expected).
- **Foil rarity distribution fixed**: Foil slot now targets correct percentages (Common ~75%, Uncommon ~17%, Rare ~5%) by dynamically calculating weights based on actual card pool sizes. Previously Uncommon was underrepresented (11.6% vs 17% expected).

## 02.14.2026

### 📦 Pack Generation Quality Fix
Stats page is doing its job, alerting me to anomalies in pack generation so I can fix them!

- **Legendary rate fixed**: Fixed a critical collation error where legendary cards sometimes did not appear at their correct rates of 12.5% (Sets 1-3) and 16.7% (Sets 4-6).
- **Hyperspace R/L rate fixed**: Same bug existed on hyperspace belts - now produces correct hyperspace legendary rates.
- **Deduplication improved**: Added full-segment deduplication to prevent same base treatment cards from appearing within 6 slots of each other in rare cases.

### 📊 Stats & Quality
- **Duplicate/triplicate analysis**: Stats page now shows duplicate and triplicate distribution metrics per set. Tracks both "base treatment" (Normal variants only) and "any treatment" (exact card matches). Values are compared against expected statistical baselines using z-score validation.
- **QA tests expanded**: Added statistical tests for duplicate/triplicate rates with per-set expected values derived from baseline analysis of 500 pods per set.

## 02.13.2026

### 🎉 New Features
- **Swag store**: Added "Shop the Merch" link on the About page — check out the official Protect the Pod merch at swag.protectthepod.com!
- **Multi-primary aspect filters**: Arena view now supports LAW set cards with multiple primary aspects (e.g., Aggression+Command). These appear as compact filter buttons below the standard combos in each aspect group. Iterating on this design to get it right before the release of A Lawless Time.
- **Other formats**: New other formats (Chaos Draft and Chaos Sealed) — build a sealed pool from any 6 packs across any combination of sets! We are urrently also testing Pack Wars and Rotisserie Draft!

### 👕 Swag Store
- **Swag store**: If you love us enough to rep us on your chest, head, back, or hands, check out the swag store at swag.protectthepod.com provided by Fourthwall!

### 🎨 UI Improvements
- **Mobile landscape**: Arena mode now works on phones turned sideways! Cost columns wrap into two rows of four. Nav bar compresses to a single row. Unfortuntely this just doesn't fit in portrait mode, so it won't be supported there.
- **Arena deck sorting**: Cards in cost columns now sort by cost, then aspect color order, then alphabetically (instead of just alphabetical).
- **Error pages**: Nice little easter egg in the error pages for anyone old enough to remember Twitter's failwhale.

### 📦 Pack Generation
- **Foil rarity weights**: Fixed foil slot weights to match actual belt output. Special rarity foils in sets 4-6 now correctly appear at the same rate as Rare foils.
- **Hyperfoil tracking**: Fixed hyperfoil cards being tracked as regular foils instead of hyperspace foils.
- **Slot type accuracy**: Sealed packs now use position-based slot types for tracking, so uncommon-to-rare upgrades don't inflate rare slot statistics.

### 📊 Stats & Quality
- **Stats page**: www.protectthepod.com/stats shows information about the current statistical state of the pod. Quality metrics include foil rate, hyperfoil rate, and showcase leader rate, pack structure, distribution, and more. The stats page should help build confidence around the quality of pack generations.
- Added QA tests for legendary rate, hyperfoil rate, showcase leader rate, and more (185 total QA tests)

## 02.11.2026

### 🎉 New Features
- **Other Formats (Beta)**: New alternative limited formats for beta testers! Includes Chaos Draft, Rotisserie Draft, Pack Wars, and Pack Blitz. More details coming as each mode is implemented.

### 🎁 Patreon
- Some of you have asked about how to support Protect the Pod and I want be clear that the site is free to use. That being said, it does cost me a bit of money every month to host, as well as tokens to develop, so I certainly won't say no to help offsetting the cost! You can support Protect the Pod via [Patreon](https://patreon.com/ProtectthePod) with my thanks!
- We also have an about page now with shoutouts to my teammates.

### 🐞 Bug Fixes
- **Arena view filters**: Fixed a bug where filters were not being applied correctly

## 02.10.2026

### 🎨 UI Improvements
- **Arena view**: Lots of tweaks, optimizations, and style fixes
- **Deck image export**: Reduced image size for Discord upload compatibility

### 💽 Data
- Major improvements to hyperspace collation that should make packs more realistic.
- A few things to prepare for A Lawless Time!

## 02.07.2026

### 🎉 New Features
- **Arena View**: Magic Arena fans rejoice. New deckbuilder layout for desktop with split-screen pool/deck, aspect filters, and cost-column organization inspired by everyone's favorite online limited deckbuilder. Thanks to Eric Hunter for the idea.
- **Pool Image Export**: When viewing a deck image, click "Show Pool" to generate a full pool image showing your deck, other leaders, rare bases, and remaining pool cards. Great for sharing your sealed pool with friends.

## 02.06.2026
### 💽 Data
- Tracking pack generation data for a near-term feature related to quality control

### 🎨 UI Improvements
- Some increased consistency in UI elements around the site
- Stats page: Renamed tabs to "Code Quality" and "Pack Quality" for clarity
- Stats page: All numbers now display with comma formatting (1,234 instead of 1234)

### 🐞 Bug Fixes
- Fixed Discord login button on Play page not working when logged out

## 02.04.2026

### 🐞 Bug Fixes
- Fixed user menu dropdown flickering and failing to load recent pools/drafts
- Fixed showcase collection attribution so your pulled showcases properly appear in your collection

## 02.01.2026

### 📦 Pack Generation
- **Incorporated results from data collection efforts**: Thanks to the Discord community for their contributions, we now fill the common slots in booster packs in a way much more closely resembling physical packs.
- **Improved belt refill**: Updated the way belts refill themselves from printer sheets to ensure constraints across the "seams". End result is 100% compliance with collation rules such as distance between duplicates and aspect diversity.

### 🔧 Maintenance
- Added comprehensive QA tests for seam-aware belt behavior
- Documentation audit: Improved documentation for code generation agents

### 🤖 AI Players
- Added list of most powerful cards in the SEC limited format based on great videos by wooooo and Thorkk. Drafting bots will favor these powerful cards in their aspects.

- ## 01.31.2026

### 🎉 New Features
- **Easter egg**: If you can find it...

## 01.30.2026

### 🎉 New Features
- Fancy pack opening animation that makes the app look like it's professional 😉
- Mon Mothma ignores aspect penalty on Officials. Hera Syndulla (SOR) ignores aspect penalties on Spectres. Will have to consider how to handle optional aspect penalty ignoring leaders like Anakin Skywalker (LOF) and Hera Syndulla (LAW).

### 🎨 UI Improvements
- Mobile: Overhauled pack opening with carousel layout and cards that fit on screen
- Mobile: Deckbuilder redesigned with full-width blocks and streamlined controls
- Pack opening animation now skippable at request of Teddy

### 💽 Data Changes
- Hyperspace Foil variants now properly appear in booster packs at ~1/50 rate
- Improved variant downgrade for deck exports (foil/hyperspace cards correctly map to base versions)
- Not pleased with data quality I was getting from third party sources, so I made my own api that directly sources starwarsunlimited.com, launched that too, and am consuming it here now. This should also help with adding LAW as soon as possible.

### 🐞 Bug Fixes
- Fixed missing aspect penalty on mobile
- Fixes to a number of bugs related to users who are not logged in
- More reliably save deck state during deckbuilder if you leave the page or refresh
- Fix deck image export on Chrome
- Fix bug that sometimes made a deck appear empty

### 🔧 Maintenance
- Added robust variant downgrade utility with full test coverage
- Fixed flaky statistical tests in belt system

## 01.29.2026
Great news, with this update, I'm excited to announce the migration to Railway.app as our new hosting platform. This move enables a shift to a lightning-fast, robust realtime architecture based on socket.io, ensuring more reliable multiplayer experiences.

We've also revamped the deckbuilder based on some community feedback, making it more intuitive and consistent across Sealed and Draft modes.

After a few more UI updates, the next focus area will be data quality and improving pack generation even further.

Additionally, we've got a Discord now: [https://discord.gg/u6fkdDzWqF](https://discord.gg/u6fkdDzWqF). Join to find games and give feedback on the app. See you there!

### 🦾 Infrastructure
- Brand new hosting on Railway.app
- Robust socket.io-based realtime architecture

### 🎨 UI Features
- Brand new deckbuilder design that is consistent between Sealed and Draft modes and better reflects how players construct limited decks.
- Fancier deck images
- Maintenance mode, 404, and 500 error pages using failpurrgils

## 01.28.2026

### 🎉 New Features
- Release notes display on landing page (lol)

### 🦾 Infrastructure
- Improved draft reliability with new real-time event-based architecture

### 🐞 Bug Fixes
- Fixed player circle positioning on mobile devices
- Fixed leader card clipping in sealed pools on mobile
- Removed hover effects on touch devices for opponent leaders
- Improved support for smaller desktop displays
- Fixed mobile layout flex-direction causing off-center player circle

---

## 01.14.2026 - Initial Release

### 🎉 New Features
- Sealed pool generation with proper booster pack simulation
- Draft pod creation and management with 2-8 players
- Leader draft phase with 3-round drafting
- Pack draft phase with dynamic pass-left/pass-right rotation
- Bot players with random drafting behavior
- Real-time multiplayer synchronization
- Discord authentication and user accounts
- Draft and sealed pool history
- Comprehensive deck builder
- Mobile-responsive design

### 📦 Pack Generation
- Accurate booster pack simulation for all 6 sets
- 4,973 cards from SOR, SHD, TWI, JTL, LOF, SEC
- Proper rarity distribution including foils, hyperspace, and showcase variants
- Statistical QA validation (100 packs per set)

### 🎨 UI Features
- Card preview on hover
- Timer panels with pause/resume
- Player status indicators
- Aspect-based card coloring
- Multiple deck builder view modes

---

## How to Update Release Notes

1. Each deploy/push gets its **own date section**, even if there are multiple on the same day. Add it at the top (above the previous section). Do NOT edit a previous section to add new items — always create a new section.
2. Use US date format (MM.DD.YYYY). If there are multiple sections for the same date, use `Part 2`, `Part 3`, etc. to distinguish separate releases from that day.
3. Use emoji categories:
   - 🎉 New Features
   - 🐞 Bug Fixes
   - 🎨 UI Improvements
   - ⚡ Performance
   - 🦾 Infrastructure
   - 🔒 Security
   - 📝 Documentation
   - 🔧 Maintenance
   - 🃏 Pack Changes
   - 💽 Data Changes
   - 🤖 AI Players
   - 🎮 Game Modes/Gameplay
   - ❤️ Support the Pod
4. Keep entries concise and user-friendly
5. Prefer `npm run release-notes:update -- --input <file>` (or pipe markdown into the script). It compares local `RELEASE_NOTES.md` against `origin/main` / `origin/master` and:
   - reuses today's latest unpushed local section if one already exists
   - creates `Part 2`, `Part 3`, etc. once there is already a pushed release section for today

Run `node scripts/postbuild.js` to update the release notes on website.
