# Deck Image Consolidation Plan

**Goal:** Collapse the four divergent client-side deck-image canvas implementations into
one shared, pure renderer so a single change (e.g. the QR code) lands everywhere at once.

**Status:** Implemented (client-side). Shared renderer is `src/services/deckImage/`; the
hook, play page, and both pod pages now call it. Server/swuapi path untouched (see §7).
**Scope:** Client-side canvas only. The server/swuapi path is intentionally left alone (see §7).

---

## 1. Problem

"Deck Image" (the canvas PNG: hero art → leader+base → 8-col card grid → grayscale
sideboard → footer) is rendered by **four separate copies** of essentially the same code.
They have drifted. The most recent batch of improvements landed in only one of them:

| Surface | Route | Code | QR? | Footer |
|---|---|---|---|---|
| **DeckBuilder** (canonical) | `/pool/[shareId]/deck`, `/deck/[buildId]`, `/deckbuilder/build` | [`useDeckExport`](../src/hooks/useDeckExport.ts) hook | ✅ | logomark + URL + QR |
| **Play page** | `/pool/[shareId]/deck/play` | inline, ~990 lines ([play/page.tsx:698](../app/pool/[shareId]/deck/play/page.tsx), [:1190](../app/pool/[shareId]/deck/play/page.tsx)) | ❌ | "Created by Protect the Pod on {date}" |
| **Draft pod** | `/draft/[shareId]/pod` | inline ×2 (own + opponent) ([:386](../app/draft/[shareId]/pod/page.tsx), [:633](../app/draft/[shareId]/pod/page.tsx)) | ❌ | minimal |
| **Sealed pod** | `/sealed/[shareId]/pod` | inline ([:418](../app/sealed/[shareId]/pod/page.tsx)) | ❌ | minimal |

The QR code (and Barlow font, qty badges, full-color sideboard, site texture, footer
logomark/URL) were added in the hook across commits `89ce8de`, `fb055b1`, `fe22a11`,
`2ac43d5`, `159b701`, `d355dc2`. None reached the inline copies because they are literally
different code. Every future change has the same problem.

## 2. Why this is tractable

All four copies start from the **same source shape** and run the **same derivation**:

```ts
const leaderCard   = cardPositions[activeLeader]?.card
const baseCard     = cardPositions[activeBase]?.card
const deckCards     = Object.values(cardPositions).filter(p => p.section === 'deck' && p.visible && !p.card.isLeader && !p.card.isBase)
const sideboardCards = Object.values(cardPositions).filter(p => p.section === 'sideboard' && ...)
```

This is exactly `buildDeckData()` in [useDeckExport.ts:142](../src/hooks/useDeckExport.ts).
So the per-page "adapter" is trivial — every call site already has
`cardPositions` + `activeLeader` + `activeBase` + `setCode`.

The only structural wrinkle: the **pod pages render opponent decks** via
`viewPlayerDeck(playerId)` ([draft pod:633](../app/draft/[shareId]/pod/page.tsx)). That is
just a *different* `cardPositions` source — it still fits the same contract.

## 3. Target architecture

A pure rendering service under `src/services/deckImage/` (per
`.claude/rules/architecture.md`: services are pure, no React/I/O, files <200 lines — so
split into cohesive modules rather than one 700-line file). The hook and all three pages
become thin callers.

```
src/services/deckImage/
  index.ts            // public API: renderDeckImage(input, options) -> Promise<Blob>
  buildRenderModel.ts // PURE: cardPositions -> normalized model (leader/base/deck/sideboard + counts + normal-variant art). Lifts buildDeckData + normalFrontArt.
  layout.ts           // PURE: constants — card sizes, spacing, columns, fonts, colors
  background.ts       // hero banner + tiled set texture / grid fallback
  cardGrid.ts         // 8-col grid, count/qty badges, grayscale pass
  footer.ts           // owner + timestamp + logomark + URL + QR (the canonical footer)
  imageLoading.ts     // CORS-safe loaders, 5s timeout, grayscale pixel pass, placeholders
  renderDeckImage.test.ts
  buildRenderModel.test.ts
```

### Contract

```ts
// Input: the raw deck-builder shape every surface already has.
interface DeckImageInput {
  cardPositions: CardPositionsMap          // Record<string, { section, visible, enabled?, card }>
  activeLeader: string | null
  activeBase: string | null
  allSetCards: ExportCard[]                // for leader/base id filtering
  setCode: string                          // builds the variant-normalization map internally
}

interface DeckImageOptions {
  variant: 'deck' | 'pool'                 // deck = leader+base+deck(+sideboard); pool = full pool view
  poolType: 'draft' | 'sealed'             // drives sideboard label ("Sideboard" vs "Pool") + grayscale
  poolName: string | null
  ownerUsername: string | null
  shareId?: string | null
  rootShareId?: string | null             // -> footer URL + QR target (root pool when this is a build)
  showQR?: boolean                         // default: true when a share URL is resolvable
}

// Public entry point. Returns a PNG blob; callers make the object URL + modal.
export async function renderDeckImage(input: DeckImageInput, options: DeckImageOptions): Promise<Blob>
```

Notes:
- `renderDeckImage` builds the `baseCardMap` from `setCode` internally (via
  `buildBaseCardMap`) — callers don't pass it.
