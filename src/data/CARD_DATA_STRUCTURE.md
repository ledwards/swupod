# Card Data Structure

This document describes the structure of the `cards.json` file that contains all Star Wars: Unlimited card data.

## File Location
`src/data/cards.json`

## Structure

The file should be a JSON object with a `cards` array:

```json
{
  "cards": [
    {
      "id": "SOR-001",
      "name": "Luke Skywalker",
      "set": "SOR",
      "rarity": "Legendary",
      "type": "Leader",
      "aspects": ["Heroism", "Command"],
      "cost": 0,
      "isLeader": true,
      "isBase": false,
      "imageUrl": "https://swudb.com/images/cards/SOR-001.jpg"
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "lastUpdated": "2025-01-14"
  }
}
```

## Card Object Properties

### Card Identifiers (IMPORTANT)

Cards have TWO different ID fields that serve different purposes:

| Field | Example | Purpose |
|-------|---------|---------|
| `id` | `"42080"` or `"ash-slot:normal:main:rare:vigilance:001"` | **Internal ID** - Used as lookup key in the app's card cache. Required for image lookups, data enrichment, etc. ASH spoiler-season placeholders use synthetic bucket-slot IDs until real cards are spoiled. |
| `cardId` | `"SEC-1029"` | **External/Display ID** - The canonical card identifier matching printed cards and external systems (SWUDB). Used for deck exports (formatted as `SEC_029` for SWUDB). |

**Why two IDs?**
- The `id` field is a stable internal key used for fast lookups in our card cache
- The `cardId` field matches how cards are identified externally (SWUDB, printed cards)
- When exporting decks, we use `cardId` converted to SWUDB format (underscore, zero-padded)
- For ASH during spoiler season, unresolved placeholders do not have collector numbers. Real ASH cards keep their SWUAPI identity once spoiled.

**Database storage:**
- `card_generations.card_id` stores the **internal `id`** for image lookups
- JSON card objects in pools/drafts use `id` as the **internal `id`**
- The `cardId` field is preserved on card objects for export purposes

### Required Fields

- **id** (string): Internal unique identifier (e.g., "42080", "1479")
- **cardId** (string): External display identifier (e.g., "SEC-1029", "SOR-001"). ASH placeholders may have `null` because they do not represent printed collector-number cards yet.
- **name** (string): The card's name
- **set** (string): Set code - one of: `SOR`, `SHD`, `TWI`, `JTL`, `LOF`, `SEC`, `LAW`, `ASH`
- **rarity** (string): One of: `Common`, `Uncommon`, `Rare`, `Legendary`, `Special`
- **type** (string): Card type - `Leader`, `Base`, `Unit`, `Event`, `Upgrade`, etc.
- **isLeader** (boolean): `true` if this is a leader card
- **isBase** (boolean): `true` if this is a base card

### Optional Fields

- **aspects** (array of strings): Card aspects (e.g., `["Villainy", "Command"]`, `["Heroism"]`, `["Cunning"]`)
- **cost** (number): Resource cost of the card
- **imageUrl** (string): URL to the card image
- **subtitle** (string): Card subtitle
- **text** (string): Card text/ability text
- **power** (number): Power value (for units)
- **health** (number): Health value (for units)
- **traits** (array of strings): Card traits (e.g., `["Jedi", "Rebel"]`)
- **isPlaceholder** (boolean): `true` for spoiler-season placeholder cards
- **spoilerStatus** (string): `placeholder` or `spoiled`
- **placeholderKind** (string): `bucket-slot` for ASH spoiler placeholders
- **placeholderGroup** (string): `leader`, `base`, or `main`
- **placeholderBucketId** (string): Stable synthetic bucket ID used for resolution
- **placeholderBucketLabel** (string): Human-readable bucket label such as `Rare Vigilance`
- **placeholderSlotIndex** (number): Index within the bucket's remaining unknown slots
- **inferredFields** (array of strings): Fields inferred for placeholders

## Set Codes

