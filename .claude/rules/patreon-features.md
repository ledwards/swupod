---
paths:
  - "src/utils/patreonFeatures.ts"
  - "src/components/PatreonFeaturesBox.tsx"
  - "src/components/PatreonFeaturesBox.css"
  - "src/components/About.tsx"
  - "src/components/SubscribeModal.tsx"
---

# Patreon / Friends of the Pod Features

## Single source of truth

The canonical list of Friends-of-the-Pod (Patreon supporter) features lives in
**`src/utils/patreonFeatures.ts`** (`PATREON_FEATURES`). It is rendered by:

- `src/components/PatreonFeaturesBox.tsx` — the gold "Special Features" expander
  on the Support the Pod page (`/support-the-pod`, via `About.tsx`).
- `src/components/SubscribeModal.tsx` — the conversion-modal benefits list.

## THE RULE (do this every time)

**Whenever you add, remove, or rename a Friends-of-the-Pod / patron-gated
feature, you MUST update `PATREON_FEATURES` in `src/utils/patreonFeatures.ts` in
the same change.**

A "patron-gated feature" is anything gated on `isPatron` / `user.is_patron` (or
shown only to Friends of the Pod — e.g. gold-styled, supporter-only controls). If
you write a new gate, add the matching entry (title + one-line, benefit-led
prose) to the canonical list. The Special Features box and the Subscribe modal
update automatically — there is nothing else to touch.

**Never hard-code a patron-feature list in a component.** If you find one,
replace it with a render over `PATREON_FEATURES`. (Exception: `app/beta/page.tsx`
intentionally lists only the two beta-specific perks, not the full set.)

## Prose style

- Lead with the benefit, present tense, one sentence.
- `title` is the short feature name (e.g. "Spectator Mode").
- Keep it punchy — this is marketing copy on a conversion surface.
