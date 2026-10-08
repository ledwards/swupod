---
title: "feat: ASH Carbonite booster pack support"
type: feat
status: active
date: 2026-05-26
---

# feat: ASH Carbonite booster pack support

## Overview

Enable Carbonite booster packs for ASH (Ashes of the Empire, Set 8) using the existing LAW+ tiered carbonite architecture. ASH already exists as a placeholder unreleased set with pack rules copied from LAW (`src/utils/setConfigs/ASH.ts`), and `ASH-CB` is already registered in the sets API. The carbonite generator auto-routes Set 7+ into the LAW+ tiered code path, so the actual scope is closing the three remaining gaps: `supportedSets`, pack-art tables, and test coverage.

---

## Problem Frame

`ASH-CB` is half-wired:
- `src/utils/api.ts:97` exposes `ASH-CB` as a Carbonite set entry with name and dates
- `src/utils/setConfigs/ASH.ts` is a complete LAW-shaped placeholder config
- `src/utils/carboniteBoosterPack.ts:226` already routes via `isLawPlus = setNumber >= 7`, so ASH (setNumber 8) would use LAW+ tiered slots automatically

But pack generation fails today because:
- `CARBONITE_CONSTANTS.supportedSets` in `src/utils/carboniteConstants.ts` only lists `['JTL', 'LOF', 'SEC', 'LAW']`, so `isCarboniteSupported('ASH')` returns false
- `generateCarboniteBoosterPack('ASH-CB')` throws `Carbonite packs not available for ASH`
- `app/api/formats/chaos-sealed/route.ts:38` rejects `ASH-CB` requests with the same check
- `PACK_IMAGE_URLS` and `PACK_IMAGE_VARIANTS` in `src/utils/packArt.ts` have no `'ASH-CB'` entry, so the pack opener falls back to `default-pack.png`

This plan flips ASH from "registered but unreachable" to "fully functional placeholder carbonite set" using LAW's collation rules verbatim until FFG announces real ASH carbonite changes.

---

## Requirements Trace

- R1. `generateCarboniteBoosterPack('ASH-CB')` returns a 16-card pack with the LAW+ tiered structure (leader + prestige + 4C HS + 3 flex HS + 1 top HS + 4 flex HSF + 2C HSF).
- R2. `isCarboniteSupported('ASH')` returns true; `ASH-CB` is accepted by the chaos-sealed endpoint. Chaos-draft is out of scope until ASH has real spoiled cards — an upstream gate (`getUnavailableSetReason()` in `src/utils/setAvailability.ts`) rejects any set with `realCardCount: 0` regardless of `isCarboniteSupported`, and ASH currently has `realCardCount: 0`.
- R3. The pack opener renders an ASH carbonite pack image (placeholder is acceptable — reuse existing ASH expansion art until dedicated pack art lands).
- R4. ASH's carbonite behavior matches LAW's carbonite behavior. No new constants, weights, or belts are introduced. Future ASH-specific tuning is deferred until FFG announces changes.
- R5. Existing JTL/LOF/SEC/LAW carbonite behavior is unchanged. `npm run test` and `npm run qa` pass.

---

## Scope Boundaries

- ASH carbonite uses LAW's exact collation, weights, prestige tier rates, showcase rate, and slot counts. No ASH-specific tuning.
- No new belt classes. No new constants. No changes to `carboniteBoosterPack.ts` slot logic (the `isLawPlus` branch already covers Set 8).
- No dedicated ASH carbonite pack art asset is created — reuse the existing placeholder `/expansion-art/ash.png` for `ASH-CB` until a real asset exists.
- No changes to standard (non-carbonite) ASH pack generation.
- No changes to chaos-sealed UI beyond what the `includeCarbonite` flag and existing sort logic already handle.
- Chaos-draft remains blocked for ASH-CB by the upstream `getUnavailableSetReason()` gate. Standard ASH packs are blocked by the same gate today, so this is not a regression — just an inherited constraint. ASH-CB becomes draftable when the first real ASH spoiler sync flips `realCardCount > 0`. Until then, ASH-CB is chaos-sealed-only.

