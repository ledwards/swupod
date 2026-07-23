# Event Packs in Chaos Draft

**Status:** built (v1)
**Decided:** opt-in; Chaos Draft only (never competitive/normal draft). Event Packs are **drafted
as their own bonus rounds** (updated from the earlier augment model, per user).

## Model

Each chaos draft round is one `chaosSets` entry → 8 packs (one per seat), dealt by
`processBoxPacksForDraft` (`packIndex = packNum*8 + player`). An Event Pack simply becomes another
`chaosSets` entry: it generates 8 two-card Event Packs and is drafted as a normal round — pick 1,
pass the rest. So a "3-pack" chaos draft with one Event Pack opted in is a **4-round draft** (3
set rounds + 1 Event Pack round appended last).

**Consequence (accepted):** because it's drafted, you keep **1** of the pack's 2 cards and pass
the other — unlike the keepsake-augment model where you'd keep both.

Leaderless/baseless Event Packs pass through the pipeline cleanly: `processBoxPacksForDraft`
guards leader/base extraction (`if (leaderIndex >= 0)`), so the Event Pack round contributes 0
leaders and keeps both cards. The leader-draft phase is unaffected (leaders still come only from
the set packs).

## Implementation

1. **`app/formats/chaos-draft/page.tsx`** — reuses the `PackSelector` promos group + `splitSelection`.
   Event Packs show in their own opt-in row and don't inflate the set-pack count, but on submit
   they're merged into `chaosSets` (`[...setPacks, ...promoPacks]`) so each becomes a drafted round.
2. **`app/api/draft/route.ts`** — Event Pack codes in `chaosSets` skip the set-availability check
   and are validated for entitlement instead (creator must own the tier; can't spoof). Box gen:
   a promo code generates 8 `drawEventPack(...)` packs (same 8-per-slot shape as a set round). The
   auto-name shows "GC Silver"/"GC Black".
3. **`app/api/draft/[shareId]/start/route.ts`** — no change. `packsPerPlayer` and `chaosSetCount`
   both derive from `chaosSets.length`, which now includes the Event Pack rounds automatically.
4. **`app/api/draft/[shareId]/pool/route.ts`** — no change. Drafted Event Pack cards arrive via
   `drafted_cards` like any pick; the pool groups them into the Event Pack round.

**Reused verbatim:** `drawEventPack`, `promo_entitlements` check, `PROMO_SET_CODES`/`splitSelection`,
`PackSelector` promos group.

## Verification

- Engine test (direct): box for `[ASH,ASH,ASH,GC2026_SILVER]` → 32 packs; round sizes 14/14/14/**2**;
  3 leaders (set packs only); Event round is all-silver promos, no leader.
- Server smoke: create (201) → add 7 bots (200) → start (200 → `leader_draft`, 8 players).
- E2e: setup shows the opt-in Event Packs that don't count toward the set-pack count.
- Full 8-bot draft-to-completion e2e deferred (too slow for the suite); `draftAdvance` already
  handles variable pack sizes, and the pool builds from `drafted_cards`.

## Scope

v1 = solo/creator (Chaos Draft vs bots). The Event Pack round is a pod-level opt-in gated on the
creator's ownership; the 7 bots draft it too (fine for solo). Multiplayer per-seat entitlement is
a follow-up if group Chaos Draft ever needs it.
