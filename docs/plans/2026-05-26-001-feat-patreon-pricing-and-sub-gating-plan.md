---
title: "feat: Patreon $9/mo Price Raise + Next-Set Preview Sub-Gating"
type: feat
status: active
date: 2026-05-26
deepened: 2026-05-26
---

# feat: Patreon $9/mo Price Raise + Next-Set Preview Sub-Gating

## Overview

Raise Patreon membership pricing to **$9/mo** (annual deferred until eligibility met), rely on Patreon's native grandfathering to preserve existing supporters at their current rate (backed by a one-time DB snapshot for dispute resolution and an empirical pre-flight verification), verify the Patreon → Discord → site privilege chain still works after the raise, and add three new conversion surfaces: (1) next-set preview cards on every set picker, (2) a homepage promo banner with a transient lock-in-window variant, and (3) a dismissible sub-marketing banner for non-subs who join a pod that uses unreleased-set content.

The implementation is mostly UI work plus one operational/Patreon-dashboard change and a small data-snapshot unit. Patreon's native grandfathering means we do not need migration code for the price raise itself; the snapshot is purely defensive observability.

---

## Problem Frame

Current state:
- Patreon tier price exists only on Patreon (no price strings in this codebase).
- Patron status is checked **live** from Discord guild membership on every request (`lib/patreon.ts`, `app/api/auth/patron-status/route.ts`); the DB stores zero patron data.
- Beta access is **date-driven** (`isSetBeta` in `src/utils/api.ts`): a set is "beta" when `now < prereleaseDate`. Users with `is_beta_tester=true` (granted on enroll after live `isPatron` check) get `includeBeta: true` and see unreleased sets in the picker. Everyone else sees nothing for unreleased sets.
- ASH (next unreleased set, prereleaseDate 2026-07-10) is currently filtered out of `fetchSets()` entirely by `isSetVisibleInCatalog` because `hasRealCardsForSet('ASH')` is false. The teaser surface must source ASH from `src/utils/setConfigs/` instead.
- The homepage (`src/components/LandingPage.tsx`) has no subscribe banner. The only sub CTAs live on `/support-the-pod` and `/beta` and inside the user drawer in `AuthWidget`.
- Pod join routes (`app/api/draft/[shareId]/join/route.ts`, `app/api/sealed/[shareId]/join/route.ts`) require auth only — no patron/set check.

Goals:
1. Raise the visible Patreon price to **$9/mo** without losing existing supporters.
2. Snapshot patron pledge state once before the raise (audit trail for dispute resolution).
3. Verify the existing Patreon → Discord-role → website-`isPatron` chain is healthy after the raise.
4. Convert non-subs by surfacing the next unreleased set as a teaser on every set picker.
5. Promote the next set + the membership on the homepage; show a transient banner during the 5–7 day lock-in window before the raise.
6. When a sub creates a pod using an unreleased set's content, non-sub joiners can still play but see a dismissible sub-marketing banner.
7. Instrument conversion analytics on all three new surfaces so we can measure whether the experiment worked and decide whether to roll back.

Non-goals: annual billing, hard-gating pod joins on unreleased sets, custom Discord-bot bridges beyond the existing webhook, re-architecting beta gating to be flag-driven.

---

## Requirements Trace

- R1. **Patreon tier price raised to $9/mo.** Operational change on `patreon.com/ProtectthePod` — no code reference exists today, but on-site copy that mentions sub price must be updated to the new value.
- R2. **Existing subscribers grandfathered indefinitely at their current rate.** Patreon's native behavior; verified empirically via a test pledge in U0 before U1 fires. A one-time DB snapshot of current patron pledge amounts provides defensive dispute-resolution evidence.
- R3. **Patreon sub → Discord "Friend of the Pod" role → site `isPatron` true** continues working end-to-end. Verification merged into U1. Webhook reliability is improved by enabling Patreon's official Discord integration in parallel as a daily-sync fallback and adding a weekly `sync-patrons` cron.
- R4. **Next-set preview cards on every set picker** (`SetSelection.tsx`, `PackSelector.tsx`, and the inline picker on `/formats/rotisserie/[shareId]`). For non-subs the next unreleased set appears as a "Coming Soon" teaser card; clicking opens the `SubscribeModal` instead of selecting the set. Subs/beta-testers continue to see the set as a normal selectable card via the existing date-driven gate.
- R5. **Homepage banner promoting the next set + membership** on `src/components/LandingPage.tsx`, dismissible, shown when an unreleased set is on the horizon. Includes a transient lock-in-window variant during the 5–7 days before the raise.
- R6. **Non-sub joining a sub-created unreleased-set pod sees a sub-marketing banner** they can dismiss and play through. Soft conversion, not a hard gate. Modest server-side hardening (P3 follow-up) is acceptable but not blocking.
- R7. **Conversion analytics on all three new surfaces.** `subscribe-cta-shown` and `subscribe-cta-clicked` events with `{ surface, setCode }` payloads, plus baseline-vs-post metrics and a documented rollback threshold.

---

## Scope Boundaries

- **In scope:** Price-raise operational steps, empirical pre-flight verification, one-time patron pledge snapshot, three new sub-conversion surfaces (set picker preview, homepage banner + lock-in window variant, pod-join banner), the new shared `SubscribeModal` component, pricing-constant module folded into the modal unit, copy updates for price references, post-raise verification of the Patreon→Discord→site chain (folded into U1), conversion analytics, rollback criteria.
- **Out of scope (explicit non-goals):**
  - Hard-gating non-subs out of unreleased-set pods. Soft-gate is the design.
  - Custom Discord bot bridge beyond the existing webhook + (newly enabled) official Patreon-Discord daily sync. The existing chain plus the new daily-sync fallback is the source of truth.
  - Pricing strategy review beyond the user-confirmed $9/mo. Annual is explicitly deferred (see below).
  - Re-architecting beta gating to be flag-driven instead of date-driven. The current date-driven model in `src/utils/api.ts` stays.
  - Cleaning up the stale "beta: true" prose in `docs/BETA_ACCESS.md` — flagged separately.

### Deferred to Follow-Up Work

- **Annual billing at $60/year**: Patreon requires (a) campaign ≥3 months old, (b) ≥$200/mo earnings for the prior 3 months, (c) charge-upfront or subscription billing. User confirmed the campaign does not yet qualify. **Trigger to revisit:** when monthly earnings exceed $200/mo for three consecutive months. The follow-up unit is enabling annual at the Patreon account level, setting the per-tier annual amount to $60, setting `MEMBERSHIP_PRICE_ANNUAL_USD = 60` in `src/utils/membership.ts`, and adding an annual CTA to the SubscribeModal + support-the-pod page. **$60/yr is committed — no re-test at rollout.**
- **Hard-gate on pod join (server-side)**: If the soft-gate experiment shows non-subs joining unreleased-set pods erodes conversion or causes operational problems, harden `app/api/draft/[shareId]/join/route.ts` and `app/api/sealed/[shareId]/join/route.ts` to reject non-patron joins on unreleased-set pods with a 403 + `requiresSubscription: true`. P3 follow-up.
- **Try-before-buy spoiler page**: Per-set spoiler/sample-pack page accessible to non-subs as an intermediate engagement step before the conversion modal. Out of scope for this round; revisit after analytics data lands.
- **Stale `docs/BETA_ACCESS.md`**: The doc claims `beta: true` on set configs but the system actually uses date-driven gating via `isSetBeta(set)`. Track separately; not blocking this plan.

