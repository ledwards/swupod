# OG Images Plan

## Goal
Replace the generic static OG image with dynamic, page-specific OG images — starting with draft reports.

## Current State
- Single static `public/og-image.png` set globally in `app/layout.tsx`
- No `generateMetadata` or `opengraph-image.tsx` files anywhere
- All pages (including shared draft report links) show the same generic preview

---

## Phase 1: Draft Report OG Image (Pod Render)

**Page:** `/draft/[shareId]/report/[poolShareId]`

The OG image should render the draft pod seating — a visual of the players around a table with their leader/base info.

### Steps

1. **Create server-side metadata** for the report page
   - The page is currently `'use client'` — extract a `generateMetadata` function into a separate server component or use a `layout.tsx` in that route segment
   - Fetch draft name, set name, player names, and leader info server-side
   - Set `title`, `description`, and `openGraph.images` pointing to a dynamic OG image route

2. **Create OG image route** at `app/draft/[shareId]/report/[poolShareId]/opengraph-image.tsx`
   - Use Next.js `ImageResponse` (from `next/og`) to render a 1200x630 image
   - Render a simplified pod view:
     - Player names arranged in a circle/oval
     - Each player's chosen leader name (if available)
     - Draft name and set name as title text
     - Set art or thematic background
   - Data: query the same DB tables the report API uses (pod, pod_players, users)
   - Keep it simple — no card images in the OG (too complex), just text + layout

3. **Handle edge cases**
   - Private reports: show a generic "Private Draft Report" image (no player data)
   - Missing data: fall back to the global OG image

### Data Available (from report API)
- `pod.name`, `pod.set_code`, `pod.set_name`, `pod.max_players`
- `pod_players.username`, `pod_players.seat_number`, `pod_players.is_bot`
- `pod_players.drafted_leaders` (JSON), active leader name
- `card_pools.report_public` (privacy check)

---

## Phase 2: Audit & Prioritize Other Pages

Pages that would benefit most from custom OG images (high shareability):

| Page | Route | OG Content Idea | Priority |
|------|-------|-----------------|----------|
| Draft report (index) | `/draft/[shareId]/report` | Pod name + player list | Medium |
| Draft lobby/pod | `/draft/[shareId]/pod` | "Join [Draft Name]" + player count | High |
| Sealed pool | `/sealed/[shareId]` | Set name + format | Low |
| Pool deck (play page) | `/pool/[shareId]/deck/play` | Leader + base card images | Medium |
| Draft history | `/history` | Static "Draft History" image | Low |
| Formats landing | `/formats` | Static formats overview | Low |
| Home page | `/` | Current static image is fine | N/A |

### Pages NOT worth custom OG (internal/transient):
- `/draft/new`, `/sealed/new`, `/pools/new` (creation forms)
- `/draft/[shareId]/deck` (mid-draft, not shared)
- `/draft/[shareId]/log` (internal)
- Admin/QA pages

---

## Phase 3: Shared OG Infrastructure (if needed)

If multiple pages need dynamic OG images, consider:
- A shared `lib/og.ts` with common styles, fonts, backgrounds
- Reusable layout components for `ImageResponse`
- Caching strategy (OG images are fetched by crawlers, not users — can be aggressive)

---

## Notes
- Next.js `opengraph-image.tsx` convention auto-generates the `<meta>` tags
- `ImageResponse` uses Satori under the hood — supports a subset of CSS (flexbox, no grid)
- Max image size: 1200x630 is standard
- Twitter uses `twitter-image.tsx` separately, but same `ImageResponse` approach
