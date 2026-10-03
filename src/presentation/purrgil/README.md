# Purrgil table presentation snapshot

Purrgil owns these table designs. `theme-contract.ts` is copied from its game
client with a non-null assertion for PTP's stricter indexed-access checking.
`themes.json` preserves its 31 theme configs, approved framing
and accessible palettes. The artwork under `public/table-environments` is WebP
encoded from the originals; each entry records both original and optimized
SHA-256. Only the selected artwork is requested by the draft page.

PTP also offers **Default**, the original draft appearance without Purrgil artwork
or theme overrides. It is selected when no preference is saved; existing saved
table choices are retained. This option is local to PTP, not an extra imported
Purrgil environment.

Refresh from a reviewed Purrgil checkout:

```sh
node scripts/presentation/import-purrgil.mjs /path/to/purrgil
```

PTP builds independently of Purrgil. The snapshot follows the portable version-1
theme schema and Purrgil's version-3 catalog. Preferences use `purrgil-table-v1`
and preserve other settings; browser storage is origin-local, so this does not
claim preference synchronization with a separately hosted game client.

Draft presentation uses the same `PTP_NATIVE_PLAY_ENABLED` flag,
`localPracticeEnabled()` switch and fresh
`requireBetaAccess()` authorization as the current solo AI rollout. No separate
public presentation flag exists. Engine readiness and deck support do not decide
table visibility. Missing artwork leaves the palette's plain canvas usable.

Draft scenes now cover the complete viewport with uniform image scaling. No gameplay sidebar width is reserved. Imported `background.layout` metadata and scenery are retained when supplied (currently Imperial); the table and extended scenery are aligned by their table bounds. Other themes use proportional cover cropping. Draft seats are not repositioned by the artwork component.
