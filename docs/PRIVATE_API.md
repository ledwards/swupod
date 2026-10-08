# Private API

Server-to-server API for trusted first-party integrations (currently: SWUTeam).

## Authentication

Private endpoints use a shared service key, not user sessions.

```
Authorization: Bearer <PTP_SERVICE_KEY>
```

Set `PTP_SERVICE_KEY` in your environment. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The calling service must use the same key. User JWTs and session cookies are **not** accepted on private endpoints.

## Endpoints

### GET /api/private/user-data

Fetch all data for a single user by Discord ID.

**Query Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `discord_id` | Yes | Discord user ID (snowflake) |

**Example:**

```bash
curl -H "Authorization: Bearer $PTP_SERVICE_KEY" \
  "https://www.protectthepod.com/api/private/user-data?discord_id=123456789012345678"
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "playerone",
      "discordId": "123456789012345678",
      "avatarUrl": "https://cdn.discordapp.com/...",
      "createdAt": "2026-01-15T..."
    },
    "pools": [
      {
        "poolId": "uuid",
        "shareId": "abc1234567",
        "setCode": "JTL",
        "setName": "Jump to Lightspeed",
        "poolType": "draft",
        "name": "JTL Draft 03/15/2026",
        "cards": [{ "cardId": "JTL_001", "name": "Card Name", ... }],
        "cardCount": 45,
        "createdAt": "2026-03-15T...",
        "pod": {
          "shareId": "xyz9876543",
          "status": "complete",
          "playerCount": 8,
          "setCode": "JTL",
          "name": "Friday Night Draft"
        }
      }
    ],
    "builtDecks": [
      {
        "poolShareId": "abc1234567",
        "setCode": "JTL",
        "setName": "Jump to Lightspeed",
        "poolType": "draft",
        "leader": { "cardId": "JTL_001", "name": "Leader Name", "aspects": ["Vigilance"], ... },
        "base": { "cardId": "JTL_002", "name": "Base Name", "aspects": ["Command"], ... },
        "deck": [{ "cardId": "...", "name": "...", "rarity": "Common", "type": "Unit", ... }],
        "sideboard": [{ "cardId": "...", "name": "...", ... }],
        "deckSize": 30,
        "builtAt": "2026-03-15T..."
      }
    ],
    "draftPicks": [
      {
        "podShareId": "xyz9876543",
        "podSetCode": "JTL",
        "podCompletedAt": "2026-03-15T...",
        "cardId": "JTL_042",
        "cardName": "Card Name",
        "setCode": "JTL",
        "rarity": "Rare",
        "cardType": "Unit",
        "variantType": "Normal",
        "isLeader": false,
        "packNumber": 1,
        "pickInPack": 3,
        "pickNumber": 5,
        "leaderRound": null,
        "pickedAt": "2026-03-15T..."
      }
    ]
  },
  "message": null
}
```

**When user doesn't exist on PTP (200, not 404):**

```json
{
  "success": true,
  "data": {
    "user": null,
    "pools": [],
    "builtDecks": [],
    "draftPicks": []
  },
  "message": null
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 400 | Missing `discord_id` parameter |
| 401 | Missing or invalid service key |
| 500 | Server error |

## Adding New Private Endpoints

1. Create route in `app/api/private/<endpoint>/route.ts`
2. Call `requireServiceKey(request)` as the first line (from `lib/auth.ts`)
3. Follow standard PTP response format (`jsonResponse` / `handleApiError`)
4. Add tests in `route.test.ts` alongside the route
5. Document in this file
