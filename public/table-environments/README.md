# Star Wars table environments

31 original generated table artworks: the original nine approved designs, Purrgil Passage, and 21 additional requested settings. Owned by the Purrgil game client. The play client, replay and browser harness apply the selected config from this package: one framed background plus its opaque color roles.

## Preview and integration

Serve `/table-environments/` for the gallery. `manifest.json` records each image, SHA-256, dimensions, measured outer table bounds, and its display framing. Use the supplied CSS and framing together; the unframed PNG includes more room than the approved presentation.

For backgrounds, apply `.table-environment` on a positioned, artwork-only element and set `--table-art`, `--table-scale-x`, `--table-origin-x`, and `--table-origin-y` from the config. The background uses proportional `cover` and a **uniform** zoom. Both `scaleX` and `scaleY` are retained in JSON for compatibility but must be equal; validation rejects unequal axes. Previews use the same crop rule.

The October 2 responsive pass replaces the old independent-axis framing. Each theme uses the larger previous crop factor as a uniform zoom, with the focal position derived from its measured tabletop center. Original PNGs and checksums remain unchanged. Narrow views crop the sides; wide views crop the top and bottom. Decorative image rims may leave the crop; the real UI frame still bounds the playing area. See [theme authoring rules](THEME-AUTHORING.md) before adding or revising a theme.

Use one scene behind the whole game. Do not repeat a complete table image inside individual arenas, shelves, or sidebars. Cards and controls remain real UI above the artwork. Tables use a perpendicular overhead camera and large rectangular play surfaces; Imperial and Dejarik hint at roundness without becoming circles. Each setting has distinct material, construction and lighting.

## Themes

- FFG (Protect the Pod's page background, listed first; Purrgil Passage stays the default)
- Purrgil Passage
- Imperial Holotable
- Dejarik Holotable
- Hoth Ice Table
- Endor Woodland Table
- Kashyyyk Treetop Table
- Tatooine Sand Table
- Massassi Base
- X-Wing Cockpit
- TIE Fighter Cockpit
- Sith Wayfinder
- Jedi Holocron
- Jedi Temple
- Republic Senate
- Imperial Senate
- Imperial Security Bureau
- Canto Bight Casino
- Petranaki Arena
- Vader’s Castle
- Mustafar Separatist Command
- Geonosis Droid Factory
- Jabba’s Palace
- Jabba’s Sail Barge
- Tatooine Moisture Farm
- Jawa Sandcrawler
- Tusken Camp
- Mandalore
- Fall of Mandalore
- Hyperspace Jump
- Millennium Falcon
- Naboo N-1 Cockpit

## References and verification

Imperial reference: https://swccgdb.com/card/02111
Massassi reference: Leia Organa, Alliance General, SOR #260 showcase, https://www.swu-db.com/card/SOR/260
Reference card images are not included. Artwork was generated for this study.

The expanded collection is checked in Chromium and Firefox at 390, 768 and 1600 pixels: artwork loading, selection, no horizontal overflow, reload and cross-page preference persistence, and gallery completeness. See `validation.json`. The interactive prototype additionally retains existing draft, deck-builder and board interaction checks.

Optimize PNGs through the application's image pipeline during production integration, preserving the manifest framing.

## Theme configs and color contract

`themes/{id}.json` is the portable theme config for each of the 31 artworks; discover it via the manifest's `config` field. Image URLs resolve from the app origin (`/table-environments/`), never from the JSON directory. Each config includes original dimensions, checksum and approved crop. `palettes.html` previews colors on actual text and controls beside each background. `theme-config.mjs` exports `applyTheme(element, config)` to install CSS variables on a theme root. The play client validates each config and applies the same variables. Load `table-environments.css` for artwork framing.

Roles extracted from `docs/design/native-play-2026-09-30/real-board.css`, `table-materials.css`, `table-options.css`, `workshop.css`, and the repository style guide:

| Role | Mock/app use |
| --- | --- |
| canvas | Page backdrop |
| surface / surfaceRaised / surfaceHover | Shelves, action rail, dialogs, inputs, secondary controls and hover |
| text / textMuted | Existing `--ink` / `--muted`: body copy and secondary labels |
| accent / accentHover / onAccent | Existing `--mint`: primary action, selected states, links, contrasting button label |
| highlight | Existing `--gold`: round, initiative, resource emphasis |
| border / focus | Necessary control boundaries / keyboard focus |
| success / warning / danger / info | Stable gameplay meanings across all themes |

These are art-directed palettes inspired by each artwork's materials and lighting, adjusted for contrast rather than raw dominant-pixel extraction. Shared status colors preserve meaning; do not recolor card artwork, aspect identities, or team/player identity with decorative theme accents. `applyTheme` also supplies the four old mock aliases (`--ink`, `--muted`, `--mint`, `--gold`). The play client sets the same variables from `src/preferences/theme-contract.ts` and uses the semantic roles for text-bearing chrome. Card artwork is not recolored.

### Legibility requirements

All text-bearing panels and labels MUST use opaque `surface`, `surfaceRaised`, or `surfaceHover` backgrounds. Do not apply opacity to a panel or place text directly on the image. Leave artwork visible in the non-text play area. All body/muted/accent/highlight/status text passes 4.5:1 against every supplied surface and canvas. Primary button text uses `onAccent`, including hover. Borders and focus rings pass 3:1 against those surfaces. Use a 3px ring with 3px offset so it sits against the surface, not the button fill. Use a surface-backed container for controls over art. Do not dim disabled text with opacity; use muted text and native disabled behavior. Statuses and selections need text, icons, or shape as well as color. These contrast guarantees do not cover arbitrary alpha overlays, gradients, or colors substituted by consumers.

Use the mocks' Barlow typeface but keep production body/control text at least 14px and secondary labels at least 12px, with 1.4 or greater line-height. Do not inherit the prototype's tiny 6–10px board labels into production.

Run `node public/table-environments/verify-themes.mjs`. It checks all config roles, image checksums, crop parity, and 1,302 text/control contrast pairs. Results are in `palette-validation.json`. Browser validation of the palette gallery supplements these numerical checks; production components must preserve this color-pair contract.
