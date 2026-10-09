# Event cosmetics v1

Implemented 2026-10-08 across PTP, Purrgil, Wayfinder and SWUAPI. Code and local tests are complete for the initial six-item GC catalog. Production rollout is complete and live checks pass; see the release manifest in the parent event-cosmetics-release directory for deployed IDs and screenshots.

## Verified ownership flow

The controlled live test proved that Melee's **Discord User Name** setting is not visible on the signed-out profile. **Bio is visible**. `/connections/melee` links to <https://melee.gg/Profile/Settings> and instructs owners to preserve their Bio and add the generated `PTP-…` code on its own line. Save, return, verify, then remove the code. Melee may require saving a single space to clear an otherwise empty Bio. Both temporary test markers were removed and the signed-out profile rechecked.

PTP authenticates the owner and obtains their stable Discord ID from its database. The browser cannot choose a Discord subject. Wayfinder issues a 192-bit challenge, stores only SHA-256, requires the dated connection notice, and expires codes after 15 minutes. It resolves the authoritative stable Melee account through canonical SWUAPI player accounts, excluding legacy tournament participant IDs and source-less duplicate L2 rows. It identifies an unambiguous canonical Melee account and validates a fresh Bio observation plus a fresh stable-ID-to-current-username lookup. SWUAPI uses its existing signed-out Browserbase collector and Melee's public player-details request, without an OAuth partnership. Profile URLs are constructed from validated handles; redirects, blocked pages and mismatches fail closed. Browser recording/logging are disabled for these checks. No raw Bio or marker is stored by the application.

A transaction consumes proof and enforces one active Melee identity per Discord account and one active Discord claimant per Melee ID. Duplicate claims disclose no other owner and direct the player to DM Lee. Disconnect invalidates active challenges and increments link version. Explicit erasure removes the private link, challenge and reward snapshot. Owner status can be downloaded; public identity, replay access and team membership remain independent.

## Source catalog and entitlement

SWUAPI `/event-cosmetics` publishes reviewed items with stable IDs, four supported kinds (`mat`, `sleeve`, `promo`, `initiative`), HTTPS art, source provenance and mapped events. Catalog revision is a deterministic content hash. `/event-cosmetics/attendance` accepts only authenticated internal requests containing a stable Melee ID, never Discord identity.

