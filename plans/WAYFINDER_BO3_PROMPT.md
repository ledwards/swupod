# Wayfinder Bo3 Per-Game Reporting — Integration Prompt

## Context

Protect the Pod (PTP) has a competitive draft mode with best-of-3 (Bo3) match tracking. PTP already has full UI for displaying per-game results (game dots on match cards, round tabs, result reporting modals) — but none of it works yet because Wayfinder currently sends **one result per overall match** instead of **one result per game**.

PTP's match result endpoint has been updated to support a new `gameNumber` field. The goal is for Wayfinder to call PTP after each individual game in a Bo3 completes, so the match cards fill in game-by-game in real time.

---

## Current Behavior (What Wayfinder Does Now)

After a Bo3 match finishes on Karabast, Wayfinder calls PTP once:

```
POST https://www.protectthepod.com/api/plugin/v1/match/result
Authorization: Bearer <PTP_SERVICE_KEY>
Content-Type: application/json

{
  "poolShareId": "abc123",
  "result": "win",
  "matchId": "ing-70c57e93-0e5b-46e1-920e-d2e87e6cb237"
}
```

This fires once per player's pool, with the **overall match result**. PTP treats it as a single game and the Bo3 bracket never completes.

---

## New Behavior (What Wayfinder Should Do)

### For pools that belong to competitive pods

Call PTP **after each game** in the Bo3, as soon as the game ends:

```
POST https://www.protectthepod.com/api/plugin/v1/match/result
Authorization: Bearer <PTP_SERVICE_KEY>
Content-Type: application/json

{
  "poolShareId": "abc123",
  "result": "win",
  "matchId": "ing-70c57e93-0e5b-46e1-920e-d2e87e6cb237",
  "gameNumber": 1
}
```

Then after game 2:

```json
{
  "poolShareId": "abc123",
  "result": "loss",
  "matchId": "ing-70c57e93-0e5b-46e1-920e-d2e87e6cb237",
  "gameNumber": 2
}
```

And if game 3 happens (players split 1-1):

```json
{
  "poolShareId": "abc123",
  "result": "win",
  "matchId": "ing-70c57e93-0e5b-46e1-920e-d2e87e6cb237",
  "gameNumber": 3
}
```

### For non-competitive pools

Keep the current behavior: one call per match, no `gameNumber` field. PTP handles this path unchanged.

---

## API Contract

### `POST /api/plugin/v1/match/result`

**Auth:** `Authorization: Bearer <PTP_SERVICE_KEY>`

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `poolShareId` | string | yes | The PTP pool share ID (from the play page URL) |
| `result` | string | yes | `"win"`, `"loss"`, or `"draw"` — from this player's perspective |
| `matchId` | string | yes | The Wayfinder match ID (same for all games in a Bo3) |
| `gameNumber` | integer | no | `1`, `2`, or `3`. When provided, PTP fills that specific game slot. When omitted, PTP falls back to filling the next empty slot (legacy behavior). |

**Response:** `{ "ok": true }` on success.

**Error responses:**
- `400` — missing required fields, invalid `result`, or `gameNumber` not 1/2/3
- `401` — missing or invalid service key
- `404` — pool not found, no active round, or no active match for this player

---

## How PTP Uses This

When `gameNumber` is provided and the pool belongs to a competitive pod:

1. PTP writes the result to the specific game slot (`game1_result`, `game2_result`, or `game3_result`) on the `practice_matches` row
2. PTP broadcasts the update via Socket.io so the match card's game dots update in real time for all connected clients
3. After each game, PTP checks if the Bo3 is decidable (someone has 2 wins)
4. When decided, PTP auto-confirms the match, updates both players' pool W/L/D records, and advances the tournament round

The `matchId` is stored on the practice match and used to render a "View Match ↗" link on the match card pointing to `https://plugin.wayfinder.news/matches/{matchId}`.

---

## How Wayfinder Should Detect Competitive Mode

Wayfinder already knows the `poolShareId` from the PTP play page URL. Two options:

### Option A: PTP tells Wayfinder via the play metadata endpoint (preferred)

PTP's existing endpoint `GET /api/plugin/v1/play/pool/{shareId}` could return a `competitive` flag:

```json
{
  "setCode": "LAW",
  "format": "pool",
  "isLatestSet": true,
  "cardPool": "Current",
  "competitive": true
}
```

PTP will add this field. When `competitive` is `true`, Wayfinder should send per-game results with `gameNumber`. When `false` or absent, use the current single-call behavior.

### Option B: Always send `gameNumber` for all Bo3 matches

PTP handles both cases correctly — `gameNumber` is optional. If Wayfinder always sends per-game results with `gameNumber`, PTP will do the right thing for both competitive and non-competitive pools. For non-competitive pools, each game call increments W/L/D individually (which is slightly different from one increment per match, but acceptable).

**Recommendation:** Option A is cleaner semantically, but Option B is simpler to implement. Pick whichever is easier on the Wayfinder side.

---

## What Wayfinder Needs to Track

For each ongoing Bo3 match linked to a PTP pool:

1. **Game counter** — track which game number the players are on (1, 2, or 3)
2. **PTP pool share IDs** — for both players if both have PTP pools, so results are reported for each
3. **Match ID** — the Wayfinder match ID, same across all games

After each game ends on Karabast:
1. Determine the game result for each linked PTP player
2. Call the PTP endpoint for each player's pool with the game-specific result and `gameNumber`
3. Increment the game counter

---

## Edge Cases

- **Only one player has a PTP pool:** Report for that player only. PTP handles this — the match can still be decided from one player's reports alone.
- **Game ends in draw:** Send `"result": "draw"` with the `gameNumber`. Draws are tracked per-game.
- **Match abandoned mid-Bo3:** Don't send results for games that didn't happen. The PTP pod owner can manually override results via the UI.
- **Rematch / new Bo3 in same round:** PTP filters for `final_confirmed = false`, so it will only find the active unconfirmed match. Once confirmed, subsequent calls return 404 for that player.
- **Duplicate calls for same game:** Safe. Writing the same `gameNumber` twice overwrites with the same value (idempotent).

---

## Summary of Changes Needed in Wayfinder

1. **After each game in a Bo3 ends**, call `POST /api/plugin/v1/match/result` with `gameNumber` (1, 2, or 3) — not just after the overall match
2. **Track game count** within a Bo3 match linked to PTP
3. **(Optional)** Read `competitive` flag from `GET /api/plugin/v1/play/pool/{shareId}` to decide whether to send per-game or per-match results