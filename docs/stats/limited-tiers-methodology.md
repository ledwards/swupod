# Limited tiers

Pick grades come from human draft contests: Bradley–Terry within aspect for cards, Plackett–Luce for leaders. A set without a file in `src/data/pickPreferences/` has no pick grade.

Performance grades come from Wayfinder limited games in one environment. A side counts for a set only when that set is at least 80% of its copies and it has at least 10 copies, and every side in the game agrees. Letters need 50 exposures, 30 games, 10 players, and 10 builds, and stay provisional until clustered resampling keeps 80% of replicates within one letter. Interactive requests do not resample.

The active rating is whatever `src/data/activeLimitedRatings.json` marks `published` for that set. Anything else leaves the previous bot lookup in place: live average pick position, then the name-only ranking, then rarity. A published score is per name and subtitle.

Held-out publication requires the candidate's clustered 95% log-loss interval against the training base rate to lie entirely below zero, calibration not worse by more than 0.02, and at least 30 test sides. Crossing zero is inconclusive. Fewer than 30 sides is insufficient. A different letter is not evidence the rating predicts better.
