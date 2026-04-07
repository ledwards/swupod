# Report Notes Tab + Support Page Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Notes tab to draft reports (owner-editable markdown, publicly visible), fix the non-patron gate to link to Patreon, add Draft Reports to the perks list, and fix the Support page scrolling/spacing.

**Architecture:** New `notes` column on `card_pools`, new PATCH API endpoint for saving notes, extracted markdown parser utility, Notes tab component in the report page. Four small CSS/markup fixes to the Support page and reports index.

**Tech Stack:** Next.js, PostgreSQL, React, CSS

---

### Task 1: Add `notes` column to `card_pools` table

**Files:**
- Create: `migrations/051_add_notes_to_pools.sql`

- [ ] **Step 1: Create migration**

```sql
-- migrations/051_add_notes_to_pools.sql
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/051_add_notes_to_pools.sql
git commit -m "feat: add notes column to card_pools table"
```

---

### Task 2: Extract markdown parser to shared utility

**Files:**
- Create: `src/utils/markdown.ts`
- Modify: `src/components/ReleaseNotes.tsx:13-49`

- [ ] **Step 1: Create shared markdown utility**

Create `src/utils/markdown.ts`:

```ts
// @ts-nocheck
/**
 * Simple regex-based markdown to HTML parser.
 * Supports: h1-h3, bold, code blocks, inline code, links, lists, hr, paragraphs.
 */
export function parseMarkdownToHTML(markdown: string): string {
  let html = markdown

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />')

  // Paragraphs
  html = html.split('\n').map(line => {
    if (line.trim() && !line.match(/^<[^>]+>/) && !line.match(/<\/[^>]+>$/)) {
      return `<p>${line}</p>`
    }
    return line
  }).join('\n')

  return html
}
```

- [ ] **Step 2: Update ReleaseNotes.tsx to import from shared utility**

In `src/components/ReleaseNotes.tsx`, replace the inline `parseMarkdownToHTML` function (lines 13-49) with an import:

Replace:
```tsx
  const parseMarkdownToHTML = (markdown: string): string => {
    let html = markdown
    // ... entire function body ...
    return html
  }
```

With:
```tsx
  // Imported at top of file
```

And add to the imports at the top of the file (after line 4):
```tsx
import { parseMarkdownToHTML } from '../utils/markdown'
```

Remove the local function definition entirely (lines 13-49). The rest of the component stays the same — it already calls `parseMarkdownToHTML(text)`.

- [ ] **Step 3: Verify ReleaseNotes still works**

Run: `npm run build`
Expected: Compiles successfully. ReleaseNotes component still renders markdown the same way.

- [ ] **Step 4: Commit**

```bash
git add src/utils/markdown.ts src/components/ReleaseNotes.tsx
git commit -m "refactor: extract parseMarkdownToHTML to shared utility"
```

---

### Task 3: Add notes to the report API

**Files:**
- Modify: `app/api/draft/[shareId]/report/route.ts:85-90,109-116`
- Create: `app/api/draft/[shareId]/report/notes/route.ts`

- [ ] **Step 1: Add `notes` to the existing GET report query**

In `app/api/draft/[shareId]/report/route.ts`, modify the pool SELECT query (around line 85) to include `notes`:

Change:
```ts
  const pool = await queryRow(
    `SELECT cp.id, cp.share_id, cp.cards, cp.packs, cp.deck_builder_state,
            cp.report_public, cp.pool_type, cp.created_at
     FROM card_pools cp
     WHERE cp.pod_id = $1 AND cp.user_id = $2
     ORDER BY cp.created_at DESC
     LIMIT 1`,
    [pod.id, session.id]
  )
```

To:
```ts
  const pool = await queryRow(
    `SELECT cp.id, cp.share_id, cp.cards, cp.packs, cp.deck_builder_state,
            cp.report_public, cp.pool_type, cp.created_at, cp.notes
     FROM card_pools cp
     WHERE cp.pod_id = $1 AND cp.user_id = $2
     ORDER BY cp.created_at DESC
     LIMIT 1`,
    [pod.id, session.id]
  )
```

And add `notes` to the response object (in the `pool:` section of the JSON response, around line 109-116):

After `reportPublic: pool.report_public,` add:
```ts
      notes: pool.notes || null,
```

- [ ] **Step 2: Create PATCH notes endpoint**

Create `app/api/draft/[shareId]/report/notes/route.ts`:

```ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { shareId } = await params

  const pod = await queryRow(
    `SELECT id FROM pods WHERE share_id = $1 AND pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const pool = await queryRow(
    `SELECT id, user_id FROM card_pools WHERE pod_id = $1 AND user_id = $2`,
    [pod.id, session.id]
  )
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  if (pool.user_id !== session.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await request.json()
  const notes = typeof body.notes === 'string' ? body.notes : ''

  await query(
    `UPDATE card_pools SET notes = $1, updated_at = NOW() WHERE id = $2`,
    [notes || null, pool.id]
  )

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add app/api/draft/[shareId]/report/route.ts app/api/draft/[shareId]/report/notes/route.ts
git commit -m "feat: add notes field to report API and PATCH endpoint for saving notes"
```

---

### Task 4: Add Notes tab to draft report page

**Files:**
- Modify: `app/draft/[shareId]/report/page.tsx`
- Modify: `app/draft/[shareId]/report/report.css`

- [ ] **Step 1: Update types and state**

In `app/draft/[shareId]/report/page.tsx`:

Update the pool type in ReportData interface (around line 50-57) to include `notes`:
```ts
  pool: {
    shareId: string
    cards: unknown[]
    packs: Array<{ cards: unknown[]; name?: string }>
    deckBuilderState: unknown
    reportPublic: boolean
    notes: string | null
    createdAt: string
  } | null
```

Update TabId type (line 60):
```ts
type TabId = 'seating' | 'log' | 'pool' | 'deck' | 'notes' | 'gameplay'
```

Add new state variables after the existing state declarations (after `const [reportPublic, setReportPublic] = useState(false)` around line 83):
```tsx
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
```

Add the import for parseMarkdownToHTML at the top of the file (after the other imports):
```tsx
import { parseMarkdownToHTML } from '../../../../src/utils/markdown'
```

- [ ] **Step 2: Add the Notes tab to the tabs array**

Update the tabs array (around line 214-220) to include notes between deck and gameplay:
```tsx
  const tabs = [
    { id: 'seating', label: 'Draft Seating' },
    { id: 'log', label: 'Draft Log' },
    { id: 'pool', label: 'Pool' },
    { id: 'deck', label: 'Deck' },
    { id: 'notes', label: 'Notes' },
    { id: 'gameplay', label: 'Gameplay', placeholder: true },
  ]
```

- [ ] **Step 3: Add handleSaveNotes function**

Add after the existing `handleCopyLink` function (around line 128):

```tsx
  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/draft/${shareId}/report/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: notesDraft }),
      })
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          pool: prev.pool ? { ...prev.pool, notes: notesDraft || null } : prev.pool,
        } : prev)
        setEditingNotes(false)
      }
    } catch {
      // silently fail
    } finally {
      setSavingNotes(false)
    }
  }
```

- [ ] **Step 4: Determine isOwner**

After the `const { draft, players, picks, pool } = data` line (around line 166), add:

```tsx
  const isOwner = user && data.mySeat != null
