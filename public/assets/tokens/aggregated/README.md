# Aggregated token faces

Blank variants of the existing token artwork, edited with imagegen to remove
printed quantities. Original token assets remain unchanged. These are application
display variants, not images of additional products sold by the token makers.

`TokenArt.tsx` crops each face from these atlases and prints the current quantity
or paired stat totals on it. `aggregate-tokens.ts` defines placement and color per
set. Token upgrade stats come from the engine token catalog.

- damage: FFG, Gamegenic, Gamegenic Pro, metalFAB, Premier Games
- experience: Gamegenic, Gamegenic Pro, Premier Games (old metalFAB cell unused)
- metalfab-experience: complete symmetrical paired green face
- modifier: Gamegenic, Gamegenic Pro, Premier Games
- btst: damage, experience, modifier
- shield: Gamegenic, Gamegenic Pro, metalFAB, Premier Games, Buy The Same Token
- cards: experience, shield, advantage

Sets without a particular token use the existing fallback set or token card.
Weakness uses the set's paired modifier face with negative catalog totals.

Settings → Tokens switches between Real tokens (default) and Aggregated tokens.
The choice persists through the shared preference cookie/local storage. Aggregation
changes presentation only: individually selectable token upgrades separate during
target selection and retain their original engine IDs.

October cleanup: standalone `btst-experience.webp`, `btst-modifier.webp`,
`premier-modifier.webp`, and `premier-shield.webp` replace their old atlas cells.
They remove ghost lines/marks and restore complete rims. Their display bounds
are in `src/preferences/token-art-bounds.json`. Unused atlas cells are retained
as source history and are not rendered.

LaserGaming standalone WebPs use bounds in `src/preferences/token-art-bounds.json`.
Damage, experience, positive/negative paired modifiers, and red/blue single-stat
blanks are shared with fixed-denomination printing. The shield blank reserves its
lower centre for a total. Original shield artwork is `../lg-shield-original.webp`.
