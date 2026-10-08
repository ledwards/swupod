---
date: 2026-07-12
status: requirements-draft
source: codex/gc-promo-packs-brainstorm (ce:brainstorm, 2026-06-15 → 06-19)
event: Galactic Championship 2026 — Las Vegas, Jul 24–26
---

# GC 2026 Promo Packs — "Met Me at GC" Giveaway

## Problem Frame

At GC 2026 (and select regionals/sectors), the real event hands out **Event Packs** —
**Silver Packs** and **Black Packs** — each containing ~2 random promo cards from that
event's pool. Lee wants a *fun, non-competitive keepsake*: a physical card he prepares
and hands to people he meets in person at GC. The card carries a **QR code** that opens
Protect the Pod and **unlocks Event Packs on the scanner's account**.

There is no practical/competitive purpose — the delight is turning "I met you at GC"
into a little digital pack-opening moment, with a gentle nudge toward Friend of the Pod.

**Two pack tiers, two gates:**
- **Silver Pack** — anyone with the QR/link can unlock (during the claim window).
- **Black Pack** — requires the QR/link **and** Friend of the Pod status.

## Actors

- **Scanner (new/anon)** — meets Lee at GC, scans the card, likely not signed up yet.
  The landing page is geared toward them: explain → sign in/up → unlock.
- **Scanner (existing account)** — already has a PTP account; unlock is one tap.
- **Friend of the Pod** (`user.isPatron`) — additionally eligible for Black Packs.
- **Link-forwarder** — someone who got the link second-hand from a friend. Allowed
  (the QR is intentionally shareable), still bound by the claim window.

## Key Flows

### F1 — Silver unlock (happy path)
1. Scan QR → landing page `/{claim-route}` explains the giveaway.
2. Not signed in → prompt Discord sign-in / sign-up (return to claim after).
3. Signed in → **Unlock GC 2026 Silver Pack** (account entitlement, idempotent).
4. **Gift moment**: one-time celebratory Silver Pack opening animation (2 promos).
5. Success state → route to `/formats/chaos-sealed`, where a **Promo Packs** section
   now shows the unlocked Silver Pack. A subtle, not-pushy "Become a Friend of the Pod
   to unlock your Black Pack" tease appears alongside the locked Black Pack.

### F2 — Repeat claim (idempotent)
- Re-scanning / re-opening the link after unlocking shows "You already unlocked this" —
  no second entitlement, no second gift animation. The link can circulate freely.

### F3 — Black Pack, not a Friend
- In Promo Packs, Black Pack is **visible but locked** ("Friend of the Pod unlocks this").
- Clicking it → a single entitlement-checking page → "exclusive for Friends of the Pod"
  with a soft CTA (Patreon / Friend of the Pod).

### F4 — Black Pack, Friend of the Pod
- Same click target; entitlement check passes → Black Pack opens (gift moment first
  time, then available in Promo Packs thereafter).

### F5 — Window closed
- After the claim window ends: existing unlocks remain usable forever; **new** claims
  stop (Silver and Black). Landing page explains the window has closed.

## Requirements

**Entitlement model**
- **R1** Silver Pack is an **account entitlement** ("a set you can use"), not a consumable
  inventory item. Unlocking is **idempotent** — claiming twice is a no-op.
- **R2** Black Pack is likewise an entitlement, gated on `isPatron` **and** having reached
  it via the GC claim link.
- **R3** Entitlements persist beyond the claim window; only *new* grants are window-bound.

**Claim / access**
- **R4** A **single shared QR/campaign link** unlocks Silver (Decision D3: open/shareable,
  not unique per-card codes). The URL itself is the unlock token.
- **R5** Silver unlock requires a **logged-in account** (Discord auth); the gift is per-account.
- **R6** Black unlock requires `isPatron === true` **and** the GC claim link, within the window.
- **R7** New claims (Silver + Black) are only grantable **inside the claim window =
  GC weekend, Jul 24–26, 2026** (America/Los_Angeles). Outside it, new claims are refused;
  existing unlocks remain usable forever.

**Gift moment vs. durable use** (Decision D6: "both")
- **R8** First Silver unlock plays a **one-time celebratory opening animation** (reuse
  `PackOpeningAnimation`), showing the 2 event promos.
- **R9** After the gift moment, Silver (and unlocked Black) live in a **Promo Packs** section
  on **both** `/formats/chaos-sealed` and `/formats/chaos-draft`.
- **R10** Promo Packs are **selectable pack slots** inside Chaos Sealed/Draft (even though
  each contains only promo cards) — not just a standalone opening. (Selectable path may
  land after the standalone gift path; see Scope.)

**Promo Packs section UI**
- **R11** Shows **Silver Pack**: unlocked → clickable. **Black Pack**: visible, locked
  unless Friend (Decision D5: visible locked tease, not hidden).
- **R12** Black Pack click routes to one entitlement-checking page that either **opens it**
  (Friend) or shows the **"exclusive for Friends of the Pod"** soft CTA (non-Friend).

**Landing page**
- **R13** QR landing page explains the giveaway and is **geared toward not-yet-signed-up**
  visitors; primary CTA is "unlock event packs for your account."
- **R14** Post-Silver-unlock success state carries a **subtle** Friend-of-the-Pod nudge for
  the Black Pack — deliberately not pushy.

**Card data**
- **R15** The Silver/Black event promos are **variants of existing cards**, sourced from
  strapi / swuapi (`variant_type`). Pack contents/definitions must be data-driven from
  that source, not hand-listed. (These are the same promos on
  starwarsunlimited.com GC 2026 prizing.)

