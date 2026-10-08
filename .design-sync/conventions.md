# Protect the Pod — design system

swupod is a dark, cinematic Star Wars: Unlimited limited simulator. These are
its real compiled UI primitives (`window.Swupod.*`) — build with them directly,
don't reimplement.

## Setup & wrapping

No React provider or theme context. Components are styled entirely by the
bundled CSS, so **make sure `styles.css` is loaded** — it `@import`s the Barlow
webfont and `_ds_bundle.css` (every component's co-located styles). Two things
are non-negotiable or components render wrong:

- **Dark surface.** The system assumes a near-black page. Place components on
  `#0A0A0A` (page) / `#000` (panels) with light ink (`#FFFFFF`). There is no
  light theme — on a light background they're unreadable.
- **Barlow** is the only typeface (weights 400 / 500 / 600 / 800), loaded by
  `styles.css`.

## Styling idiom (mixed — match it)

- **Interactive primitives are prop-driven. Use the component, never hand-write
  its classes.** `Button` takes `variant` (`'primary' | 'secondary' | 'danger' |
  'warning' | 'back' | 'discord' | 'icon' | 'toggle' | 'interactive'`), `size`
  (`'xs' | 'sm' | 'md' | 'lg'`), plus `active` / `textOnly` / `glowColor`. It
  emits `.btn--*` internally — don't write those. `Modal` takes `isOpen`,
  `onClose`, `title`, `children`. `AspectIcon`, `CostIcon`, `SearchInput`,
  `EditableTitle`, `UserAvatar`, and the timers (`CountdownTimer`, `DraftTimer`,
  `TimerPanel`, `TimerButton`) are all prop-driven too.
- **Surface/structure components own BEM-ish class families** in `_ds_bundle.css`
  — compose around them, rarely touch them: `.canvas-card` (+ state `.selected` /
  `.active` / `.disabled`, role `.leader` / `.base`) for cards, `.draftable-card`,
  `.collapsible-section`, `.player-seat`, the timer classes (`.timer-panel` /
  `.timer-value` / `.timer-label`), `.search-input`, `.wf-browser-card` /
  `.wf-lockup` (store buttons), and `.cards-grid` to lay cards out in a wrap grid.
- **No CSS custom-property token layer.** Colors/spacing are baked into the
  component CSS, not exposed as `var(--*)`. For your *own* layout glue, match the
  palette by hand: glows green `#00FF00` (primary), red `#FF0000` (danger), blue
  `#2196F3` (interactive); aspect colors Vigilance `#4A90E2`, Command `#27AE60`,
  Aggression `#E74C3C`, Cunning `#F1C40F`, Villainy `#1A1A1A`, Heroism `#F0F0F0`.
- **Radius:** UI chrome uses 4 / 6 / 8 / 12px. Card surfaces use an ~11px corner
  derived from the physical card — don't snap those to the UI scale.

## Where the truth lives

Read these (you have the bound copies): `_ds_bundle.css` (every component's real
styles), `styles.css` (the entry pulling fonts + bundle), each component's
`components/general/<Name>/<Name>.prompt.md` and `.d.ts`, and
`guidelines/docs/STYLE_GUIDE.md` (the project's own usage rules).

## Idiomatic snippet

```tsx
// On a dark panel. Components are pre-styled; you write only layout glue.
<div style={{ background: '#0A0A0A', padding: 24, color: '#fff' }}>
  <Modal isOpen={open} onClose={close} title="Ready to play?">
    <p>Your 40-card deck is legal.</p>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
      <Button variant="secondary" onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={play}>Play</Button>
    </div>
  </Modal>
</div>
```