### Deferred to Follow-Up Work

- Dedicated ASH carbonite pack art (`/pack-images/ash-cb-pack.png`): deferred until FFG releases marketing art. Tracked as a follow-up swap in `packArt.ts`.
- ASH-specific weight tuning (showcase rate, prestige tiers, HS rarity weights): deferred until FFG announces real ASH carbonite pack rules. Until then, ASH inherits LAW's values verbatim — consistent with how `ASH_CONFIG` already inherits LAW's standard pack rules.
- Real ASH card data: `realCardCount` is 0 today. ASH-CB packs will surface placeholder bucket-generated cards (not real spoiled cards) until the first real ASH spoiler sync runs and `npm run fetch-cards` populates real data. Consistent with how standard ASH packs already behave.

---

## Context & Research

### Relevant Code and Patterns

- `src/utils/carboniteConstants.ts` — `CARBONITE_CONSTANTS.supportedSets` (line 36) and `isCarboniteSupported()` (line 116). Single-array edit point.
- `src/utils/carboniteBoosterPack.ts:226` — `isLawPlus = setNumber >= 7` already routes Set 8+ into LAW+ logic. No edits needed.
- `src/utils/setConfigs/ASH.ts` — Placeholder ASH config with `setNumber: 8`, LAW-shaped pack rules, and bucket-assumption card counts. Already complete.
- `src/utils/api.ts:97` — `ASH-CB` already in `KNOWN_SETS`. Filter logic via `includeCarbonite` already handles it.
- `src/utils/packArt.ts` — `PACK_IMAGE_URLS` (line 44) and `PACK_IMAGE_VARIANTS` (line 62). ASH standard pack already uses `/expansion-art/ash.png` as a placeholder; the same fallback pattern applies for `'ASH-CB'`.
- `src/utils/carboniteBoosterPack.test.ts` — Existing JTL (pre-LAW) and LAW+ test blocks. The LAW block at line 195+ is the structural template to mirror for ASH.
- `.claude/rules/belt-system.md` — Mandates `npm run test && npm run qa` after any belt/pack-generation change.
- `src/data/cards.json` (ASH section) — placeholder catalog declares 264 Hyperspace + 238 Hyperspace-Foil variants spanning all rarities (Common 332, Uncommon 180, Rare 166, Special 28, Legendary 60). Every belt config in the LAW+ branch (`COMMON_HS_CONFIG`, `LAW_HS_FLEX_CONFIG`, `LAW_HS_TOP_CONFIG`, `LAW_HSF_FLEX_CONFIG`, `LAW_HSF_COMMON_CONFIG`) has source rows available — pack generation will succeed structurally on day one. The cards themselves are bucket-generated placeholders, not real spoiled cards, until first sync.

### Institutional Learnings

- `plans/CARBONITE_PACK_PLAN.md` (the existing carbonite implementation doc) confirms the architecture: composite `{SET}-CB` codes, `isLawPlus` branching by `setNumber`, and shared belt cache keyed by base set code. ASH slots into this without modification.
- The ASH config comment in `src/utils/setConfigs/ASH.ts:6` already states "Pack rules are a copy of LAW (Set 7) until FFG announces changes" — this plan extends that same convention to carbonite.

---

## Key Technical Decisions

- **Reuse LAW+ branch via `setNumber >= 7`, do not branch on `setCode === 'ASH'`.** The existing `isLawPlus` check is already the right abstraction for "LAW-shaped sets." Adding a separate ASH branch would invite drift. When FFG announces ASH-specific rules, the right move is to widen the branching scheme (e.g., per-set config flag) rather than introducing a one-off ASH branch.
- **No new constants, weights, or belts.** ASH-CB shares `CARBONITE_CONSTANTS.showcaseRate.law`, `prestigeTierWeights`, `hsFlexWeights`, `hsTopWeights`, `hsfFlexWeights`, and `law.*` slot counts directly with LAW-CB. Same pattern as standard ASH packs already use `SET_7_PLUS_CONSTANTS` verbatim.
- **Reuse `/expansion-art/ash.png` as the `ASH-CB` pack image placeholder.** Standard ASH already does this for the same reason — no dedicated art exists yet. Avoids creating a fake `ash-cb-pack.png` asset and keeps the placeholder behavior consistent.
- **Mirror LAW's structural test block, do not exhaustively re-test statistical distributions.** The LAW block already validates LAW+ structural correctness. ASH tests should confirm routing, slot counts, and rarity expectations specific to ASH-CB. Statistical weight tests on LAW are sufficient coverage for the shared distributions since ASH uses identical weights — `npm run qa` will surface any structural regression.

