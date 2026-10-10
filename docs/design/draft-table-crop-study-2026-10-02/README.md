# Draft table crop study

[Open the study](index.html) (serve this folder over HTTP, e.g. `python3 -m http.server`, since it fetches `draft-captures/manifest.json`).

Captures of the actual draft components with isolated fixture data, testing one full-bleed table image behind the whole draft viewport for the Imperial Holotable, Hoth Ice Table and Canto Bight Casino themes at six viewports (2560x1440 to 390x844). `draft-protected-table.css` is the study-only override the capture loads; the live draft is unchanged. Regenerate with `CAPTURE_DRAFT_STUDY=1 npx playwright test --config playwright.draft-table.config.ts -g "capture protected draft table study"`. Kept under docs/ so it is not served in production.
