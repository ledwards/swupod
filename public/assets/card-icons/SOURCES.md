# SWU card presentation icons

Original cost, power, HP and six aspect PNGs copied without modification from
`wayfinder-ios/WayfinderIOS/Assets.xcassets/Aspect{Cost,Power,Hp,Vigilance,Command,Aggression,Cunning,Heroism,Villainy}Icon.imageset/`.

Number placement follows `CardDetailView.swift`'s centered Barlow-Bold overlay
and Wayfinder web `CardIcons.tsx`'s smaller two-digit cost treatment. Icons remain
separate from values; card metadata comes from PTP's standard-printing catalogue.
Refresh it with `node scripts/sync-card-presentation.mjs /path/to/PTP/src/data/cards.json`.

Cinematic arena faces show printed attack and printed maximum HP, never remaining
HP. Damage and current stat deltas are separate counters. Hands, attachments,
command cards and full-card mode retain their normal image presentation.

Exhaust and unique symbols are copied from Wayfinder iOS GameTextExhaustIcon and GameTextUniqueIcon image sets. Rules formatting follows GameTextInlineIconRenderer.swift.
