# Draft Report Notes Tab + Support Page Fixes — Design Spec

5 changes: one feature (Notes tab) and four quick fixes.

---

## 1. Notes Tab on Draft Report

### Database

New migration: add `notes` column (text, nullable, default null) to `card_pools` table.

### API

**`PATCH /api/draft/[shareId]/report/notes`**
- Auth required, owner-only (match `session.id` against pool's `user_id`)
- Body: `{ notes: string }` (empty string clears notes)
- Updates `card_pools.notes` where `pod_id` matches the draft and `user_id` matches the session
- Returns `{ success: true }`

**Existing `GET /api/draft/[shareId]/report`**
- Add `notes` to the pool query SELECT
- Return `notes` in the pool response object

### Frontend — Report Page

**Tab definition:**
Add `{ id: 'notes', label: 'Notes' }` to the tabs array, between 'deck' and 'gameplay'. Add `'notes'` to the `TabId` type.

**View mode (default):**
- If notes exist: render markdown using the same regex `parseMarkdownToHTML` approach from `ReleaseNotes.tsx`. Extract that function to a shared utility (`src/utils/markdown.ts`) so both components can use it. Render with `dangerouslySetInnerHTML`.
- If notes empty and is owner: show "Click to add notes" placeholder (clickable, enters edit mode)
- If notes empty and not owner: show "No notes yet."
- If notes exist and is owner: show a pencil/edit button in the top right to enter edit mode

**Edit mode (owner only):**
- Large `<textarea>` — full width of the notes tab, `min-height: 300px`, dark background matching report theme, white text, monospace font
- Below the textarea: Save button (primary) and Cancel link/button (secondary)
- Save: POST to the notes API, on success switch to view mode with updated content
- Cancel: revert textarea to last saved value, switch to view mode

**State:**
- `notes` string from the API response (stored in component state)
- `editingNotes` boolean for edit/view toggle
- `notesDraft` string for the textarea value while editing

### Styling

Add to `report.css`:
- `.draft-report-notes` — container for the notes tab content
- `.draft-report-notes-view` — rendered markdown area, same text styling as other tab content
- `.draft-report-notes-empty` — placeholder styling (clickable, cursor pointer, muted text)
- `.draft-report-notes-edit` — textarea styling (full width, min-height 300px, dark bg, white text, monospace)
- `.draft-report-notes-actions` — flex row for Save/Cancel buttons with gap

---

## 2. Non-Patron Reports Index Page

In `app/draft/reports/page.tsx`, replace the patron gate content (lines 80-92):
- Keep the "Friends of the Pod" heading
- Change description to explain it's a premium feature
- Replace "Back to Drafts" button with a Patreon link button: `<a href="https://www.patreon.com/c/ProtectthePod">` styled as a primary Button
- Keep a secondary "Back to Drafts" button below it

---

## 3. Draft Reports Perk in About Component

In `src/components/About.tsx`, add to the perks list (before "Beta Access"):
```
<li><strong>Draft Reports</strong> — Review your draft history with detailed pick-by-pick logs, deck breakdowns, and personal notes.</li>
```

---

## 4. Support Page Scrolling

In `src/components/About.css`, change `.about-page` from `overflow: hidden` to `overflow-y: auto`.

---

## 5. Vertical Spacing

In `src/components/About.css`, add more vertical margin between the buttons row and the sponsors/thanks section. Target: ~2rem gap.
