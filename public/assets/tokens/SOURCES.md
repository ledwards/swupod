# Token artwork and presentation

The token-set catalogue lives in `src/preferences/token-sets.ts`. Pieces declare their semantic role separately from `presentation`: `on-card` physical counters or `attachment` token cards. Switching sets never changes the Baize object, target UUID, or action. Settings persist locally across games.

- **FFG** (stored earlier as `default-1`): standard token-upgrade cards, original FFG damage counters (1, 5, and 10) and the initiative token. There is no 2 or 3.
- **Gamegenic**: the original Premium Tokens acrylic set, cut from the manufacturer product photograph. Damage is single-sided 1, 5, and 10.
- **Gamegenic Pro** (stored earlier as `default-2`): Premium Tokens PRO photographs. Damage tokens are double-sided, so 1 and 3 are the two faces of one piece, and 5 and 10 are the two faces of the other. The pale studio rim is removed. Advantage stays the standard token card.
- **metalFAB**: product photographs from metalFABtokens. Gold damage is 1 opposite 3, silver damage is 5 opposite 10, and the Jedi/Empire initiative token is shown on both faces. Each coin is masked on its own, so a neighbouring coin does not remain in the frame. The experience image is the +2/+2 face; the reverse is +1/+1.
- **Premier Games**: product photographs of their tournament metal set. Damage is 1 opposite 3 and 5 opposite 10. The white page and the grey contact shadow are removed from each piece.
- **Buy The Same Token** (a previously stored `burger` choice opens this set): double-sided acrylic from their Star Wars Unlimited token set. Damage is 1 opposite 2, 3 opposite 4, and 5 opposite 10.
- Unsupported individual negative power/HP modifiers retain explicit numeric labels rather than borrowing a physical token with a different meaning. Modifier counters summarize current stat deltas; they do not apply additional effects.

## Original sources

