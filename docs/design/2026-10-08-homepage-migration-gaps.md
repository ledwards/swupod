# PTP homepage migration: capability gaps

Compared the new shared homepage with both production homepage branches: LandingPage (regular accounts) and EntryFlow/EntryHome (eligible beta accounts), plus the existing /lobby discovery board. This comparison concerns discoverability from home; existing destination routes remain available.

## Missing or changed homepage entry points

1. **Resume unfinished drafts, sealed pods and deck builds.** EntryHome's /api/entry resumes includes the latest unfinished item and a More dialog. LandingPage also has active draft and sealed-pod rejoin banners. The replacement only resumes a Purrgil game/queue/private reservation.
2. **Full personal stats (/me).** The new Stats tile opens Purrgil Elo and game results. PTP's broader analytics remain accessible through the preserved account menu → My Stats; this is a changed tile destination, not removal of the feature.
3. **Complete pool/draft history (/history).** New History is game replays/runs. Decks and Pools reads the playable limited library, which is not demonstrated to include every older pool, abandoned draft, unfinished pool and historical record from PTP History. The full PTP History remains in the account menu.
4. **Limited sandbox deckbuilder (/deckbuilder).** The old homepage has an unlimited-copies builder shortcut; replacement has none.
5. **Existing open native lobbies.** EntryHome lists /api/play/native/public entries; the replacement lists shared queues, draft pods and spectator games, not that legacy lobby inventory.
6. **Sealed pods and dedicated solo/friends entry choices.** Draft and Sealed now go directly to /draft and /sealed as requested. The home page no longer directly offers /draft/solo and /sealed/pod; the destination pages must supply those choices.
7. **Release notes and support/about navigation.** The original homepage includes the ReleaseNotes popup and SiteFooter links. The new footer has privacy, terms, Discord, Patreon and Swag, but not the complete SiteFooter menu.
8. **Release/prerelease/beta onboarding.** Existing date/countdown, subscription conversion, prerelease and beta activation panels are absent. They were not restored because the requested homepage removes promotional copy. Decide which functional access/activation links need a quieter home.
9. **Meta Stats shortcut (/stats).** Available on the previous /lobby discovery board; absent from the replacement homepage.

## Preserved or intentionally changed

- Draft, Sealed and More Formats destinations remain available.
- Constructed Premier/Eternal, queue, private invitation and AI choices are now a full page.
- Header navigation links removed as requested; History/Stats/Decks and Pools remain utility tiles.
- Themes and Settings use icons; website dialogs omit board move/minimize controls.
- PTP's existing signed-in account drawer is reused, preserving its account/admin/import/support actions.
- Local Discord login uses the existing callback and restores the exact Constructed URL; verified with an actual signed-in account.

## Rollout status and checks

Implemented in the local PTP homepage at http://localhost:3000, backed by a separate local gateway/runtime. Production homepage has not been switched. Build the shared UI with `npx vite build --config vite.ptp.config.ts` in Purrgil, then run `node scripts/sync-play-home.mjs <purrgil-source>` in PTP. The deploy must include the updated gateway's played-deck/history capabilities before promoting this homepage.

Recommended first parity work: restore unfinished-item resumes; choose whether the Stats tile opens /me or provides both PTP and online-game stats; ensure Decks and Pools covers the full historical library; restore the sandbox builder and old open-lobby access. These are functional gaps, not reasons to reinstate the removed header or promotional copy.