## Acceptance Examples

- Anon scans QR → signs in → sees Silver unlock → animation plays with 2 promos → lands on
  Chaos Sealed with Silver in Promo Packs and a locked Black Pack tease. ✅
- Same user re-opens the link → "already unlocked," no new animation, no duplicate. ✅
- Non-Friend clicks Black Pack → "exclusive for Friends of the Pod" + soft CTA. ✅
- Friend clicks Black Pack (having used the claim link) → Black Pack opens. ✅
- A user who never scanned but *is* a Friend → does **not** automatically get Black Packs
  (Decision D9: QR **+** Friend). ✅
- After the window closes, a prior unlocker still opens Silver in Chaos Sealed; a new
  scanner sees "claim window closed." ✅

## Success Criteria

- Feels like a **convention secret handshake**, not a coupon/email-capture raffle.
- Zero-friction for existing accounts; clear sign-up on-ramp for new ones.
- The unlock is a *moment* (animation) but the value is *durable* (playable in chaos formats).
- Drives a gentle, honest Friend-of-the-Pod conversion via the Black Pack tease.

## Scope Boundaries

**In scope**
- Shared-link Silver entitlement + idempotent claim + claim-window gating.
- Black Pack entitlement gated on `isPatron` + claim link.
- One-time gift opening animation; Promo Packs section in Chaos Sealed + Chaos Draft.
- Data-driven Silver/Black pack contents from strapi/swuapi variants.

**Out of scope (for this pass)**
- Unique/trackable per-card codes, redemption analytics dashboards (Decision D3 chose open).
- Physical card print/design production (Lee prepares the card himself).
- Trading/gifting packs between accounts; any real-money or FFG-prize tie-in.
- Non-GC events (regionals/sectors) — architecture should not preclude, but not built now.

**Possibly phase-2**
- R10 selectable-in-chaos-formats may follow the standalone gift path rather than ship together.

## Key Decisions

- **D1** GCs = **Galactic Championships** (GC 2026, Las Vegas, Jul 24–26).
- **D2** Giveaway shape = physical card → **QR/link → account unlock**.
- **D3** Access = **open/shareable** single link (not unique per-card codes).
- **D4** Silver = **account entitlement**, claim is **idempotent**.
- **D5** Non-Friend Black Pack = **visible locked tease**.
- **D6** Post-unlock = **both** — one-time gift animation **and** durable availability.
- **D7** Durable home = **Promo Packs** section in **Chaos Sealed + Chaos Draft**; Black Pack
  click → single entitlement-checking page.
- **D8** Promo Packs = **standalone gift opening + selectable chaos pack** (both).
- **D9** Black access rule = **QR + Friend** (second-hand link OK); **not** auto-granted to
  all Friends.
- **D10** New claims are **time-windowed = GC weekend only (Jul 24–26, 2026)**; existing
  unlocks persist forever.

## Dependencies / Assumptions

- **Auth**: Discord sign-in exists; `user.isPatron` is the Friend-of-the-Pod signal
  (`src/utils/auth.ts`, `src/types/user.ts`).
- **Reuse**: `src/components/PackOpeningAnimation.tsx`; `/me` account history surface.
- **Formats**: `app/formats/chaos-sealed`, `app/formats/chaos-draft`,
  `app/api/formats/chaos-sealed` already exist as the host surfaces.
- **Precedent**: promo variants (Weekly Play, Prerelease, PQ, SS) are currently *filtered
  out* of `cards.json` and mapped to Normal-variant UUIDs
  (`migrations/050_fix_promo_variant_card_ids.js`) — the GC event promos are a **new class**
  of promo variant that this feature must be able to represent and open.
- **Card data**: strapi/swuapi must expose the GC 2026 Silver/Black promo variants
  ("soon" per Lee) — the exact `variant_type`/CDN availability is the main data risk.
- New persistence: an **entitlements** concept (per-account Silver/Black grants) does not
  exist yet — likely a new table + migration + API (to be settled in planning).

## Outstanding Questions

### Resolve Before Planning
- **✓ RESOLVED — Claim window = GC weekend only (Jul 24–26, 2026).** Tight and special;
  the unlock means "I met you at GC." (Considered but rejected: week+grace, end-of-season.)
- **Silver pack contents** — is it always the *same* 2 GC promos, a fixed GC Silver set,
  or randomized per open? (Brainstorm framed it as unlocking a "set"; open at 2 cards each.)
- **Data readiness** — are the GC 2026 Silver/Black variants actually in swuapi/strapi yet,
  or do we need a stopgap catalog (cf. the Wayfinder `/live/gc2026` prizing page, which hit
  exactly this wall — clean promo art only in Discord, not swuapi)?

### Deferred to Planning
- Entitlement storage shape (table/columns, idempotency key, window enforcement).
- Claim route/URL (`/gift/gc2026`? `/claim/...`?) and how the QR encodes it.
- Whether Promo Packs selectability in chaos formats ships with, or after, the gift path.

## Next Steps

1. ~~Pick the claim window~~ — ✓ **GC weekend only (Jul 24–26, 2026)**.
2. Confirm **swuapi/strapi data readiness** for GC 2026 Silver/Black variants (main data risk).
3. Decide **Silver pack contents** (fixed 2 promos vs. randomized) — small product call.
4. Hand this to `ce:plan` for the HOW (entitlement schema + migration, claim route/QR URL,
   Promo Packs UI, chaos-format integration, window enforcement).