---

## Context & Research

### Relevant Code and Patterns

**Patreon / patron status:**
- `lib/patreon.ts` — Creator API v2 client. Currently requests only `patron_status`, `email`, `full_name`, and `social_connections.discord.user_id`. U0 widens `fields[member]` to include `currently_entitled_amount_cents` and `pledge_relationship_start` for the snapshot.
- `app/api/webhooks/patreon/route.ts` — HMAC-MD5 verification + `members:create|update|delete` and `members:pledge:create|update|delete` event handling. Calls `addPatronRole` / `removePatronRole`. No webhook code changes required.
- `app/api/auth/patron-status/route.ts` — Live `isPatron(discordId)` check. Admins always patron.
- `app/api/admin/sync-patrons/route.ts` — Reconciliation endpoint; U1 verification + new weekly cron alert.
- `scripts/diagnose-patreon.ts` — CLI diagnostic; run via `railway run -e production npx tsx scripts/diagnose-patreon.ts` per existing pattern.

**Discord:**
- `lib/discord.ts` — `isPatron`, `addPatronRole`, `removePatronRole`, `addBetaTesterRole`. Env vars: `DISCORD_FRIEND_OF_THE_POD_ROLE_ID`, `DISCORD_BETA_TESTER_ROLE_ID`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN`.
- Official Patreon-Discord integration: enable in Patreon dashboard during U0 as a daily-sync fallback for our custom webhook.

**Beta gating (date-driven, not flag-driven):**
- `src/utils/api.ts` — `isSetBeta(set: { prereleaseDate?: string })` accepts an *object*, not a string. `fetchSets({ includeBeta })` filters out beta sets unless `includeBeta=true`. `knownSets` array is the hardcoded source of truth for *released* sets; unreleased-set previews source from `src/utils/setConfigs/`. Today (2026-05-26) ASH is in the beta window with prereleaseDate `2026-07-10`.
- `src/utils/setConfigs/*.ts` — per-set config with `setCode`, `setName`, `prereleaseDate`, `releaseDate`. ASH has a config; this is the source for the peek teaser.
- `src/contexts/AuthContext.jsx` — exposes `user.is_beta_tester`, `user.is_admin`, and `isPatron`. **Critical:** `isPatron` starts as `null` (loading) before async Discord check resolves. All new gating MUST use `isPatron === false` explicitly, not `!isPatron`, to avoid flashing the conversion CTA during the loading window.
- `app/beta/page.tsx` and `app/api/beta/enroll/route.ts` — beta enrollment path (requires live `isPatron`). **Note:** a patron may have `isPatron=true` but `is_beta_tester=false` if they haven't clicked "Join the Beta" yet. The teaser/banner behavior handles this third state explicitly (see U3).

**Set pickers (all three need the preview treatment):**
- `src/components/SetSelection.tsx` — main picker (used by `/sealed`, `/sealed/new`, `/draft/solo`, `/draft/new`, `/deckbuilder`, `/sets`, `src/App.jsx`).
- `src/components/PackSelector.tsx` — receives `sets` via props; consuming pages are: `app/draft/chaos/page.tsx`, `app/formats/chaos-sealed/page.tsx`, `app/formats/chaos-draft/page.tsx`, `app/formats/pack-blitz/page.tsx`, `app/formats/pack-wars/page.tsx`. U3 modifies all five parent pages.
- `app/formats/rotisserie/[shareId]/page.tsx` — `fetchSets()` call near line 420; picker JSX at lines ~1018–1050.

**Homepage / banners:**
- `src/components/LandingPage.tsx` — existing `.active-draft-banner` pattern (lines 167–192) and `.removed-banner` (line 130) are the right shape to mirror.
- `ReleaseNotes` is rendered at the top.
- **Banner priority rule:** at most one top-of-page contextual banner at a time. Active-draft-banner takes precedence over the promo banner when an active pod exists. Lock-in-window variant takes precedence over the normal promo variant.

**Pod join:**
- `app/api/draft/[shareId]/join/route.ts` and `app/api/sealed/[shareId]/join/route.ts` — both require auth only. No server-side patron check (soft-gate by design).
- `app/draft/[shareId]/pod/page.tsx` and `app/sealed/[shareId]/pod/page.tsx` — lobby pages. `SealedPod.tsx` already imports `isPatron` from `useAuth` — that's the pattern to copy.

**UI primitives to reuse:**
- `src/components/Modal.tsx` + `Modal.css` — canonical modal with `<Modal.Body>` + `<Modal.Actions>`.
- `src/components/Button.tsx` — `variant="primary|secondary|danger|toggle|icon"`.
- Patreon URL pattern: `https://patreon.com/ProtectthePod`.

### Institutional Learnings

- **Source of truth for patron status is Discord role membership, not the DB.** All gating reads `useAuth().isPatron` on the client and `isPatron(discordId)` on the server. New sub-gated features follow this — do not re-derive patron status from anywhere else.
- **Beta gating is date-driven**, not flag-driven. `docs/BETA_ACCESS.md` is stale on this point. Use `isSetBeta(set)` / `isSetPrerelease(set)` from `src/utils/api.ts`.
- **CLAUDE.md hard rule:** before touching any component/CSS, read `docs/STYLE_GUIDE.md` and `.claude/rules/ui-components.md`. All UI units in this plan inherit that requirement.
- **`feedback_use_button_component_for_toggles`**, **`feedback_button_icon_spacing`**, **`feedback_destructive_cancel_buttons`** — apply to every new button/toggle in this plan.
- **`feedback_e2e_ui_only`** — Playwright E2E tests must drive through the UI, never hit the API directly.
- **`feedback_always_build_before_commit`** — `npm run build` before commit.
- **`feedback_no_legal_framing`** — sub-gating on unreleased sets is a product/conversion design choice, not a legal/embargo posture. Do not frame it as such anywhere in plan or copy.
- **Mobile rule:** any new hover-only affordance must be wrapped in `@media (hover: hover) and (pointer: fine)`. All new banners/modals must work with taps. **Do not copy `.active-draft-banner`'s `:hover` rule literally — it is unwrapped; the new components use the mobile guard.**

### External References

Patreon (official):
- [How to adjust your membership tier prices](https://support.patreon.com/hc/en-us/articles/24879210577165-How-to-adjust-your-membership-tier-prices) — existing patrons keep current price; new pricing applies to new signups.
- [Best practices for increasing your tier prices](https://support.patreon.com/hc/en-us/articles/360027992451-Best-practices-for-increasing-your-tier-prices) — 5–7 day announcement + legacy lock-in window pattern.
- [Annual memberships creator overview](https://support.patreon.com/hc/en-us/articles/360041721372-Annual-memberships-creator-overview) — eligibility gates.
- [Setting up Discord for your members](https://support.patreon.com/hc/en-us/articles/213552323-Setting-up-Discord-for-your-members) — official integration syncs daily; we use it as fallback alongside our real-time webhook.
- [Troubleshooting Discord issues](https://support.patreon.com/hc/en-us/articles/4408372541581-Troubleshooting-Discord-issues) — known failure modes.

---

## Key Technical Decisions

- **No new DB migration for grandfathering enforcement.** Patreon's native grandfathering keeps existing patrons at their current rate. The new `patreon_pledge_snapshot` table (U0) is a one-time defensive audit trail, not a gating mechanism.
- **No webhook code changes.** The existing `members:update` handler already adds/removes the Discord role on status change.
- **One shared `SubscribeModal` component, headline-driven.** Replaces the previously-planned variant enum. Each call site passes a `headline` string + optional `setCode`; no internal variant switching. Reduces coupling; copy changes stay local to each call site.
- **Pricing constant lives inside the modal unit, not a separate unit.** `MEMBERSHIP_PRICE_MONTHLY_USD = 9` and `formatMembershipPrice()` are created in `src/utils/membership.ts` *as part of* the modal unit (formerly U3+U5; now merged). `MEMBERSHIP_PRICE_ANNUAL_USD: number | null = null` reserved for the annual cutover.
- **Soft gate on pod join.** Non-subs can join unreleased-set pods and play. They see a dismissible marketing banner. **No modal interrupt on join** — modal is reserved for the set-picker click and homepage CTA where the user is actively browsing rather than entering a social context with friends.
- **Set picker peek source.** `peekUnreleased: true` sources from `src/utils/setConfigs/` (not `knownSets` in `api.ts`), returning the next unreleased set by `prereleaseDate` ascending, with at most one entry, excluding Carbonite siblings. This bypasses `isSetVisibleInCatalog`'s `hasRealCardsForSet` gate, which would otherwise filter ASH out today.
- **Single boundary helper for "is this set upcoming."** Introduce `isSetUpcoming(setCode | setObj)` in `src/utils/api.ts` (or `membership.ts`) that returns `true` when `releaseDate > now`. All three conversion surfaces (set picker teaser, homepage banner, pod banner) use this same helper to avoid drift between `prereleaseDate > now` and `releaseDate > now`.
- **Three-state user model for conversion surfaces:**
  - Anonymous or `isPatron === false`: full conversion experience (teaser, banner, pod banner).
  - `isPatron === true && is_beta_tester === false`: patron who hasn't enrolled in beta. Show a *softer* CTA pointing to `/beta` to enroll, not the Patreon URL. The user already pays — don't pitch them.
  - `isPatron === true && is_beta_tester === true`: existing behavior, unreleased sets visible as normal selectable cards.
  - `isPatron === null`: render nothing. Wait for resolution.
- **Pod-marketing-banner session key**: `subBannerSeen-{setCode}` in sessionStorage (NOT per-pod). One banner per unreleased set per session, set on first render (not on dismissal) so closing the tab still counts. Prevents modal-spam when joining multiple ASH pods in one session.
- **Promo banner trigger window**: show when `isSetUpcoming(set)` is true AND `prereleaseDate - now <= 6 weeks`. Configurable constant `PROMO_BANNER_WEEKS_BEFORE_PRERELEASE = 6`. Disappears once `releaseDate <= now`.
- **Lock-in-window banner variant**: transient banner during the 5–7 days between announcement and price-raise effective date. Shown to non-subs only. Copy: "Lock in $5/month before {date} — price rises to $9/month." Triggered by a constant `LOCK_IN_WINDOW_END_DATE` (set at U1 scheduling).
- **Webhook reliability belt-and-suspenders**: keep the custom webhook for real-time role assignment AND enable Patreon's official Discord integration as a daily-sync fallback. Add a weekly cron that runs `sync-patrons` and alerts on Discord/DB mismatches.
- **Conversion analytics is in scope, not nice-to-have.** A pricing experiment without measurement is unfalsifiable. `subscribe-cta-shown` and `subscribe-cta-clicked` events are emitted from every surface; baseline metrics captured before the surfaces ship; rollback threshold documented.

---

## Open Questions

### Resolved During Planning

- **Annual pricing**: Deferred to follow-up; eligibility not met. $60/yr is provisional and will be re-tested at rollout.
- **Grandfathering approach**: Patreon-native + one-time DB snapshot for dispute audit trail + empirical test-pledge pre-flight.
- **Pod join experience**: Soft gate, banner-only (no modal interrupt).
- **Discord role bridge**: Existing custom webhook + enable official Patreon-Discord integration as daily-sync fallback.
- **`peekUnreleased` source**: `setConfigs/` directly, not `knownSets`.
- **`isSetBeta` signature**: introduce `isSetUpcoming(setCode)` helper that internally looks up the set object.
- **Patron-without-beta-enrollment state**: explicit third branch — softer CTA pointing to `/beta`.

### Deferred to Implementation

- **Exact promo banner copy and CTA wording.** Iterated during U5 with the user.
- **Whether the existing "Friend of the Pod" tier on Patreon should be renamed.** Operational only. Decide during U1.
- **Exact rotisserie picker UX when the host is a non-sub** — the teaser becomes "click to subscribe" but the host normally has set-selection power. Resolve during U3 implementation.

### Resolved by Business-Judgment Pass (2026-05-26)

- **Sequencing: SHIP SIMULTANEOUSLY.** Price raise + 3 surfaces + analytics all land together. Attribution loss is an accepted cost in exchange for ride-the-ASH-window speed. U7 baseline capture happens *before* deploy day; post-deploy is the experiment.
- **ASH-window timing: SHIP NOW, ride the window.** Deliberate bet on peak ASH demand (prerelease 2026-07-10, ~6 weeks out). Land before mid-June so the lock-in window + ASH-promo banner span the ramp-up.
- **Identity bet: ACCEPT.** Three new conversion surfaces ship as designed. U7 analytics measures whether the freemium posture pays off.
- **Homepage banner sub-variant: SHIP IT.** Keep the two-state banner (non-sub conversion + patron activation "Your early access is live"). No change to U5 scope.
- **Annual at $60/yr (44% off): COMMITTED.** When Patreon eligibility hits ($200/mo × 3 months), set `MEMBERSHIP_PRICE_ANNUAL_USD = 60` directly. No re-test.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
                                  ┌──────────────────────┐
   Patreon dashboard ── raise ──▶ │ Patreon tier = $9/mo │ ── grandfathered patrons stay at old rate
                                  └──────────┬───────────┘
                                             │ webhook (real-time, no code change)
                                             │ + official Patreon-Discord integration (daily fallback)
                                             ▼
                          ┌──────────────────────────────────┐
                          │ app/api/webhooks/patreon/route.ts │ (existing)
                          └──────────────────┬───────────────┘
                                             │ addPatronRole / removePatronRole
                                             ▼
                          ┌──────────────────────────────────┐
                          │  Discord guild: Friend of the Pod │
                          └──────────────────┬───────────────┘
                                             │ live check
                                             ▼
                          ┌──────────────────────────────────┐
                          │ app/api/auth/patron-status     │  ──▶ useAuth().isPatron (client, async)
                          └──────────────────────────────────┘
                                             │
   ┌─────────────────────────────────────────┼──────────────────────────────────────────┐
   │                                         │                                          │
   ▼                                         ▼                                          ▼
SetSelection.tsx                     LandingPage.tsx                          DraftPod / SealedPod pages
PackSelector.tsx                     (banner above ReleaseNotes:              (banner only — no modal interrupt)
rotisserie inline                    promo + lock-in-window variants)          if isSetUpcoming(pod.setCode)
(Coming Soon card from                                                          and isPatron === false)
 setConfigs, opens modal               sub variant: "your early access live"
 if isPatron === false)
```

Pricing source-of-truth flow:

```text
src/utils/membership.ts                                   (NEW — created in U4)
   MEMBERSHIP_PRICE_MONTHLY_USD = 9
   MEMBERSHIP_PRICE_ANNUAL_USD = null  // set when Patreon eligibility met
   PATREON_URL = 'https://patreon.com/ProtectthePod'
   formatMembershipPrice()              // returns '$9/month' (or '$9/month or $60/year' when annual ships)
   isSetUpcoming(setCodeOrConfig)       // releaseDate > now
   getUpcomingSetForPromo()             // returns the next upcoming set within PROMO_BANNER_WEEKS_BEFORE_PRERELEASE
        │
        ├─▶ SubscribeModal.tsx
        ├─▶ LandingPage.tsx (banner)
        ├─▶ About.tsx       (support-the-pod copy)
        ├─▶ AuthWidget.tsx  (drawer link — verify Patreon URL presence; may be no-op)
        ├─▶ beta/page.tsx   ("Subscribe on Patreon" CTA)
        ├─▶ app/draft/page.tsx (line 258)
        └─▶ app/stats/page.tsx (line 542)
```

---

## Implementation Units

- [ ] U0. **Pre-flight: empirical grandfather verification + patron pledge snapshot + enable Patreon-Discord daily-sync fallback**

**Goal:** Before U1 fires, verify grandfathering empirically with a test pledge, capture a one-time DB snapshot of all current patrons' pledge amounts, and enable Patreon's official Discord integration as a daily-sync fallback to our custom webhook.

**Requirements:** R2, R3

**Dependencies:** None.

**Files:**
- Modify: `lib/patreon.ts` (widen `fields[member]` to include `currently_entitled_amount_cents` and `pledge_relationship_start`)
- Create: `migrations/0NN_create_patreon_pledge_snapshot.sql` (next available 062+ number per existing convention; column: `patron_id TEXT PK, discord_id TEXT, email TEXT, pledge_amount_cents INT, pledge_started_at TIMESTAMPTZ, snapshot_at TIMESTAMPTZ DEFAULT now()`)
- Create: `scripts/snapshot-patrons.ts` (one-time CLI: pulls active patrons via `lib/patreon.ts` and inserts to the snapshot table)
- Test: `lib/patreon.test.ts` (extend), `scripts/snapshot-patrons.test.ts` (new — spec-first per `.claude/rules/testing.md`)

**Approach:**
- Create a test Patreon pledge on a secondary account at the OLD price. Wait through one billing cycle to confirm baseline behavior.
- Execute the price raise on a non-production Patreon tier (if testable) or rely on the staging announcement. Confirm the test pledge bills at the old rate at the next monthly cycle.
- Run `snapshot-patrons` CLI in production (via `railway run`) to populate the new table.
- Enable Patreon's official Discord integration in the Patreon dashboard. Confirm it does not duplicate role assignments (the custom webhook still fires first; daily sync is reconciliation).

**Execution note:** Empirical grandfather verification takes ~1 billing cycle (~30 days) and gates U1. If the user wants to proceed without empirical verification, mark this finding deferred and document the risk acceptance.

**Test scenarios:**
- Happy path: `lib/patreon.ts` returns members with non-null `currently_entitled_amount_cents` for active patrons.
- Happy path: `snapshot-patrons` populates `patreon_pledge_snapshot` with one row per active patron.
- Happy path: Test pledge at old price continues billing at old price for ≥2 cycles after the production raise (verified empirically).
- Edge: A patron without a Discord link still gets snapshotted (using email as identifier).
- Error path: Migration is idempotent (re-running snapshot does not duplicate rows; conflict-on-patron-id update).
- Integration: Official Patreon-Discord integration assigns Friend role within 24h to a fresh test pledge whose Discord is linked, in parallel with our webhook's real-time assignment.

**Verification:**
- `migrations/0NN_*.sql` applied successfully on dev + production.
- `patreon_pledge_snapshot` contains expected row count (matches active patron count from Patreon dashboard).
- Test pledge bills at old rate for ≥2 cycles after raise.
- Official Patreon-Discord integration shows "Connected" in the Patreon dashboard.

---

- [ ] U1. **Operational: raise Patreon tier price, announce with 5–7 day lock-in window, and verify the chain end-to-end**

**Goal:** Update the public tier price on `patreon.com/ProtectthePod` to $9/mo, announce the change with a 5–7 day legacy lock-in window for any prospective patrons, notify existing patrons that they are grandfathered, and verify the Patreon → Discord → site privilege chain is healthy after the raise.

**Requirements:** R1, R2, R3

**Dependencies:** U0 (pre-flight verification + snapshot must complete).

**Files:**
- Read-only verification: `lib/patreon.ts`, `lib/discord.ts`, `app/api/webhooks/patreon/route.ts`, `app/api/auth/patron-status/route.ts`, `app/api/admin/sync-patrons/route.ts`, `scripts/diagnose-patreon.ts`
- Test extension (optional): `app/api/auth/patron-status/route.test.ts`

**Approach:**
- Schedule the price-raise effective date with a 5–7 day notice window. Set `LOCK_IN_WINDOW_END_DATE` constant for the homepage lock-in banner (see U5).
- Publish a Patreon post + Discord guild announcement: (a) the new $9/mo price, (b) explicit confirmation that existing supporters stay at their current rate indefinitely (cite the snapshot we have on file), (c) the 5–7 day lock-in window for prospective patrons.
- Update the tier amount in the Patreon dashboard on the effective date.
- Run `railway run -e production npx tsx scripts/diagnose-patreon.ts`; expect zero Discord-ID mismatches for the snapshot's patron set.
- Trigger admin `sync-patrons` for a known control account; confirm Friend role.
- Verify `/api/auth/patron-status` returns `isPatron: true` for the control account.

**Test scenarios:**
- Happy path: Patron whose Discord is linked has Friend role + `isPatron=true` post-raise.
- Happy path: Admin always returns `isPatron=true` regardless of Discord state.
- Edge: Existing patron's Patreon billing page shows their original (snapshotted) price after the raise.
- Edge: New signup after the raise pays $9/mo and gets Friend role + `isPatron=true` within seconds (real-time webhook) or within 24h (daily-sync fallback).
- Error path: Webhook fires with invalid signature → returns 401 (regression check).

**Verification:**
- Patreon dashboard shows $9/mo tier price.
- Snapshot's patron set: 100% show grandfathered (old) price on their Patreon billing pages (spot-check 5+).
- Diagnostic script reports zero mismatches.
- Lock-in banner active on homepage during the announcement window (verified via U5).

---

- [ ] U2. **Add a weekly `sync-patrons` cron with alert on Discord ↔ DB mismatch**

**Goal:** Defensive monitoring for the Patreon → Discord chain. The custom webhook can fail silently (HMAC rotation, Discord rate limit, role-position drift); the weekly cron + alert catches drift before patrons notice.

**Requirements:** R3

**Dependencies:** U0 (snapshot table exists).

**Files:**
- Modify or create: `scripts/sync-patrons-cron.ts` (extend the existing admin endpoint logic; emit alert on mismatch)
- Modify: `railway.toml` or equivalent cron config (add weekly schedule)
- Test: `scripts/sync-patrons-cron.test.ts`

**Approach:**
- Weekly: pull active patrons from Patreon, cross-reference with Discord guild membership, alert on any patron-without-Friend-role or Friend-role-without-active-patron mismatch.
- Alerts route via the existing operational alert channel (Discord webhook or email — confirm during implementation).

**Patterns to follow:**
- Existing `app/api/admin/sync-patrons/route.ts` logic.

**Test scenarios:**
- Happy path: Run produces zero mismatches for a healthy chain.
- Edge: Patron whose Discord lapsed is flagged; alert fires once.
- Edge: Alert does not fire when the only "mismatch" is the admin user (admins always patron regardless of Discord).
- Integration: Cron-triggered run completes within Railway's job timeout.

**Verification:**
- First scheduled run completes and reports.
- Manually trigger a mismatch (revoke role from a control account); confirm alert fires within the next run.

---

- [ ] U3. **Add next-set "Coming Soon" teaser to all set pickers (sources from setConfigs)**

**Goal:** For non-subscribers, show a single "Coming Soon" teaser card for the next unreleased set on every set picker. Clicking opens the `SubscribeModal`. Subs/beta-testers see no change. Patrons without beta enrollment see the teaser with a softer "Enroll in Beta" CTA pointing at `/beta`.

**Requirements:** R4

**Dependencies:** U4 (SubscribeModal must exist).

**Files:**
- Modify: `src/utils/api.ts` (add `peekUnreleased?: boolean` option; new `getUpcomingSetForPeek()` reads from `src/utils/setConfigs/`, bypassing `knownSets` and `isSetVisibleInCatalog`; new `isSetUpcoming(setCodeOrConfig)` helper)
- Modify: `src/components/SetSelection.tsx` (`peekUnreleased: isPatron === false || (isPatron && !is_beta_tester)`; render teaser card; click → modal; explicit `isPatron === false` guard, not `!isPatron`)
- Modify: `src/components/SetSelection.css` (`.set-card--coming-soon` styling: lock icon, "Coming Soon" badge in distinct color, dimmed background)
- Modify: `src/components/PackSelector.tsx` (add `peekUnreleased` prop)
- Modify: `app/draft/chaos/page.tsx`, `app/formats/chaos-sealed/page.tsx`, `app/formats/chaos-draft/page.tsx`, `app/formats/pack-blitz/page.tsx`, `app/formats/pack-wars/page.tsx` (pass `peekUnreleased` based on isPatron/beta state)
- Modify: `app/formats/rotisserie/[shareId]/page.tsx` (lines ~420 `fetchSets()` and lines ~1018–1050 picker JSX; host-vs-non-host interaction documented during impl)
- Test: `src/utils/api.test.ts` (extend), `src/components/SetSelection.test.tsx`

**Approach:**
- `peekUnreleased: true` returns at most one extra set — the next unreleased set from `src/utils/setConfigs/` by `prereleaseDate` ascending, excluding Carbonite siblings. No `hasRealCardsForSet` gate (teaser is metadata-only; never invokes pack generation).
- Teaser image: use the set's `imageUrl` from set config if available; else fall back to a text-based "Coming Soon" placeholder with the set name + code. No blank squares.
- Teaser click handler: open SubscribeModal with the appropriate `headline` based on user state:
  - `isPatron === false` (non-sub): "Get early access to {setName}" with Patreon URL CTA.
  - `isPatron === true && !is_beta_tester`: "Enroll in beta to play {setName}" with `/beta` CTA.
- For subs with beta enrollment, behavior unchanged.
- Mobile: lock icon + badge use `gap: 8px`; hover-only CSS wrapped in `@media (hover: hover) and (pointer: fine)`.

**Patterns to follow:**
- Existing badge styling in `SetSelection.tsx`.
- `useAuth()` consumption pattern.
- `feedback_button_icon_spacing`, mobile hover guard.

**Test scenarios:**
- Happy path (non-sub): `/sealed` shows released sets + ASH teaser; click → SubscribeModal with "Get early access" copy.
- Happy path (sub-with-beta): No teaser injected; ASH visible as normal selectable card via existing date gate.
- Happy path (patron-no-beta): Teaser visible with "Enroll in beta" CTA → modal navigates to `/beta` on click.
- Happy path (loading, `isPatron === null`): No teaser rendered; no layout flash on resolution.
- Edge: No unreleased sets exist → no teaser for any user state.
- Edge: Multiple unreleased sets → only next-by-`prereleaseDate` shown.
- Edge: Mobile tap opens modal (no hover dependency).
- Integration: Same behavior on `/draft/new`, `/sealed/new`, `/draft/solo`, `/deckbuilder`, `/sets`, all chaos pickers, rotisserie picker.

**Verification:**
- `npm run lint` and `npm run build` pass.
- Manual: cycle through all three user states (anon/non-sub, patron-no-beta, patron-with-beta); confirm correct rendering.
- New Playwright E2E (UI-only per `feedback_e2e_ui_only`): non-sub navigates to `/sealed`, clicks Coming Soon card, sees modal, dismisses, picks a released set.

---

- [ ] U4. **Build shared `SubscribeModal` component + pricing constants module**

**Goal:** A single reusable modal with a `headline` string prop (no variant enum), plus the centralized `src/utils/membership.ts` constants module that powers all on-site pricing copy.

**Requirements:** R4, R5, R6

**Dependencies:** None.

**Files:**
- Create: `src/utils/membership.ts` (`MEMBERSHIP_PRICE_MONTHLY_USD = 9`, `MEMBERSHIP_PRICE_ANNUAL_USD: number | null = null`, `PATREON_URL`, `formatMembershipPrice()`, `isSetUpcoming()`, `getUpcomingSetForPromo()`, `PROMO_BANNER_WEEKS_BEFORE_PRERELEASE = 6`)
- Create: `src/utils/membership.test.ts`
- Create: `src/components/SubscribeModal.tsx`
- Create: `src/components/SubscribeModal.css`
- Test: `src/components/SubscribeModal.test.tsx`
- Modify: `src/components/LandingPage.tsx` (line ~300 — replace literal Patreon URL with import)
- Modify: `src/components/About.tsx` (lines 14, 30, 42, 47 — replace URL literal and "Start Your Free Trial" copy where price-relevant)
- Modify: `src/components/AuthWidget.tsx` (drawer link — verify presence of Patreon URL literal; may be no-op)
- Modify: `app/beta/page.tsx` (lines 83–90 — Subscribe on Patreon CTA)
- Modify: `app/draft/page.tsx` (line 258 — "Friend of the Pod" link)
- Modify: `app/stats/page.tsx` (line 542 — Patreon URL literal)

**Approach:**
- SubscribeModal props: `{ open: boolean; onClose: () => void; headline: string; setCode?: string; ctaUrl?: string; ctaLabel?: string }`. Default `ctaUrl = PATREON_URL`, default `ctaLabel = 'Become a Member'`. Callers pass custom URL/label for the patron-no-beta variant (where `ctaUrl = '/beta'`, `ctaLabel = 'Enroll in Beta'`).
- Body: committed copy (see below) reading `formatMembershipPrice()` for the price line. The benefits list:
  1. **Early access to upcoming sets** — draft and seal weeks before public release.
  2. **Supporter Discord role** — the "Friend of the Pod" badge in our Discord community.
  3. **Vote on community polls** — direction of new features and tournaments-of-the-month.
  4. **Name in credits** — your handle in the supporter list on `/support-the-pod`.
- Primary action: `<a href={ctaUrl} target="_blank" rel="noopener noreferrer">` styled via `Button variant="primary"`. Explicit color overrides for `:hover` / `:visited` / `:active` per the Discord-link gotcha.
- Secondary action: "Not now" — `Button variant="secondary"`.
- Return-from-Patreon affordance: footer text "Already subscribed? Your access activates within minutes — refresh this page." `AuthContext.jsx`'s visibility-change handler already triggers a session reload on tab focus; document this in the modal copy.
- `setCode` looked up via `src/utils/setConfigs/index.ts` for the set name; falls back to the code if config missing.
- Uses `Modal` + `Modal.Body` + `Modal.Actions`.

**Patterns to follow:**
- `src/components/Modal.tsx` API.
- `src/components/Button.tsx` variants per `.claude/rules/ui-components.md`.
- Mobile rules: backdrop tap dismiss must work; Escape closes.

**Test scenarios:**
- Happy path: Renders with `headline="Get early access to Ashes of the Empire"` → headline appears in DOM.
- Happy path: Primary action href is `PATREON_URL` from `membership.ts` by default; overridable via `ctaUrl` prop.
- Happy path: `onClose` fires on "Not now" click and on backdrop click.
- Happy path: `formatMembershipPrice()` returns "$9/month" when annual is null; "$9/month or $60/year" when annual is set to 60.
- Edge: Unknown `setCode` → falls back to the code string.
- Edge: Patron-no-beta variant: `ctaUrl="/beta"`, `ctaLabel="Enroll in Beta"` — confirm rendering.
- Edge: Mobile backdrop tap dismisses.
- Integration: Verified by U3 (set picker), U5 (homepage banner), U6 (pod banner) consumers.

**Verification:**
- `npm run lint` and `npm run build` pass.
- Grep for `patreon.com/ProtectthePod` shows zero literal occurrences outside `src/utils/membership.ts`.
- Visual on `/`, `/support-the-pod`, `/beta`, and the user drawer: pricing reads "$9/month" everywhere; modal renders correctly on all three variant headlines.

---

- [ ] U5. **Homepage promo banner with three variants: non-sub conversion, lock-in window, and patron activation**

**Goal:** A dismissible banner above `ReleaseNotes` on `/` that promotes the next unreleased set or the lock-in window. Three states:
1. **Lock-in-window variant** (transient, during the 5–7 days before the raise effective date): "Lock in $5/month before {date} — price rises to $9." Shown only to anon/non-sub users. Highest priority.
2. **Non-sub conversion variant**: "Get early access to {setName} — become a member · $9/month." Shown when an unreleased set is within 6 weeks of prerelease AND user is `isPatron === false`. CTA opens SubscribeModal.
3. **Patron activation variant**: "Your early access to {setName} is live — try a draft." Shown when an unreleased set is within 6 weeks of prerelease AND user is patron + beta-tester. CTA navigates to `/draft/new`.

**Requirements:** R5

**Dependencies:** U4 (modal + membership constants).

**Files:**
- Modify: `src/components/LandingPage.tsx` (insert banner block above `<ReleaseNotes />`; render priority logic)
- Modify: `src/components/LandingPage.css` (new `.next-set-promo-banner` and `.lock-in-banner` styles — mirror `.active-draft-banner` shape, but wrap `:hover` rules in `@media (hover: hover) and (pointer: fine)` — do NOT copy the existing unguarded hover from `.rejoin-button:hover`)
- Test: `src/components/LandingPage.test.tsx` (extend or create)

**Approach:**
- Render priority (highest first): active-draft-banner (existing) > lock-in-window > non-sub conversion > patron activation. At most one banner shows. The existing active-draft-banner always wins when an active pod exists.
- Helpers from `src/utils/membership.ts`: `getUpcomingSetForPromo()`, `isWithinLockInWindow(LOCK_IN_WINDOW_END_DATE)`.
- Dismissal:
  - Lock-in banner: dismissible; key `dismissed-lockin-{LOCK_IN_WINDOW_END_DATE}` in localStorage.
  - Conversion / activation banner: dismissible; key `dismissed-promo-{setCode}` (re-shows for the next set after current releases).
- Explicit `isPatron === false` and `isPatron === true && is_beta_tester === true` guards. `isPatron === null` renders nothing.
- Anonymous users (no auth) treated as non-sub (conversion variant).
- Sub-but-no-beta state: render the conversion variant with `/beta` CTA via SubscribeModal's `ctaUrl="/beta"` override.

**Patterns to follow:**
- `.active-draft-banner` layout structure only (NOT its hover CSS).
- Mobile hover guard.

**Test scenarios:**
- Happy path (lock-in window active, anon): Lock-in variant renders with countdown copy and Patreon CTA.
- Happy path (lock-in window active, sub): No banner (subs don't see lock-in pitch).
- Happy path (no lock-in, non-sub, ASH in 4 weeks): Non-sub conversion variant with SubscribeModal CTA.
- Happy path (sub-with-beta, ASH in 4 weeks): Patron activation variant with "Try a draft" CTA → `/draft/new`.
- Happy path (`isPatron === null`): No banner rendered. No flash on resolution.
- Edge: User has active draft AND non-sub + unreleased ASH → only active-draft-banner shows.
- Edge: Dismiss lock-in → banner gone for this lock-in window; conversion banner re-evaluates and may show next.
- Edge: After ASH releases (releaseDate ≤ now), `getUpcomingSetForPromo()` returns null → banner disappears; next set's banner re-shows once it enters the window.
- Edge: Mobile tap dismisses cleanly.

**Verification:**
- `npm run lint` and `npm run build` pass.
- Manual cycle: lock-in active vs not, three user states, with/without active pod. Confirm correct precedence.
- New Playwright E2E (UI-only): non-sub on `/` during ASH window sees conversion banner, clicks CTA, modal appears, dismisses, banner stays.

---

- [ ] U6. **Pod-marketing banner for non-subs joining unreleased-set pods (banner only — no modal interrupt)**

**Goal:** When a non-sub joins a draft or sealed pod whose `set_code` is upcoming (per `isSetUpcoming`), a thin dismissible banner appears in the pod page promoting membership. No modal interrupt — the user is in a social context and a friend invited them; modal would create friction for the inviter.

**Requirements:** R6

**Dependencies:** U4 (modal — the banner's CTA still opens SubscribeModal on click, but does not auto-fire on join).

**Files:**
- Create: `src/components/SubscribePodBanner.tsx`
- Create: `src/components/SubscribePodBanner.css`
- Modify: `app/draft/[shareId]/pod/page.tsx` (render banner if `isSetUpcoming(pod.setCode) && isPatron === false`)
- Modify: `app/sealed/[shareId]/pod/page.tsx` (same)
- Test: `tests/e2e/sub-pod-marketing.spec.ts` (UI-only)

**Approach:**
- Banner placement: under the pod header (above the player list/chat). NOT sticky-bottom (conflicts with collapsed chat panel on mobile per `mobile.md`).
- Render condition: `isPatron === false && isSetUpcoming(pod.setCode) && !sessionStorage.getItem('subBannerSeen-' + pod.set_code)`. Set the session key on first render (not on dismissal) so closing the tab still counts — prevents banner-spam when joining multiple ASH pods.
- Banner content: one-line copy ("This pod uses {setName}. Get your own early access — Become a Member · $9/month") + "Subscribe" button (opens SubscribeModal with appropriate headline) + dismiss "X".
- Dismiss is `variant="secondary"` (NOT `danger` — it's not destructive per `feedback_destructive_cancel_buttons`).
- Patron-without-beta: render a softer variant pointing to `/beta`.
- Mobile: tap-dismissible; no hover dependency.

**Patterns to follow:**
- `useAuth().isPatron` pattern from `SealedPod.tsx`.
- `Modal` + `Button` per UI rules.
- Mobile rules.

**Test scenarios:**
- Happy path: Non-sub joins an ASH draft pod → banner renders → can dismiss → banner gone, pod plays normally.
- Happy path: Sub joins ASH pod → no banner.
- Happy path: Non-sub joins a SEC (released) pod → no banner.
- Happy path: Non-sub joins ASH pod #1, banner shows; navigates to ASH pod #2 in same session → no banner (sessionStorage key set).
- Happy path: Same non-sub returns in a new session → banner re-fires.
- Happy path (loading, `isPatron === null`): No banner rendered; no flash on resolution.
- Edge: Pod fetch fails / no `set_code` → no banner.
- Edge: Pod's `set_code` is `ASH-CB` → treated same as `ASH`.
- Integration: Same behavior on draft + sealed pod pages, verified via UI-only E2E.

**Verification:**
- `npm run lint` and `npm run build` pass.
- `npm run test:e2e -- --grep "sub-pod-marketing"` passes.
- Manual: non-sub joins ASH pod → banner → dismiss → continue playing.

---

- [ ] U7. **Conversion analytics + baseline capture + rollback criteria**

**Goal:** Instrument `subscribe-cta-shown` and `subscribe-cta-clicked` events on every conversion surface, capture pre-raise baseline metrics, and document rollback criteria so we can decide whether to revert the price if the experiment fails.

**Requirements:** R7

**Dependencies:** U3, U5, U6 (the surfaces being measured).

**Files:**
- Create or extend: `app/api/analytics/route.ts` (verify whether an analytics endpoint pattern exists; if not, create a minimal one that logs `{ event, surface, setCode, userId, timestamp }` to a new `analytics_events` table)
- Create: `migrations/0NN_create_analytics_events.sql` if no analytics infra exists
- Modify: `src/components/SubscribeModal.tsx` (emit `subscribe-cta-shown` on open, `subscribe-cta-clicked` on Patreon-link click)
- Modify: `src/components/SubscribePodBanner.tsx` (emit `subscribe-cta-shown` on render, `subscribe-cta-clicked` on subscribe button click)
- Modify: `src/components/LandingPage.tsx` (emit events for promo + lock-in variants)
- Modify: `src/components/SetSelection.tsx` (emit `subscribe-cta-shown` for teaser card visibility)
- Create: `docs/MEMBERSHIP_EXPERIMENT.md` (baseline metrics snapshot, rollback criteria, weekly review cadence)

**Approach:**
- Event payload: `{ event: 'subscribe-cta-shown' | 'subscribe-cta-clicked', surface: 'setPreview' | 'homepageBanner' | 'lockInBanner' | 'podBanner', setCode?: string, timestamp: ISO8601 }`. UserId attached server-side from session.
- Baseline metrics captured before U1 effective date: (a) current monthly Patreon sub count, (b) sub-count trend over last 6 months, (c) any existing conversion data from `/beta` enrolls.
- Rollback criteria documented in `docs/MEMBERSHIP_EXPERIMENT.md`:
  - **Hard rollback** (revert tier price to old rate): net-new monthly sub count drops ≥30% vs. trend at day 30 post-raise.
  - **Soft revisit** (consider surface adjustments): conversion rate from `subscribe-cta-shown` to `subscribe-cta-clicked` < 0.5% across all surfaces at day 14.
  - **Surface kill-switch**: any single surface showing zero conversion at day 30 → consider removing that surface specifically.
- Weekly review cadence for the first 8 weeks post-raise; document in operational notes.

**Patterns to follow:**
- Existing analytics infra if present (search `app/api/analytics/`); otherwise minimal logging table.

**Test scenarios:**
- Happy path: Event emitted on modal open with correct `surface` value.
- Happy path: Event payload contains expected fields; userId attached server-side.
- Edge: Anonymous user → userId is null; event still recorded.
- Edge: Banner dismissed before subscribe click → only `subscribe-cta-shown` recorded, no `subscribe-cta-clicked`.
- Integration: Cumulative event count visible via a simple query against `analytics_events` table.

**Verification:**
- `subscribe-cta-shown` events appear in DB within 5s of UI render (verified manually for each surface).
- Baseline snapshot file committed before U1 effective date.
- Rollback criteria approved by user before U1 effective date.

---

## System-Wide Impact

- **Interaction graph:** SubscribeModal is reused across set pickers, homepage, and pod pages — `headline` is per-call-site string so copy changes stay local; no internal switch. `peekUnreleased` in `fetchSets()` defaults to `false`; existing callers unaffected. `isSetUpcoming` and `getUpcomingSetForPromo` from `membership.ts` are the canonical boundary helpers — all three surfaces consume the same helper to avoid drift.
- **Error propagation:** No new server endpoints (analytics endpoint is additive). Patreon/Discord errors continue through existing webhook handler and `lib/discord.ts` logging. New cron alerts surface webhook drift.
- **State lifecycle risks:** localStorage keys (homepage banner) scoped by set code and lock-in-end-date. SessionStorage keys (pod banner) scoped by `setCode`, set on first render. `isPatron === null` loading state explicitly handled by every conversion surface (render nothing).
- **API surface parity:** `fetchSets()`'s new `peekUnreleased` option works consistently across all three set pickers + their 5 parent pages (chaos/pack-blitz/pack-wars). New `isSetUpcoming`, `getUpcomingSetForPromo`, `getUpcomingSetForPeek` helpers documented in `src/utils/membership.ts` JSDoc.
- **Integration coverage:** One UI-driven E2E per conversion surface. Analytics events validated end-to-end on at least one surface.
- **Unchanged invariants:** Date-driven beta gating in `src/utils/api.ts` stays the same. `lib/patreon.ts` widening is additive (new fields requested; existing call sites continue working). `app/api/webhooks/patreon/route.ts` handler unchanged. Pod join API stays auth-only (soft gate). `is_admin` / `is_beta_tester` roles and `addBetaTesterRole` flow unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Existing patrons see the new price on the Patreon page and assume it applies to them | U0 snapshot + U1 announcement explicitly stating grandfathering. On-site copy update in U4 includes "Existing members continue at their original rate." |
| Grandfathering breaks for a subset of patrons (pause/resume, payment-method change) | U0 empirical pre-flight catches major edge cases. U0 snapshot is durable dispute-resolution evidence. |
| Patreon webhook delivery delay or silent failure leaves a new patron without role | U0 enables official Patreon-Discord daily-sync fallback. U2 weekly cron + alert catches drift. |
| Net-new sub count drops post-raise (lose more than we gain) | U7 baseline + rollback criteria. Weekly review cadence for 8 weeks post-raise. |
| Non-subs feel hammered by conversion surfaces (3 new + lock-in + pod banner) | Each surface dismissible with appropriate persistence. Pod-banner key is per-set per session (not per pod). No modal interrupt on pod join. |
| Homepage banner shows after a release lands | `isSetUpcoming(set)` checks `releaseDate > now`; banner auto-disappears at release. Dismissal key per-set-code so next set's banner re-shows. |
| Knownsets/setConfigs dates go stale when Asmodee delays a set | Documented in Operational Notes: same-day update of `setConfigs/*.ts` when Asmodee announces a delay. No auto-detection (trust the human). |
| Mobile users can't dismiss banner because it relies on hover | All new banner/modal CSS uses `@media (hover: hover) and (pointer: fine)`. Do NOT copy `.active-draft-banner`'s unwrapped hover; use the mobile guard explicitly. |
| Discord-link styling defaults to global purple hover | Every Patreon link in SubscribeModal and banners includes explicit `color: white` overrides for `:hover` / `:visited` / `:active`. |
| Patron-no-beta state confuses the implementer | Plan explicitly defines all three patron states and the third-branch behavior (softer `/beta` CTA). |

---

## Documentation / Operational Notes

- **Pre-U1:** Run U0 (empirical pre-flight + snapshot + enable official Patreon-Discord integration). Capture baseline analytics in U7 before U1 effective date.
- **U1 effective date:** Patreon dashboard update + Patreon post + Discord announcement. Lock-in-window banner is live throughout the 5–7 day announcement window via U5.
- **Post-U1:** Run U1 verification diagnostic. Weekly cron (U2) alerts on drift. Weekly conversion review (U7) for 8 weeks.
- **Annual cutover (when eligible):** (1) Enable annual at Patreon account level, (2) set per-tier annual amount, (3) set `MEMBERSHIP_PRICE_ANNUAL_USD = 60` (or revised value after re-test) in `src/utils/membership.ts`. Surfaces affected by the cutover (all read from `formatMembershipPrice()`): SubscribeModal body, LandingPage promo banner copy, About.tsx support-the-pod copy, AuthWidget drawer copy, beta/page.tsx CTA. Visual check at each surface for line-length / layout impact.
- **Set-date maintenance:** When Asmodee announces a set delay, update `src/utils/setConfigs/<SET>.ts` (and `src/utils/api.ts` knownSets if applicable) the SAME DAY. Otherwise the homepage banner and set-picker teaser silently disappear during the high-interest delay-announcement period. No automation for this; team discipline.
- **`RELEASE_NOTES.md`**: add an entry describing the new pricing + conversion surfaces. Do not edit `public/RELEASE_NOTES.md` (generated).
- **Stale `docs/BETA_ACCESS.md`**: flagged as deferred follow-up; the section about `beta: true` in set configs is no longer accurate.

---

## Sources & References

- Repo research: `lib/patreon.ts`, `app/api/webhooks/patreon/route.ts`, `app/api/auth/patron-status/route.ts`, `app/api/admin/sync-patrons/route.ts`, `lib/discord.ts`, `src/contexts/AuthContext.jsx`, `src/utils/api.ts`, `src/utils/setConfigs/`, `src/components/SetSelection.tsx`, `src/components/LandingPage.tsx`, `src/components/About.tsx`, `src/components/AuthWidget.tsx`, `app/beta/page.tsx`, `app/draft/[shareId]/pod/page.tsx`, `app/sealed/[shareId]/pod/page.tsx`, `app/api/draft/[shareId]/join/route.ts`, `app/api/sealed/[shareId]/join/route.ts`, `app/draft/page.tsx`, `app/stats/page.tsx`.
- Repo rules: `CLAUDE.md`, `.claude/rules/ui-components.md`, `.claude/rules/architecture.md`, `.claude/rules/mobile.md`, `.claude/rules/testing.md`, `docs/STYLE_GUIDE.md`, `docs/BETA_ACCESS.md`.
- External (Patreon):
  - [How to adjust your membership tier prices](https://support.patreon.com/hc/en-us/articles/24879210577165)
  - [Best practices for increasing your tier prices](https://support.patreon.com/hc/en-us/articles/360027992451)
  - [Annual memberships creator overview](https://support.patreon.com/hc/en-us/articles/360041721372)
  - [Setting up Discord for your members](https://support.patreon.com/hc/en-us/articles/213552323)
  - [Troubleshooting Discord issues](https://support.patreon.com/hc/en-us/articles/4408372541581)
- Memory references: `feedback_e2e_ui_only`, `feedback_button_icon_spacing`, `feedback_use_button_component_for_toggles`, `feedback_destructive_cancel_buttons`, `feedback_always_build_before_commit`, `feedback_release_notes_process`, `feedback_no_legal_framing`, `feedback_test_migrations_locally`.

---

## Resolutions Log

### 2026-05-26 review

The following business-judgment decisions surfaced during document review were resolved by the user before implementation begins:

| Question | Resolution |
|----------|------------|
| Sequencing | **Ship simultaneously.** Price raise + 3 surfaces + analytics land together. Attribution loss accepted for speed. |
| ASH-window timing | **Ship now to ride the ASH window** (prerelease 2026-07-10). Land before mid-June. |
| Identity bet (3 conversion surfaces) | **Accept.** Move deliberately toward freemium posture; U7 measures whether it pays off. |
| Homepage banner sub-variant | **Ship the two-state banner.** Non-sub conversion + patron activation. |
| Annual at $60/yr (44% off) | **Committed.** No re-test at rollout. |
| Try-before-buy spoiler page | **Follow-up after analytics data lands.** Not in this plan. |
