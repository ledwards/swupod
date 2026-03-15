# Draft UI Improvements Plan

## Tasks

### 1. Solo draft pod page: move "Ready to Play" above pod details
- In solo mode only, reorder the pod completion page so the play section is at the top and pod details (bot decks etc) are below
- Files: `app/draft/[shareId]/page.tsx` or wherever the completed draft pod view renders

### 2. Share to Discord button on draft play page
- Same "Post to Discord" button as sealed play page
- Already implemented on play page — verify it works for draft pools too (pool_type='draft')

### 3. Draft log link on play page
- Add a "View Draft Log" button at the bottom of the play page when the pool came from a draft
- Use `pool.draftShareId` to link to `/draft/{shareId}/log`

### 4. Discord post from draft includes draft log link
- When posting to Discord from a draft pool, include the draft log URL in the embed
- Make the draft log public when posting

### 5. Verify base rotation in draft log
- Check the draft log rendering — ensure rare bases are displayed correctly (rotated)
- The draft log uses DraftableCard component which was already updated with base rotation CSS

### 6. Bug: Draft log missing Pick 3 Pack 2
- Investigate `YLySztif` log seat 1 — why is pick 3 missing?
- Could be a data issue or rendering bug

### 7. Bot tabs in draft log: show strategy info
- Inside each bot's tab in the draft log, display:
  - Strategy name and description
  - Mixin name and description
  - Leader and base they picked internally

### 8. Player/bot deck links in draft log tabs
- For each visible player/bot in the draft log, link to their deck
- If deck not yet built, show "Still deckbuilding"
- Respect public/private — show lock icon for private decks

### 9. Deck image icon change
- Replace eyeball icon with image icon for viewing deck images
- Show a spinner while the image is loading

## Status
- [ ] Task 1: Solo draft pod reorder
- [ ] Task 2: Share to Discord on draft play (verify existing)
- [ ] Task 3: Draft log link on play page
- [ ] Task 4: Discord post includes draft log
- [ ] Task 5: Base rotation in draft log (verify)
- [ ] Task 6: Bug: missing pick in draft log
- [ ] Task 7: Bot strategy info in draft log
- [ ] Task 8: Deck links in draft log
- [ ] Task 9: Deck image icon + spinner
