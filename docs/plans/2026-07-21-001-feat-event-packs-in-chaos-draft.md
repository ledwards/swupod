# Event Packs in Chaos Draft

**Status:** planned
**Decided:** opt-in only; Chaos Draft only (never competitive/normal draft); augment model, exactly like Chaos Sealed.

## Why this is its own thing

An Event Pack is **2 cards, Units only, no Leaders/Bases**. It cannot be a real draft
booster (you can't meaningfully pick-1-and-pass a 2-card no-leader pack). So Event Packs are
**not drafted** — they are opened as a keepsake bonus and **appended to each owning player's
final pool**, the same way they augment a Chaos Sealed pool. The draft engine (pick order,
passing, rounds) is untouched.

## UX (mirrors Chaos Sealed)

- Chaos Draft setup reuses `PackSelector`'s existing **promos group** — the same "GC 2026
  Event Packs" tiles, locked states, and half-size "Plus your Event Packs" row.
- **Opt-in:** an owner chooses to add their Event Pack(s); default is off/none. Non-owners see
  the locked tiles (link to `/gift/gc2026`) but can't add them, exactly as in sealed.
- Event Packs **do not count** against the pack count (`splitSelection`), same as sealed.
- Only rendered in Chaos Draft — never surfaced in normal/competitive draft setup.

## Implementation (reuse, no new modalities)

1. **`app/formats/chaos-draft/page.tsx`** — mirror the chaos-sealed page's Event Pack handling:
   fetch `/api/promo/entitlements`, append owned/locked Event Packs to the `sets` passed to
   `PackSelector`, use `splitSelection` so they augment, render the "Plus your Event Packs" row.
   Send the chosen Event Pack tiers to `createDraft` as `settings.eventPacks` (separate from
   `chaosSets`, which stays the draftable packs).
2. **`app/api/draft/route.ts`** — persist `settings.eventPacks`, validated against the creator's
   `promo_entitlements` server-side (a client can't spoof an unowned tier — same check as the
   chaos-sealed route).
3. **`app/api/draft/[shareId]/pool/route.ts`** — when the pod carries `settings.eventPacks`,
   append `drawEventPack(...)` cards to the assembled pool **per player, gated on that player's
   own entitlement** (re-validated from `promo_entitlements`; bots get nothing). This is the only
   backend behavior change; drafting itself is unaffected.
4. **Pool view** — the Event Pack cards already render like any pool card; add a small "GC 2026
   Event Packs added" note so it's clear they weren't drafted.

**Reused verbatim:** `drawEventPack`, `promo_entitlements` query, `PROMO_SET_CODES` /
`splitSelection` / `validateChaosSealedSelection` helpers, `PackSelector` promos group, the
pack-opening components.

## Scope decision needed

- **v1 = solo/creator path** (the common Chaos-Draft-vs-bots case): the creator opts in and
  their owned Event Packs augment their pool. Simple, fully consistent with sealed.
- **Multiplayer per-player opt-in** (each human adds their own at join time) is a larger UI
  change — recommend deferring to a follow-up. The pool-assembly logic (step 3) is already
  per-player, so multiplayer only needs a join-time opt-in UI later.

## Testing

- Unit: pool assembly appends exactly the tiers a player owns; a non-owner / bot gets nothing;
  opt-out adds nothing.
- E2e: an owner sets up a Chaos Draft with Event Packs on, completes it, and their pool contains
  the Event Pack cards on top of the drafted cards; the toggle is absent from normal draft setup.