Initial seed: four GC2026 prize-wall mats and two sleeves, mapped to LCQ `403891` and main day one `403893`. Sources: [official prizes](https://galacticchampionship.starwarsunlimited.com/2026/prizes) and the existing Wayfinder GC2026 asset inventory. Digital access requires attendance, not physical prize redemption. Coverage is explicitly partial. Promo/initiative slots are implemented but have no seed items. Prerelease participation rules and art need individual review; no guessed grants are seeded.

Attendance requires a scored, non-bye, non-forfeit match with both source accounts, or eligible explicit check-in/organizer evidence. Registration and aggregate standings are insufficient. A negative organizer review overrides match evidence. Source corrections and reward withdrawal take effect on the next authorization read. Source account/event merges carry evidence and mappings; parent deletion cascades derived reward relationships.

Wayfinder mirrors scoped grants into `event_cosmetic_snapshots` and reads this L2 table for output. Responses have a five-minute expiry and are bound to the current private-link UUID/version. An in-flight response cannot restore disconnected or erased access. Upstream failure grants nothing new, even if an older snapshot remains stored.

PTP owns `event_cosmetic_loadouts`. The internal GET returns catalog, current access, sanitized saved choices and version. POST rechecks access/slot/publication/revision/expiry, then uses compare-and-swap versioning; rejected writes preserve saved choices. Supporters get every available item independently of attendance; current gameplay access (alpha tester or admin) remains required. These optional source calls are separate from core gameplay entitlements so source outages do not disable games.

Purrgil sends the authenticated session subject to PTP, ignores client subjects and requires same-origin mutations. The event collection previews locked items and offers Melee linking or membership. Match snapshots carry only approved asset references per seat, and persist across reconnects while that match session remains live. Spectators receive appearance, never private links or unlock reasons. Missing assets fall back to defaults. Artwork changes no engine card identity or statistics. Replay archives do not yet preserve these new cosmetic snapshots beyond live-session retention; historical replay appearance is a follow-up.

## Configuration and rollout

1. SWUAPI: apply migration `140_event_cosmetics.sql` with the normal migration runner. Configure a fresh `MELEE_PROFILE_SERVICE_KEY` of at least 32 characters and existing `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID`. Run `node scripts/import-event-rewards.js` only after both event IDs resolve uniquely. The import is transactional/idempotent and preserves explicit publication/withdrawal decisions.
2. Wayfinder: apply `0401_melee_reward_links.sql` and `0402_event_cosmetic_snapshots.sql` through the existing migration runner. Configure the same `MELEE_PROFILE_SERVICE_KEY`, `SWUAPI_URL`, and a separate fresh `PTP_REWARD_LINK_SERVICE_KEY` of at least 32 characters. Deploy the authority before exposing the PTP form.
3. PTP: apply `113_event_cosmetic_loadouts.sql` through its normal migration runner. Configure matching `PTP_REWARD_LINK_SERVICE_KEY`, `WAYFINDER_REWARD_LINK_ORIGIN` (default `https://plugin.wayfinder.news`) and `SWUAPI_URL`. Existing Purrgil host-service authentication protects internal loadout endpoints. No service key belongs in a `NEXT_PUBLIC_*` variable.
4. Deploy PTP then Purrgil. Smoke-check owner login → code → live proof → collection → equip → next game → spectator; test a non-attendee, unavailable source, duplicate claim and disconnect. Inspect only aggregate outcomes, never log code/Bio/private identity joins.
5. Roll back UI/services to the prior release if needed; leave additive tables intact. Revoke the dedicated service keys to disable linking/attendance quickly. Cosmetics failures render defaults; supporter items still require an available reviewed catalog.

No extension/plugin artifact changed, so no extension version bump is needed.

## Validation recorded

- Controlled signed-in save / signed-out read / restore on Melee; live Browserbase source read also confirmed the same stable account ID/current handle and blank restored Bio.
- Wayfinder: eight PostgreSQL-backed tests cover consent, owner isolation, duplicate claim, single use, disconnect race, snapshot/erase behavior, source-account deletion and field-scoped parsing; TypeScript passes.
- SWUAPI: source authentication/validation and recycled-handle rejection; merge helper tests. Isolated local PostgreSQL test applies migration 140, imports the seed twice, and exercises qualification, corrections, denial and withdrawal using actual SQL. All fixtures roll back.
- PTP: six focused handler/loadout tests; desktop and phone connection browser flows; TypeScript passes.
- Purrgil: full unit and gateway/entitlement/lobby suites, policy tests and four desktop/phone collection browser tests; production build passes. Screenshots were visually inspected.

The live source catalog has six published items, all artwork responds with HTTP 200, and the authenticated attendance endpoint has passed a live read. Full deployed UI verification is recorded in the release manifest.

## Production design integration

Preserves the current Purrgil Themes, Token sets, Token cards, Card backs and Playmats pickers; Events is the only additional tab. The four new mats also appear in Playmats, and the two sleeves reuse the existing Card backs entries and their cropped artwork. Supporters see all published items in Unlocked with no Locked section, Melee prompts or upsells. Category selections and Events share the same server-validated loadout. Existing native selections remain available.

Final production checks: actual signed-in supporter sees all six items unlocked with no locked section or Melee CTA; equip survives reload and the original selection was restored. The live PTP form issues a challenge and verification correctly rejects an absent Bio code. No production Melee account link was completed. The final Wayfinder deployment includes the concurrent archetype media-count fix and passes authenticated status. All four services are healthy.