---

## Open Questions

### Resolved During Planning

- *Does ASH belong in `supportedSets` even though it's unreleased?* — Yes. The set is registered (`ASH_CONFIG`), exposed in `api.ts`, and the carbonite generator already accepts Set 8+ via the `isLawPlus` branch. Gating it out is inconsistent with how standard ASH packs already work today.
- *Should we add a dedicated ASH carbonite pack art asset?* — Deferred. Reusing `/expansion-art/ash.png` matches the existing standard-pack pattern and avoids producing fake assets.
- *Pre-LAW vs LAW+ branch for ASH?* — LAW+ (Set 8 ≥ 7). Confirmed by reading `carboniteBoosterPack.ts:226`.

### Deferred to Implementation

- *(None — the original card-pool sufficiency question was resolved during planning; see Context & Research.)*

---

## Implementation Units

- [ ] U1. **Register ASH in `supportedSets`**

**Goal:** Make `isCarboniteSupported('ASH')` return true so `generateCarboniteBoosterPack('ASH-CB')` and the chaos-sealed validator stop rejecting ASH.

**Requirements:** R2, R4

**Dependencies:** None

**Files:**
- Modify: `src/utils/carboniteConstants.ts`

**Approach:**
- Add `'ASH'` to the `supportedSets` tuple. Keep the tuple sorted by setNumber order (JTL, LOF, SEC, LAW, ASH).
- No changes to weights, slot counts, or other constants. ASH consumes the existing `law.*` and LAW+-shared weight tables.

**Patterns to follow:**
- The `supportedSets` literal is the single source of truth for both `isCarboniteSupported()` and indirectly for the chaos-sealed validator. No other touchpoints.

**Test scenarios:**
- Happy path: `isCarboniteSupported('ASH')` returns `true`.
- Happy path: `isCarboniteSupported('SOR')` and `isCarboniteSupported('SHD')` and `isCarboniteSupported('TWI')` still return `false` (Sets 1–3 do not support carbonite).
- Edge case: `getBaseSetCode('ASH-CB')` returns `'ASH'`.

**Verification:**
- Once U1 lands, the chaos-sealed validator at `app/api/formats/chaos-sealed/route.ts:38` stops rejecting `ASH-CB`. This is R2's primary verification surface; the manual smoke test in System-Wide Impact is the end-to-end confirmation.
- The carbonite booster pack tests in U3 are the structural regression guard against this support flag being silently undone.

---

- [ ] U2. **Register `ASH-CB` pack art entries**

**Goal:** When the pack opener renders an ASH-CB pack, it uses a real image entry (the placeholder `/expansion-art/ash.png`) rather than falling back to `default-pack.png`.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `src/utils/packArt.ts`

**Approach:**
- Add `'ASH-CB': '/expansion-art/ash.png'` to `PACK_IMAGE_URLS`.
- Add `'ASH-CB': ['/expansion-art/ash.png']` to `PACK_IMAGE_VARIANTS` (single-entry array to match the other `-CB` entries).
- Match the comment/grouping style already in the file — keep all `-CB` entries together at the bottom of each record.

**Patterns to follow:**
- Standard ASH already uses `/expansion-art/ash.png` as its placeholder pack image (`packArt.ts:52` and `:70`). ASH-CB reuses the same asset until a dedicated `-CB` pack art exists.
- Other `-CB` entries (`'JTL-CB'`, `'LOF-CB'`, `'SEC-CB'`, `'LAW-CB'`) each use a single-entry variants array. Mirror that shape exactly.