FFG damage counters are embedded images extracted from page 5 of the [official quickstart rules](https://images-cdn.fantasyflightgames.com/filer_public/36/f6/36f6e0a5-a7a9-4cbe-8d73-70e61fe6f548/sw_unlimited_quickstart_rules.pdf). PDF image references: 2575 (1), 335 (5), 311 (10). The initiative image source is documented in `../swu-initiative-source.txt`.

White page margins on the FFG initiative and damage extracts are transparent, so the painted octagon and circles are the whole image. Gamegenic Pro pieces are cut out of the product photographs from the [Premium Tokens PRO product gallery](https://www.gamegenic.com/product/star-wars-unlimited-premium-tokens-pro/), and the pale studio rim around each piece is removed:

The original Gamegenic set is cut from the GGS60111 product photograph. metalFAB pieces come from [metalFABtokens](https://metalfabtokens.com/collections/star-wars-unlimited). Premier Games pieces come from their [metal token set](https://premiergames.store/products/metal-token-set). Buy The Same Token pieces come from the [double-sided token set](https://buythesametoken.com/products/token-set-double-sided-for-star-wars-unlimited-tcg) and the matching damage, shield, epic, and modifier product photographs on that shop.

- `gamegenic-front.jpg`: https://www.gamegenic.com/wp-content/uploads/2025/01/GG_SWH_PremiumTokensPRO-0003_cm5pSkHAE.jpg
- `gamegenic-back.jpg`: https://www.gamegenic.com/wp-content/uploads/2025/01/GG_SWH_PremiumTokensPRO-0004_eHJhwUDYE.jpg

Standard (not Hyperspace) token cards, identified using exact-name queries against `https://api.swuapi.com/cards?name=Shield&limit=100` (and Experience / Advantage), with images from the publisher CDN:

- ASH T03 Shield: https://cdn.starwarsunlimited.com/card_08010_T03_EN_Shield_d6ba150c8c.png
- ASH T02 Advantage: https://cdn.starwarsunlimited.com/card_08010_T02_EN_Advantage_a4945d4f67.png
- TS26 T03 Experience: https://cdn.starwarsunlimited.com/card_TS_260100_T3_EN_Experience_d581af74c5.png
- HMW T01 Shield: https://cdn.starwarsunlimited.com/card_09010_T01_EN_Shield_524883ece2.png

Latest released standard printing is selected from the explicit catalogue; future previews do not replace released art. This catalogue needs updating when new printings arrive. ASH release: July 17, 2026 ([Asmodee](https://www.asmodee.co.uk/pages/star-wars-unlimited)); TS26: May 8, 2026 ([publisher](https://starwarsunlimited.com/products/2026-twin-suns)); HMW: October 9, 2026 ([publisher](https://starwarsunlimited.com/products/set-9-homeworlds)).

## October 2026 display cleanup

Selected original token faces were individually cleaned with imagegen to repair
clipped rims, remove studio-background remnants, and clarify ghosted face printing.
The source PNG photographs above remain unchanged for reference. Corresponding
WebP files are edited application display assets, not new product photographs.
`src/preferences/token-art-bounds.json` records their canvas dimensions and display
bounds so transparent safety margins do not change their apparent size.

See `docs/audits/2026-10-03-token-art.md` for the per-face review ledger and the
unrepaired Premier Hidden exception. The printed values and catalog semantics
are preserved.

## LaserGaming

LaserGaming is available as its own saved token-set choice. Manufacturer references:
[SWU token set](https://lasergamingshop.com/product/star-wars-unlimited-token-set/)
and [token catalogue](https://lasergamingshop.com/card-games/star-wars-unlimited/swu-tokens/).
The shipped selection includes 1/3 and 5/10 damage faces, XP +1/+1 through +4/+4,
paired modifiers ±1 through ±4, separate red Power and blue HP modifiers ±1 through
±4, Initiative, Shield, Epic Action, and Sentinel/reminder pieces. Advantage uses
the standard released token card; no LaserGaming Advantage product is claimed.

The untouched reference photos are in `lasergaming-source/`. Their source URLs are:

- `https://lasergamingshop.com/wp-content/uploads/2024/02/Damage-set-dbl-sided.jpg`
- `https://lasergamingshop.com/wp-content/uploads/2024/02/SWU-XP-Mods-XP2.jpg`
- `https://lasergamingshop.com/wp-content/uploads/2024/02/SWU-Standard-Token-Set.jpg`
- `https://lasergamingshop.com/wp-content/uploads/2024/07/SWU-Modifiers-Double-Black-Double-Sided.jpg`

The application WebPs are isolated, straightened imagegen derivatives of those
photos, not unmodified manufacturer photography. The original shield retains its
centred honeycomb; the aggregate shield moves that motif up to make room for a
count. Numerals are rendered over blank faces: `printed` represents only the
manufacturer's fixed denominations in real-token mode, while `aggregate` displays
engine totals. Those are separate fields so individual target selection and stack
behaviour remain unchanged. Power is red, HP blue; negative paired faces are black.

## Weakness — Homeworlds T02

Official token-card art: https://cdn.starwarsunlimited.com//SWH_09_Article_First_Look_Weakness_EN_Token_Upgrade_5a4fa91ad6.png

Weakness is a distinct token upgrade, never a generic negative-stat counter. Sets without a dedicated Weakness piece fall back to this card. Grouped mode retains the card with a quantity badge.

## Selectable token-card printings

The separate **Token cards** catalog is generated from SWUAPI in
`src/data/token-cards.json` using `node scripts/sync-token-cards.mjs`. It includes
all returned Token Upgrade, Token Unit, and Credit Token printings, with SWUAPI
UUIDs, printing labels, official image URLs, text, and rulings. As of 2026-10-03:
68 printings across 12 kinds, including Gamegenic Hyperspace Foil and Galactic
Championship promos. No synthetic printing variants are added. Existing local
standard Shield, Experience, Advantage, and Weakness images remain the defaults.
Artwork preferences never change token identity, stats, or gameplay rules.