```

- [ ] **Step 5: Add Notes tab content**

Add the notes tab rendering block after the deck tab block and before the gameplay tab block:

```tsx
        {activeTab === 'notes' && (
          <div className="draft-report-notes">
            {editingNotes ? (
              <>
                <textarea
                  className="draft-report-notes-edit"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Write your notes here... (Markdown supported)"
                  autoFocus
                />
                <div className="draft-report-notes-actions">
                  <Button variant="primary" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="secondary" onClick={() => { setEditingNotes(false); setNotesDraft(pool?.notes || '') }}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : pool?.notes ? (
              <>
                {isOwner && (
                  <button className="draft-report-notes-edit-btn" onClick={() => { setNotesDraft(pool.notes || ''); setEditingNotes(true) }} title="Edit notes">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                )}
                <div
                  className="draft-report-notes-view"
                  dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(pool.notes) }}
                />
              </>
            ) : isOwner ? (
              <div
                className="draft-report-notes-empty"
                onClick={() => { setNotesDraft(''); setEditingNotes(true) }}
              >
                Click to add notes...
              </div>
            ) : (
              <div className="draft-report-notes-empty" style={{ cursor: 'default' }}>
                No notes yet.
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 6: Add CSS for Notes tab**

Add to the end of `app/draft/[shareId]/report/report.css`:

```css
/* Notes tab */
.draft-report-notes {
  position: relative;
  padding: 20px 0;
}

.draft-report-notes-view {
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.7;
  font-size: 0.95rem;
}

.draft-report-notes-view h1,
.draft-report-notes-view h2,
.draft-report-notes-view h3 {
  color: white;
  margin: 1.5rem 0 0.5rem;
}

.draft-report-notes-view h1 { font-size: 1.4rem; }
.draft-report-notes-view h2 { font-size: 1.2rem; }
.draft-report-notes-view h3 { font-size: 1.05rem; }

.draft-report-notes-view p {
  margin: 0.5rem 0;
}

.draft-report-notes-view a {
  color: rgba(128, 170, 255, 0.9);
}

.draft-report-notes-view ul {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.draft-report-notes-view li {
  margin: 0.25rem 0;
}

.draft-report-notes-view code {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-size: 0.85em;
}

.draft-report-notes-view pre {
  background: rgba(0, 0, 0, 0.4);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
}

.draft-report-notes-empty {
  color: rgba(255, 255, 255, 0.4);
  font-size: 1rem;
  padding: 3rem;
  text-align: center;
  cursor: pointer;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 8px;
}

.draft-report-notes-edit {
  width: 100%;
  min-height: 300px;
  background: rgba(0, 0, 0, 0.4);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 16px;
  font-family: 'Barlow', monospace;
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}

.draft-report-notes-edit:focus {
  outline: none;
  border-color: rgba(255, 215, 0, 0.5);
}

.draft-report-notes-edit::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.draft-report-notes-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.draft-report-notes-edit-btn {
  position: absolute;
  top: 20px;
  right: 0;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.6);
  border-radius: 6px;
  padding: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.draft-report-notes-edit-btn:hover {
  color: white;
  border-color: rgba(255, 255, 255, 0.5);
}
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 8: Commit**

```bash
git add app/draft/[shareId]/report/page.tsx app/draft/[shareId]/report/report.css
git commit -m "feat: add Notes tab to draft report with markdown editing"
```

---

### Task 5: Update non-patron reports index page

**Files:**
- Modify: `app/draft/reports/page.tsx:80-92`

- [ ] **Step 1: Replace the patron gate content**

In `app/draft/reports/page.tsx`, replace the patron gate block (lines 80-92):

```tsx
  if (isPatron === false) {
    return (
      <div className="draft-reports-page page-background">
        <div className="draft-reports-content">
          <div className="draft-reports-empty">
            <h2>Friends of the Pod</h2>
            <p>Draft Reports are available exclusively for Friends of the Pod.</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }
```

With:

```tsx
  if (isPatron === false) {
    return (
      <div className="draft-reports-page page-background">
        <div className="draft-reports-content">
          <div className="draft-reports-empty">
            <h2>Friends of the Pod</h2>
            <p>Draft Reports are a premium feature for Friends of the Pod. Review your draft history with detailed pick-by-pick logs, deck breakdowns, and personal notes.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
              <a href="https://www.patreon.com/c/ProtectthePod" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Button variant="primary">Become a Friend of the Pod</Button>
              </a>
              <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/draft/reports/page.tsx
git commit -m "fix: link to Patreon on non-patron draft reports page"
```

---

### Task 6: Add Draft Reports to perks list + fix Support page

**Files:**
- Modify: `src/components/About.tsx:32-37`
- Modify: `src/components/About.css:12,28,133-141`

- [ ] **Step 1: Add Draft Reports perk**

In `src/components/About.tsx`, add a new `<li>` to the perks list (after line 33, the "Professional Stats" item):

```tsx
            <li><strong>Draft Reports</strong> — Review your draft history with detailed pick-by-pick logs, deck breakdowns, and personal notes</li>
```

- [ ] **Step 2: Fix Support page scrolling**

In `src/components/About.css`, change line 12:

From:
```css
  overflow: hidden;
```

To:
```css
  overflow-y: auto;
```

- [ ] **Step 3: Add vertical spacing between buttons and thanks row**

In `src/components/About.css`, change `.support-section` (line 27-29):

From:
```css
.support-section {
  margin-bottom: 0;
}
```

To:
```css
.support-section {
  margin-bottom: 2rem;
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Compiles successfully. Support page now scrolls and has spacing between buttons and sponsors.

- [ ] **Step 5: Commit**

```bash
git add src/components/About.tsx src/components/About.css
git commit -m "feat: add Draft Reports to perks list, fix support page scrolling and spacing"
```

---

### Task 7: Build and final verification

- [ ] **Step 1: Run the build**

Run: `npm run build`
Verify no errors.

- [ ] **Step 2: Run tests**

Run: `npm run test`
All tests should pass.

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: lint fixes for report notes and support page changes"
```
