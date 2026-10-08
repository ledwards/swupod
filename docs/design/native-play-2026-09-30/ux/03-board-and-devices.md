# Board composition, devices, and presentation

## Spatial defaults

Use the inspected Karabast orientation: **space left, leaders/bases and prompt in the center, ground right; opponent above, you below**. The existing visual study originally put ground left; that artistic layout is not the compatibility reference. The interaction lab corrects the orientation. Keep the optional player-area leader/base arrangement, but make the central arrangement the proposed first-run default. A saved explicit preference should survive the default change.

Draw and discard remain adjacent inside each player's area in every layout. Do not relocate them into a global sidebar. Keep arena and player orientation stable during targeting, animation, and reconnect. Leader deployment changes its zone; it must not make the whole board swap sides.

## Tradeoffs by surface

| Surface | Default / rationale | Alternative / cost |
|---|---|---|
| Leader/base layout | Central: familiarity and shorter distance to either arena | Player area: more continuous arena space, but different scan pattern |
| Decision controls | Central on desktop, reachable bottom dock on narrow phone | Wide-screen side rail: longer target-to-decision travel, less central congestion |
| Hand | Full cards, expand on demand; retain count when collapsed | Permanent large fan feels tactile but obscures the battlefield |
| Ground/space density | Stable wrapping rows, controlled spacing, readable counts | Indefinite shrinking makes the board fit but destroys hit targets |
| Crowded phone arena | Summary/count for both arenas plus expandable full-size actionable list | Single-arena focus is viable only if the other arena's state stays visible |
| Cinematic units | Optional real-art crop with name, current stats, state badges | Full faces aid recognition but printed stats can differ from current state |
| Base health | Clearly label damage and capacity; consistent convention | Remaining health is valid if explicitly labelled; do not silently mix them |
| Unit damage | Show current effective stats and damage with text/shape redundancy | Tiny counters atop printed numbers create ambiguous health interpretations |
| Exhaustion | Clear EXHAUSTED label plus restrained rotation/dimming | Rotation alone loses meaning with perspective and can reduce hit accuracy |
| Attachments/captures | Visible count and expandable individually inspectable list | Fully fanned attachments preserve tabletop feel but consume too much room |
| Inspection | Temporary preview + explicit full-face inspector | Pinned panel supports repeated reading but takes board width |
| History | Collapsible chronological public log with card references | Permanent rail aids recall but competes with the decision panel |
| Social | Existing mute/block/report path; chat collapsed on phone | Emotes/chat must not obscure the prompt; friend graph is outside launch scope |
| Settings | Controls, appearance, accessibility groups; restore defaults | An undifferentiated list makes important interaction preferences hard to find |

## Phone, tablet, and hybrid input

Phone portrait must support the complete loop. A hand sheet and decision dock can temporarily cover some board space, but selection must expose relevant targets and keep both arena summaries visible. Landscape is an option, not a requirement. A browser keyboard, safe-area inset, or address bar change must not hide Confirm/Cancel.

On iPad, choose layout by available width, not by device name; support mouse/trackpad and touch in the same session. Input-specific behavior should follow the current pointer event and capability, not a one-time “mobile” guess. The lab offers mouse/pen dragging directly on the card; touch retains tap, scroll, and hold-to-inspect. No persistent drag handles. A future touch drag gesture must avoid scroll/inspection conflict and preserve the same click budget; it is not implemented or validated here.

Aim for 44 CSS-pixel primary touch controls as a PTP design target. WCAG 2.2's AA minimum is 24 CSS pixels with specified exceptions; 44 is not that AA minimum. Use a full-size target list where dense cards cannot maintain usable spacing. Do not add a row of inspection controls below the cards. Keyboard inspection and pointer gestures preserve reading access without board clutter. [W3]

## Inspection options

**Popover:** quick repeated reading, spatially attached to the source; can cover a target. Keep it dismissible and accessible when hovered/focused, suppress accidental previews during a drag, and never dismiss it before the user can read it. [W4]

**Pinned side inspector:** best for desktop comparison and attachments; prevents covering the board, but forces smaller arenas. Do not automatically pin on first hover. Right-click or the keyboard inspection shortcut pins it; Close returns the space.

**Touch dialog/sheet:** clear, readable full card with Close; requires a round trip but avoids tiny reading. Keep the selection intact when closing. Long press opens inspection; explain it once in control help rather than adding an Inspect button under every card. A leader flip here changes the preview only.

## What must never disappear into the artwork

Current decision and acting player; both arena identities/counts; initiative owner versus whether it has been claimed this round; leader deployment/usage; resources available/total; base damage; legal and selected states; attachments/status effects; connection status. Cosmetic lights cannot resemble a legal-target highlight. Neutral card rendering must not reveal hidden identity through aspect color, crop, accessibility name, URL preloads, or face-down dimensions.

Only seat-visible cards belong in the client. Your resources may need an owner-only inspection interface where allowed; the opponent sees permitted counts/backs, not identities. Discard inspection is distinct from browsing a hidden draw deck. Public logs and copyable diagnostics must respect the same visibility boundary.

## Physicality, motion, and sound

Use static material surfaces plus DOM/CSS card layers first. WebGL is an option if measured needs justify it, not a prerequisite for this look. Real full cards remain the source for inspection; cinematic presentation uses calibrated art regions and live canonical state overlays, not generated card text.

Proposed motion budget: brief lift on selection, source-to-destination movement, and impact/defeat acknowledgement. Let authoritative prompts become usable when ready; decorative effects must not keep the player waiting. Reduced motion removes travel/shake while preserving state changes. Sound mirrors visible events and has separate volume/mute; no required information is sound-only. These timings and performance targets require measurement on actual devices.

Compress and lazy-load table art; keep a stable fallback if it fails. All six environments must pass the same contrast and target-recognition checks. Hoth's bright surface and Imperial red lighting are useful stress cases. Do not let a cosmetic choice change action latency, available controls, or game information.

## Sources

- **W3:** W3C, [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- **W4:** W3C, [Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).
