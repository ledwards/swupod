# Wayfinder Companion → PTP: send deck identities with match results

**Hand this to the Wayfinder team.** It describes a small, backwards-compatible
addition to the call the Companion already makes when it records a match.

## Why

On Protect the Pod's **My Stats** page (`/me`), the game-history list currently
shows the player's own leader vs. the opponent's *avatar + username*. We can't
show the opponent's leader or archetype because the Companion never sends it —
PTP only stores player IDs and game results.

We want each history row to read **"Your Leader vs Opponent's Leader (opponent
name)"**, with both leader images, and optional archetype labels. The Companion
already knows both decks from the Karabast game state, so it's the right source.

## What to change

You already call:

```
POST https://protectthepod.com/api/plugin/v1/match/result
Authorization: Bearer <PTP_SERVICE_KEY>
Content-Type: application/json

{
  "poolShareId": "wf-terronk-c876fb2bef",   // the reporting player's PTP pool
  "result": "win" | "loss" | "draw",         // from the reporting player's POV
  "matchId": "<wayfinder match id>",
  "gameNumber": 1,                            // 1 | 2 | 3 (competitive per-game)
  "replayUrl": "https://wayfinder.news/replay/..."
}
```

**Add these OPTIONAL fields** (everything is nullable; old builds keep working):

```jsonc
{
  // ...existing fields...

  // The reporting player's deck (the side that owns poolShareId):
  "playerLeader":       "Luke Skywalker",            // leader card display name
  "playerLeaderImage":  "https://.../luke.png",      // leader art URL (Karabast/FFG)
  "playerBase":         "Echo Base",                 // base card display name
  "playerBaseImage":    "https://.../echo.png",      // base art URL
  "playerArchetype":    "Luke Aggro",                // optional human archetype label

  // The OPPONENT's deck (the other side of this game):
  "opponentLeader":      "Darth Vader",
  "opponentLeaderImage": "https://.../vader.png",
  "opponentBase":        "Command Center",
  "opponentBaseImage":   "https://.../command.png",
  "opponentArchetype":   "Vader Control"
}
```

### Rules
- **Perspective:** `player*` is always the deck that owns `poolShareId`;
  `opponent*` is the other side. PTP maps these onto the correct player1/player2
  slots itself.
- **Names** should be the card's display name (what shows on the card).
- **Image URLs** can be whatever art URL you already have in-game (we render it
  directly; we don't re-host).
- **Archetype** is optional — send it if you classify decks; otherwise omit and
  we'll show leader/base only.
- Send the identities on **every game call** (or just the first); PTP keeps the
  first non-null value per match, so resending is harmless.
- No change to auth, URL, method, or the existing fields.

## What PTP does on receipt (already built, waiting for your data)

- Migration `070_add_match_deck_identity.sql` adds nullable columns to
  `practice_matches`: `player{1,2}_leader`, `_leader_image`, `_base`,
  `_base_image`, `_archetype`.
- `POST /api/plugin/v1/match/result` reads the new fields and stores them on the
  right player slot (COALESCE, so earlier-captured values are preserved).
- `/api/stats/me/gameplay` surfaces the opponent's leader/image/base/archetype
  (and the player's own archetype) per match.
- `/me` renders the opponent's leader art + "Leader vs Leader (opponent)" and
  shows archetypes in the expanded match detail. Until you send the data, it
  falls back to the opponent avatar — no breakage.

## Test

Once shipped, record one game with the new fields and confirm on `/me`:
the matching row shows the opponent's leader art and name, and expanding it
shows both archetypes.
