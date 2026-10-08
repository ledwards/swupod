# Karabast PR: Add Protect the Pod as a Deck Source

PR against `SWU-Karabast/forceteki-client` (main branch).

Following the exact pattern of PR #598 (SWUIndex), 5 files need changes.

---

## 1. `src/app/_utils/fetchDeckData.ts`

### Add enum value (after `SWUIndex`):

```diff
 export enum DeckSource {
     NotSupported = 'NotSupported',
     SWUStats = 'SWUStats',
     SWUDB = 'SWUDB',
     SWUnlimitedDB = 'SWUnlimitedDB',
     SWUCardHub = 'SWUCardHub',
     SWUBase = 'SWUBase',
     SWUMetaStats = 'SWUMetaStats',
     MySWU = 'MySWU',
     SWUIndex = 'SWUIndex',
+    ProtectThePod = 'ProtectThePod',
 }
```

### Add URL detection in `determineDeckSource()` (after the SWUIndex block):

```diff
     } else if (deckLink.includes('swuindex.com')) {
         return DeckSource.SWUIndex;
+    } else if (deckLink.includes('protectthepod.com')) {
+        return DeckSource.ProtectThePod;
     }
```

---

## 2. `src/app/_utils/checkJson.ts`

### Add URL to whitelist in `parseInputAsDeckData()`:

```diff
         input.includes('my-swu.com') ||
-        input.includes('swuindex.com')
+        input.includes('swuindex.com') ||
+        input.includes('protectthepod.com')
     ) {
```

---

## 3. `src/app/_constants/constants.ts`

### Add display name mapping in `SupportedDeckSources` switch:

```diff
             case DeckSource.SWUIndex:
                 return 'swuindex.com';
+            case DeckSource.ProtectThePod:
+                return 'protectthepod.com';
             default:
```

---

## 4. `src/app/api/swudbdeck/route.ts`

### Add URL parsing + API proxy block (after the SWUIndex block):

```typescript
    } else if (deckLink.includes('protectthepod.com')) {
        deckSource = 'ProtectThePod';

        // Extract shareId from various URL patterns:
        //   /sealed_pool/{shareId}
        //   /draft_pool/{shareId}
        //   /pool/{shareId}/...
        //   /formats/pack-wars/{shareId}
        //   /formats/pack-blitz/{shareId}
        //   /formats/rotisserie/{shareId}
        const url = new URL(deckLink);
        const pathMatch = url.pathname.match(
            /(?:sealed_pool|draft_pool|pool|formats\/(?:pack-wars|pack-blitz|rotisserie))\/([a-zA-Z0-9_-]+)/
        );

        if (!pathMatch || !pathMatch[1]) {
            return NextResponse.json(
                { error: 'Invalid Protect the Pod URL. Share a pool or deck builder link.' },
                { status: 400 }
            );
        }

        const shareId = pathMatch[1];
        deckIdentifier = shareId;
        const apiUrl = `https://protectthepod.com/api/pools/${encodeURIComponent(shareId)}/deck.json`;

        const apiResponse = await fetch(apiUrl);
        if (!apiResponse.ok) {
            const errorText = await apiResponse.text().catch(() => '');
            if (apiResponse.status === 400 && errorText.includes('No deck has been built')) {
                return NextResponse.json(
                    { error: 'No deck has been built for this pool yet. Build a deck first, then share the link.' },
                    { status: 400 }
                );
            }
            return NextResponse.json(
                { error: `Failed to fetch deck from Protect the Pod: ${apiResponse.status}` },
                { status: apiResponse.status }
            );
        }

        data = await apiResponse.json();
    }
```

---

## 5. `src/app/DeckPage/page.tsx`

### Add case in `getDeckSourceStyle()`:

```diff
         case 'SWUINDEX':
             return styles.SWUIndexTag;
+        case 'PROTECTTHEPOD':
+            return styles.protectThePodTag;
         default:
```

### Add style object (alongside the other tag styles):

```typescript
const protectThePodTag: React.CSSProperties = {
    backgroundColor: '#1a1a2e',
    color: '#00ff88',
    border: '1px solid #00ff88',
    boxShadow: '0 0 5px #00ff88',
};
```

### Add to styles object:

```diff
 const styles: Record<string, React.CSSProperties> = {
     // ... existing styles ...
+    protectThePodTag,
 };
```

---

## PR metadata

**Title:** Add Protect the Pod as a supported deck source

**Body:**
```
## Summary
- Adds [Protect the Pod](https://protectthepod.com) (protectthepod.com) as a deck source
- Protect the Pod is a Star Wars: Unlimited draft and sealed simulator
- Users can paste pool/deck URLs from protectthepod.com to import their limited decks

## Supported URL patterns
- `protectthepod.com/sealed_pool/{shareId}` - Sealed pools
- `protectthepod.com/draft_pool/{shareId}` - Draft pools
- `protectthepod.com/pool/{shareId}/deck` - Direct deck builder links
- `protectthepod.com/formats/pack-wars/{shareId}` - Pack Wars
- `protectthepod.com/formats/pack-blitz/{shareId}` - Pack Blitz
- `protectthepod.com/formats/rotisserie/{shareId}` - Rotisserie Draft

All URLs resolve to the same API endpoint: `protectthepod.com/api/pools/{shareId}/deck.json`

## API format
The endpoint returns standard SWUDB-compatible JSON with `metadata`, `leader`, `secondleader`, `base`, `deck`, and `sideboard` fields.

## Changes
Follows the same pattern as PR #598 (SWUIndex):
1. Added `ProtectThePod` to `DeckSource` enum
2. Added URL detection in `checkJson.ts`
3. Added display name in `constants.ts`
4. Added URL parsing + proxy in `route.ts`
5. Added badge styling in `page.tsx`
```