- **SOR**: Spark of Rebellion
- **SHD**: Shadows of the Galaxy
- **TWI**: Twilight of the Republic
- **JTL**: Jump to Lightspeed
- **LOF**: Legends of the Force
- **SEC**: Secrets of Power
- **LAW**: A Lawless Time
- **ASH**: Ashes of the Empire

## Rarity Values

- **Common**: Common rarity cards
- **Uncommon**: Uncommon rarity cards
- **Rare**: Rare rarity cards
- **Legendary**: Legendary rarity cards

## Card Types

- **Leader**: Leader cards (guaranteed 1 per pack)
- **Base**: Base cards (guaranteed 1 per pack)
- **Unit**: Unit cards
- **Event**: Event cards
- **Upgrade**: Upgrade cards
- **Resource**: Resource cards

## Example Card Entries

### Leader Card
```json
{
  "id": "1479",
  "cardId": "SOR-001",
  "name": "Luke Skywalker",
  "subtitle": "Faithful Friend",
  "set": "SOR",
  "rarity": "Legendary",
  "type": "Leader",
  "aspects": ["Heroism", "Command"],
  "cost": 0,
  "isLeader": true,
  "isBase": false,
  "variantType": "Normal",
  "imageUrl": "https://cdn.starwarsunlimited.com/...",
  "backImageUrl": "https://cdn.starwarsunlimited.com/..."
}
```

### Base Card
```json
{
  "id": "420",
  "cardId": "SOR-027",
  "name": "Dagobah Swamp",
  "set": "SOR",
  "rarity": "Common",
  "type": "Base",
  "aspects": ["Heroism"],
  "cost": 0,
  "isLeader": false,
  "isBase": true,
  "variantType": "Normal",
  "imageUrl": "https://cdn.starwarsunlimited.com/..."
}
```

### Unit Card
```json
{
  "id": "156",
  "cardId": "SOR-042",
  "name": "Stormtrooper",
  "set": "SOR",
  "rarity": "Common",
  "type": "Unit",
  "aspects": ["Villainy"],
  "cost": 2,
  "power": 2,
  "hp": 2,
  "isLeader": false,
  "isBase": false,
  "traits": ["Trooper", "Imperial"],
  "variantType": "Normal",
  "imageUrl": "https://cdn.starwarsunlimited.com/..."
}
```

### Showcase Variant Card
```json
{
  "id": "42080",
  "cardId": "SEC-1029",
  "name": "Mon Mothma",
  "subtitle": "Forming a Coalition",
  "set": "SEC",
  "rarity": "Common",
  "type": "Leader",
  "aspects": ["Command", "Heroism"],
  "isLeader": true,
  "isBase": false,
  "variantType": "Showcase",
  "isShowcase": true,
  "imageUrl": "https://cdn.starwarsunlimited.com/...",
  "backImageUrl": "https://cdn.starwarsunlimited.com/..."
}
```

### ASH Placeholder Card
```json
{
  "id": "ash-slot:normal:main:rare:vigilance:001",
  "cardId": null,
  "name": "Unknown ASH Rare Vigilance Slot 1",
  "set": "ASH",
  "number": null,
  "rarity": "Rare",
  "type": "Unknown",
  "aspects": ["Vigilance"],
  "cost": null,
  "power": null,
  "hp": null,
  "variantType": "Normal",
  "imageUrl": null,
  "isPlaceholder": true,
  "spoilerStatus": "placeholder",
  "placeholderVersion": "2026-05-20-sec-shaped-law-multicolor-v2",
  "placeholderKind": "bucket-slot",
  "placeholderGroup": "main",
  "placeholderBucketId": "ash-slot:normal:main:rare:vigilance",
  "placeholderBucketLabel": "Rare Vigilance",
  "placeholderSlotIndex": 1,
  "inferredFields": ["rarity", "aspects", "variantType"]
}
```

## Populating the Data

To populate `cards.json`, run:

```bash
npm run fetch-cards
```

This fetches real cards from SWUAPI into `cards.raw.json`, then post-processes them into `cards.json`. During ASH spoiler season, post-processing also merges the placeholder catalog.

The app will automatically use cards from this file when generating booster packs.
