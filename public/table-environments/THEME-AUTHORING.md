# Responsive table artwork

## Required rendering contract

Fill the available scene with proportional `cover`, followed by uniform zoom. Never use `object-fit: fill`, two-axis percentage background sizing, or unequal X/Y scales. Circles, insignias, checker squares, bolts, and recognizable objects must keep their proportions. The portable theme validator rejects unequal scales.

The scene is clipped independently from gameplay. Resizing must not pan the art, add scrollbars, or change card hitboxes. Play, replay, theme previews, and galleries share `table-environments.css`. Keep the background on a dedicated positioned element, not a pseudo-element behind interactive children that would cover them.

Existing JSON uses `background.framing`: equal `scaleX` and `scaleY` are the uniform zoom, and `originX`/`originY` set the CSS percentage focal position. Keep the manifest and theme config synchronized. A zoom of 1 is uncropped cover. Increase it only to remove unwanted room around the tabletop. A focal position near the measured tabletop center is the starting point, not a substitute for visual review.

## Creating artwork

- Use an overhead camera and a large, quiet central playing surface.
- Make the center recognizable through material, lighting, and color. Edge ornaments alone cannot carry a theme's identity in narrow crops.
- Leave generous expendable space around important objects. Do not place essential logos, text, or character faces at the edges.
- The raster image is scenery, not the layout. Arena outlines, player-area borders, labels, and interaction states belong in responsive UI.
- If a decorative frame must remain visible, deliver separate corners and repeatable edge strips (nine-slice assets). Preserve corner proportions; repeat textures along edges instead of stretching emblems. Do not bake a required complete frame into the background.
- Repeating surfaces must actually be seamless. Never tile a complete table scene.
- If one composition cannot preserve important subject matter in both portrait and landscape, supply alternate compositions and add an explicit container-aspect-ratio selection rule. Do not compensate with distortion. The current 31 themes use a single crop-safe surface; alternate artwork is not currently required by the renderer.

## Review of the current collection

All 31 originals were reviewed, then checked in wide, square, and tall crops. All use uniform cover; no original artwork was rewritten.

| Artwork | Crop behavior |
| --- | --- |
| Imperial, Dejarik, Petranaki | Keep circular markings/checker geometry proportional. Side portions can crop. |
| Hoth, Endor, Kashyyyk, Tatooine, Jedi Temple, Geonosis Droid Factory, Jabba's Palace, Jabba's Sail Barge, Moisture Farm, Sandcrawler, Tusken Camp, Millennium Falcon | Material and lighting carry the theme through center crops. Peripheral props may disappear. |
| Massassi, X-Wing, TIE Fighter, Republic Senate, Imperial Senate, ISB, Canto Bight, Vader's Castle, Mustafar Command, Naboo N-1 | Controls, badges, and painted borders are scenery. UI frames remain independent; do not force the photographed rim to match the screen. |
| Purrgil, Sith Wayfinder, Jedi Holocron, Mandalore, Fall of Mandalore, Hyperspace | Keep patterns, tendrils, cracks, and light trails proportional. Narrow crops favor the central material; edge embellishments are expendable. |

## Acceptance checks for every new theme

1. Update the config and manifest together; preserve source dimensions and checksum.
2. Verify uniform zoom and focal position in `2:1`, `1:1`, and `1:2` containers, plus very wide `3:1` and narrow `1:3` crops.
3. Inspect the actual game at desktop and phone sizes, with the side panel open. No exposed empty background or distorted circles; no scroll/panning introduced.
4. Check readable cards, labels, targeting highlights, and dialogs over the brightest and darkest parts of the image.
5. Check theme previews use the same rendering contract.
6. Run `npm run build`, `npx tsx --test tests/preferences/themes.test.ts`, and `npx tsx scripts/verify-responsive-themes.ts`. Save a contact sheet when the composition changes and visually review it.

Cropping is intentional. Never promise that arbitrary aspect ratios preserve the entire original composition while also filling every pixel.

## Extended scenery (implemented first for Imperial)

`background.layout.tableBounds` is the original source's outer physical-table rectangle, in pixels as `{x,y,width,height}`. `background.layout.scenery` names the separately extended image, its actual decoded dimensions, and a corresponding registration rectangle. Gameplay scales both images uniformly and overlays the original protected table. Extra scenery fills the area under the viewport-bottom hand and behind the sidebar. Never stretch the original to fill the page.

Use background extension/outpainting, preserving original table pixels. Measure playable insets separately before changing zone placement. Check the original-table/scenery join and reject visible seams or mismatched rims. The first implementation is enabled at >=1000px wide and >=600px high; smaller layouts retain their existing fitting pending an approved portrait composition. New themes may omit `layout` until their extension is ready. Do not fabricate an extension or copy Imperial scenery into another theme.

The original and extended image dimensions may differ from generation requests: record decoded output dimensions. Validate bounds are finite, positive and contained in their source canvas. Preserve this optional metadata when regenerating theme configurations.

For local interaction testing, run `npm run build` then `npx tsx scripts/artwork-sandbox.ts` with the local gateway on 4397. Open http://127.0.0.1:4400 in Safari. The loopback-only sandbox uses the built application and sample decisions, never real game actions. Confirming two resources reaches turn controls; Pass starts the sample resource decision again. Themes/settings use this origin's isolated browser storage.

### Opponent scenery and centered narrow views

The Imperial surroundings now include an upper extension (`table-imperial-surroundings.png`). The opponent resource/hand/deck shelf is positioned above the physical table. Reserve this upper band before fitting the table, and center the table in the remaining gameplay allocation. The own hand remains anchored to the viewport bottom.

This supersedes the earlier desktop-only threshold: extended themes now support narrow viewports. In tall/narrow allocations, scale the artwork uniformly to the available table height and center its original table bounds horizontally. The viewport may clip the *physical table's peripheral edges* as well as scenery; never distort the circles/rim, and never clip interactive gameplay zones along with the art. The gameplay grid fits the visible allocation independently. The sidebar stays to the right on desktop; at <=760px it opens from the right via the game-panel button. Prompts/actions remain visible above the hand while that panel is closed. No vertical or horizontal document scrolling is allowed.

Author substantial scenery ABOVE as well as below and right. Preserve table pixels as a separate source layer; source registration is still required after outpainting. New backgrounds must pass both full-table desktop fit and centered, cropped narrow-camera checks. Current automated checks cover 1920×1080, 1366×768, 820×1180, 390×844 and 844×390, including resizing back to desktop and opening/closing the right panel.