**Test scenarios:**
- Happy path: `getPackImageUrl('ASH-CB')` returns `'/expansion-art/ash.png'`, not the default fallback.
- Happy path: `getCyclingPackImageUrls('ASH-CB', 3)` returns three copies of `'/expansion-art/ash.png'` (variants list has length 1, so cycling repeats).
- Happy path: `getRandomPackImageUrl('ASH-CB')` returns `'/expansion-art/ash.png'`.

**Verification:**
- Manual smoke test via the chaos-sealed page: select `ASH-CB`, generate packs, confirm the pack opener animation shows ASH art instead of the default placeholder.

---

- [ ] U3. **Add `ASH-CB` structural test coverage**

**Goal:** Lock in that `ASH-CB` produces a valid 16-card LAW+-shaped pack and that future changes to carbonite routing don't regress ASH silently.

**Requirements:** R1, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `src/utils/carboniteBoosterPack.test.ts`
- Test: `src/utils/carboniteBoosterPack.test.ts` (this is itself the test file)

**Approach:**
- Add an ASH-CB test block after the existing LAW-CB block. Mirror the LAW-CB structural tests verbatim, substituting `'ASH-CB'`. Keep the block compact — structural confirmation only; do not duplicate LAW's statistical distribution tests since the weights are identical and already covered by the LAW block.
- Include a routing test that explicitly asserts ASH takes the LAW+ branch (e.g., by checking slot 1 is Prestige and slots 2–5 are fixed Common HS — the LAW+ tiered signature).

**Patterns to follow:**
- The LAW-CB block at `src/utils/carboniteBoosterPack.test.ts:195+` is the structural template. Use the same slot-by-slot assertion style.
- Use `node --test` runner conventions (no Jest). Tests already in the file demonstrate the right shape.

**Test scenarios:**
- Happy path: `ASH-CB: pack has 16 cards` — `generateCarboniteBoosterPack('ASH-CB')` returns a pack with `pack.cards.length === 16`. Covers R1.
- Happy path: `ASH-CB: leader is Hyperspace or Showcase` — slot 0 has `isHyperspace` or `isShowcase` flag set.
- Happy path: `ASH-CB: slot 1 is Prestige` — slot 1 has `isPrestige` flag set (proves LAW+ routing).
- Happy path: `ASH-CB: slots 2-5 are Common HS (fixed)` — exactly 4 cards, all `rarity === 'Common'` and `isHyperspace === true`.
- Happy path: `ASH-CB: slot 9 is R/S/L HS (top slot)` — rarity is one of `Rare`, `Special`, or `Legendary` and `isHyperspace === true`.
- Happy path: `ASH-CB: slots 14-15 are Common HSF (fixed)` — exactly 2 cards, all `rarity === 'Common'` with both `isHyperspace` and `isFoil` flags set.
- Happy path: `ASH-CB: no Normal variant cards in pack` — every card has at least one variant flag (`isFoil`, `isHyperspace`, `isShowcase`, or `isPrestige`). Mirrors the JTL-CB "no Normal" assertion.
- Error path: `ASH-CB` is accepted by the chaos-sealed validator (regression guard against U1 being undone). Optional — covered indirectly by `isCarboniteSupported` returning true.

**Verification:**
- `npm run test` passes including the new ASH-CB block. The block runs unconditionally — no card-pool gating, no conditional skip (the placeholder pool already has the variants every LAW+ belt needs; see Context & Research).
- `npm run qa` passes with no statistical regressions on JTL/LOF/SEC/LAW. ASH is excluded from the QA statistical harness because card counts are placeholder bucket assumptions, not because pack generation is gated.

---

## System-Wide Impact