- The renderer owns the canvas; callers own object-URL lifecycle + modal state (unchanged).
- `variant: 'pool'` reproduces today's `exportPoolImage` (grouped qty badges, other
  leaders/bases, sealed "Pool" grayscale). `variant: 'deck'` reproduces `exportDeckImage`.

## 4. Reconciliation decisions (the images WILL change)

Consolidating means the pod/play images adopt the canonical look. These are the
intentional visual changes — call out in the PR:

1. **Footer → canonical.** Play + pod pages drop their ad-hoc footers and gain the
   logomark + pool URL + **QR code**. (This is the whole point.)
2. **QR target.** `https://{rootShareId || shareId}` pool URL, same as the hook
   ([useDeckExport.ts:121](../src/hooks/useDeckExport.ts), [:1124](../src/hooks/useDeckExport.ts)).
   Pod pages: QR points at the player's pool/share if one exists, else `showQR: false`.
3. **Card/leader sizing.** Pod pages currently use 525×375 leader+base
   ([draft pod:427](../app/draft/[shareId]/pod/page.tsx)); standardize on the hook's
   geometry from `layout.ts`. Minor visual shift.
4. **Fonts/badges/texture.** Pod pages gain Barlow, qty badges, set-art background.
5. **Per `architecture.md`:** "if rewriting a page, preserve its feature set — don't add
   new ones." We are *adding* QR/branding to pod+play. Treat as a deliberate, reviewed
   unification, not scope creep — flag it explicitly for sign-off.

Open question for review: should pod **opponent** deck images carry the QR/branding, or
stay minimal? (Default: same treatment as own deck.)

## 5. Test strategy ("Test Before Refactor")

Per `.claude/rules/architecture.md` rule 5 — characterize before changing.

1. **Pure model (high value, easy):** `buildRenderModel.test.ts` — given a fixed
   `cardPositions` fixture, assert leader/base/deck/sideboard ids + counts, variant
   normalization (foil → normal), and leader/base exclusion. This locks the logic that's
   currently duplicated four times. Mirror existing pure-service tests in `src/services/`.
2. **Render emission (canvas mock):** `renderDeckImage.test.ts` — pass a stub
   `CanvasRenderingContext2D`, assert the *contract*, not pixels:
   - footer text "built on Protect the Pod" is drawn,
   - a QR image is drawn when `shareId` present and not when `showQR:false`,
   - grayscale pass runs for sealed pool / sideboard,
   - deck card count matches model.
3. **Acceptance (manual visual gate):** before/after PNG screenshots of all four surfaces
   (deckbuilder, play, draft pod own + opponent, sealed pod). The deckbuilder image must be
   pixel-identical (it's the source of truth); the other three are expected to change to
   match it.
4. Run `npm run build`, `npm run lint`, `npm run test` (full unit suite must stay green).

## 6. Sequenced steps

Each step is independently shippable/reviewable; the deckbuilder image is the invariant.

1. **Lock behavior** — write `buildRenderModel.test.ts` against the *current* hook output.
2. **Create the service** — port the canonical canvas code out of `useDeckExport.ts` into
   `src/services/deckImage/*`, fully typed (the hook is `@ts-nocheck`; new code is not).
3. **Rewire the hook** — `useDeckExport.exportDeckImage/exportPoolImage` become thin
   adapters that build `DeckImageInput`/`DeckImageOptions` and call `renderDeckImage`. Hook
   public API (`UseDeckExportReturn`) is unchanged. Verify deckbuilder image unchanged.
4. **Rewire play page** — replace the inline `exportDeckImage`/`exportPoolImage`
   (~990 lines, [play:698](../app/pool/[shareId]/deck/play/page.tsx)) with calls to the
   service. Delete the dead canvas code. Verify visually (now has QR).
5. **Rewire draft pod** — replace `exportOwnDeckImage` + `viewPlayerDeck` with the service
   (`viewPlayerDeck` passes the opponent's `cardPositions`). Verify own + opponent.
6. **Rewire sealed pod** — replace `exportOwnDeckImage`. Verify.
7. **Full QA** — build, lint, unit tests, manual screenshots of all surfaces; update this
   doc and move to `/docs/` when complete.

## 7. Explicitly out of scope

- **Server/swuapi path** — [`lib/deckImageApi.ts`](../lib/deckImageApi.ts) (external
  swuapi `/deck-image`), [`lib/og/poolDeckImage.ts`](../lib/og/poolDeckImage.ts) (sharp
  letterbox → 1200×630), and the OG/Twitter routes. These run server-side where there is no
  DOM/canvas (Playwright was deliberately removed — commit `90150a4`). They cannot share
  the client canvas code.
- **Visual parity between client canvas and swuapi/OG output** — the in-app image and the
  Discord/social card look different. Unifying them is a separate, larger project (would
  mean either restyling swuapi or rendering the canvas headlessly). Not addressed here.

## 8. Risks

- **CORS / canvas tainting** — must preserve `crossOrigin='anonymous'` + timeout +
  placeholder fallback for external card art. Centralized in `imageLoading.ts`.
- **Visual regressions** — mitigated by the deckbuilder-pixel-identical invariant + manual
  before/after gate.
- **State-shape edge cases** — pod opponent decks, missing leader/base, sealed vs draft
  sideboard. Covered by model fixtures.
- **Large file churn** — the play page is 2341 lines; removing ~990 is a big but mechanical
  delete. Keep step 4 as its own commit.