- **Interaction graph:** The chaos-sealed route calls `isCarboniteSupported(baseCode)` to validate set codes. Once U1 lands, `ASH-CB` requests to chaos-sealed stop being rejected. The chaos-draft route uses a separate `getUnavailableSetReason()` gate that blocks ASH (any variant, including `-CB`) regardless of carbonite support — this plan does not address that gate. No other validators or middleware are affected.
- **Error propagation:** `generateCarboniteBoosterPack('ASH-CB')` currently throws `Carbonite packs not available for ASH`. After U1, that throw is no longer reachable for ASH. No other call sites depend on this throw.
- **State lifecycle risks:** The carbonite belt cache (`getCBSlotBelt`, `getCBPrestigeBelt`, etc.) is keyed by base set code. ASH gets fresh belts on first call. `clearCarboniteBeltCache()` in `boosterPack.ts` already covers ASH because it clears all keys.
- **API surface parity:** `api.ts` already exposes `ASH-CB`. PackSelector already renders carbonite entries via `sortedSets.carbonite`. No parity gap remains after U1 and U2.
- **Integration coverage:** Chaos-sealed end-to-end with ASH-CB should be smoke-tested manually after the change — pick `ASH-CB` in the chaos-sealed UI, set pack count to 1, generate, confirm the response contains a 16-card pack with the expected variant flags. Unit tests alone do not exercise the chaos-sealed route.
- **Unchanged invariants:** JTL/LOF/SEC/LAW pack generation, weights, and visual treatments are unchanged. The `isLawPlus` branch was already in place for LAW; ASH enters it without modification. No standard (non-carbonite) ASH behavior changes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| ASH-CB packs surface placeholder cards (not real cards) until first real ASH spoiler sync | Acceptable for an unreleased set. Pack opener displays bucket-generated card art and names until FFG releases ASH spoilers and `npm run fetch-cards` populates real data. Consistent with how standard ASH packs already behave today. |
| FFG later announces ASH carbonite rules that differ from LAW's | Acceptable. The plan explicitly defers per-set tuning. When FFG announces, introduce a per-set carbonite config flag (mirroring how standard ASH already inherits `SET_7_PLUS_CONSTANTS`) rather than special-casing ASH inline. |
| Future contributors add a one-off `if (setCode === 'ASH')` branch instead of widening `isLawPlus` | The Key Technical Decisions section calls this out explicitly. The U-IDs in the test file should make it obvious that ASH and LAW share a code path. |
| Visual regression: placeholder ASH art looks wrong in the carbonite row of PackSelector | Acceptable for an unreleased set. Standard ASH already uses the same placeholder. Swap to dedicated art when FFG marketing assets exist (deferred to follow-up). |

---

## Documentation / Operational Notes

- Update `plans/CARBONITE_PACK_PLAN.md` to add ASH to the "Sets 4-7" framing once this ships. Either move that doc to `docs/` per `CLAUDE.md`'s "completed plans" rule, or amend the supported-sets list in place. Either is fine — the doc is documentary, not load-bearing.
- No release notes entry is required for ASH-CB specifically until ASH ships, since it's an unreleased placeholder. If the team wants to announce "ASH carbonite is wired up for early testing," that's a separate decision outside this plan's scope.
- No DB migrations, no rollout flags, no monitoring changes.

---

## Sources & References

- Existing implementation doc: [plans/CARBONITE_PACK_PLAN.md](plans/CARBONITE_PACK_PLAN.md)
- Carbonite constants: [src/utils/carboniteConstants.ts](src/utils/carboniteConstants.ts)
- Carbonite generator: [src/utils/carboniteBoosterPack.ts](src/utils/carboniteBoosterPack.ts)
- ASH set config: [src/utils/setConfigs/ASH.ts](src/utils/setConfigs/ASH.ts)
- LAW set config (the template ASH inherits from): [src/utils/setConfigs/LAW.ts](src/utils/setConfigs/LAW.ts)
- Sets API registry: [src/utils/api.ts:97](src/utils/api.ts)
- Pack art tables: [src/utils/packArt.ts](src/utils/packArt.ts)
- Belt system rules: [.claude/rules/belt-system.md](.claude/rules/belt-system.md)
