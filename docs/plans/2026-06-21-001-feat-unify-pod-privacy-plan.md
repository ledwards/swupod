---
title: Unify Pod Privacy (log + report inherit one pod-level flag)
type: feat
status: active
date: 2026-06-21
---

## Overview

Pod privacy is governed by **five** boolean flags spread across three tables, and the
draft **log** and draft **report** pages each compute "public" differently. A pod created
as a "Public Pod" still renders its log and report as **private**, and the host's two
"make public" toggles (log vs report) do not agree with each other. This plan collapses the
model to a **single source of truth — `pods.is_public`** — that the log and report inherit
by default, so the public/private choice made at pod creation carries all the way through to
both surfaces.

## Current State

### The five flags (three tables)

| Flag | Table | Default | Set where | Read where |
| --- | --- | --- | --- | --- |
| `is_public` | `pods` | `false` (`migrations/036_add_is_public.sql:1`) | creation + host toggle | report only (+ lobby/Discord/broadcast) |
| `is_log_public` | `pods` | `false` (`migrations/034_draft_log_visibility.sql:4`) | log host toggle, report "draft" scope | log + report |
| `is_log_public` | `pod_players` | `false` (`migrations/034_draft_log_visibility.sql:5`) | per-player log toggle, report "draft" scope | log + report |
| `is_public` | `card_pools` | `true` (`migrations/002_add_pool_type_set_name.sql:17`) | pool create paths / pool settings | report only |
| `report_public` | `card_pools` | `false` (`migrations/050_add_report_public_to_pools.sql:2`) | per-pool report toggle, report "draft" scope | report only |

Note the schema history: `draft_pods`→`pods` and `draft_pod_players`→`pod_players`
(`migrations/037_rename_pods_tables.sql:5-6`); `card_pools.draft_pod_id`→`pod_id`
(`migrations/006_add_draft_pool_link.sql:4`, renamed `migrations/037_rename_pods_tables.sql:12`).

### 1. Pod-level `pods.is_public` — creation, set, read, broadcast

- **Create-flow toggle ("Public Pod"):** `app/draft/new/page.tsx:29-41` holds `isPublic`
  state (persisted to `localStorage['pod-visibility']`, default `true`); the lock button is
  `app/draft/new/page.tsx:135-154`. It is passed through `createDraft(setCode, { isPublic, ... })`
  at `app/draft/new/page.tsx:73` and serialized as `is_public: isPublic` at
  `app/draft/new/page.tsx:68` (analytics only).
- **API create:** `app/api/draft/route.ts:46` derives `podIsPublic` (default `true`), and the
  `INSERT INTO pods` writes it into `is_public` at `app/api/draft/route.ts:125,150`. **Only
  `pods.is_public` is set at creation** — `is_log_public` and the pool flags are left at their
  column defaults.
- **Host toggle (lobby/settings):** `app/api/draft/[shareId]/settings/route.ts:79-82` updates
  `pods.is_public` (only while `status='waiting'`), and drives Discord thread create/delete
  (`settings/route.ts:104-149`). Again, **only `pods.is_public`** — no propagation to log/report flags.
- **Read / broadcast:** lobby read `app/api/draft/[shareId]/route.ts:186` (`isPublic: pod.is_public`);
  public-pods socket list filters `WHERE dp.is_public = true` in
  `src/lib/socketBroadcast.ts:384` (`broadcastPublicPodsUpdate`), called on create at
  `app/api/draft/route.ts:194-198`; public lobby API `app/api/pods/public/route.ts:15`
  (`WHERE dp.is_public = true AND dp.status='waiting'`). Discord join/leave/remove gating also
  reads `pod.is_public` (e.g. `app/api/draft/[shareId]/join/route.ts:102,125,139`).

### 2. Draft LOG visibility — `/draft/[shareId]/log`

- **Decision logic:** `app/api/draft/[shareId]/log/route.ts:79-96`. `viewableSeats` is computed
  from `pod.is_log_public` (line 80, pod-level override → all seats), else host (all seats),
  else participant (own + bots + seats whose `pod_players.is_log_public` is true), else
  non-participant (only seats with `pod_players.is_log_public`). The pod row it loads
  (`log/route.ts:32-39`) selects **`dp.is_log_public` but NOT `dp.is_public`** — the log never
  consults the pod-level public flag.
- **Toggle ("private lock" the owner clicks):** host lock button at
  `app/draft/[shareId]/log/page.tsx:420-429` → `handleToggleDraftPublic`
  (`log/page.tsx:142-177`) → `PATCH /api/draft/[shareId]/log/visibility` with
  `{ draftPublic }`. Per-player lock at `log/page.tsx:460-481` → `handleTogglePlayerPublic`
  (`log/page.tsx:179-226`) → same endpoint with `{ playerPublic }`.
- **Toggle API:** `app/api/draft/[shareId]/log/visibility/route.ts:44-65`. `draftPublic`
  (host-only) updates **`pods.is_log_public`** (line 49-52); `playerPublic` updates the caller's
  **`pod_players.is_log_public`** (line 56-61). **It does not touch `pods.is_public` or any
  `card_pools` flag.** This is the toggle that "does not propagate to the report."

### 3. Draft REPORT visibility — `/draft/[shareId]/report` and `/report/[poolShareId]`

- **Decision logic (index):** `app/api/draft/[shareId]/report/route.ts:61-69` computes
  `draftReportsPublic` as a **five-way AND**:
  ```
  draftReportsPublic =
      pod.is_public === true            // pods.is_public
   && pod.is_log_public === true        // pods.is_log_public
   && allPoolsPublic                    // every card_pools.is_public === true
   && allReportsPublic                  // every card_pools.report_public === true
   && allPlayerLogsPublic               // every pod_players.is_log_public === true
  ```
  Per-report visibility for the list uses **`card_pools.report_public`** only
  (`report/route.ts:55`, `isPublic: r.report_public`). The detail endpoint repeats the same
  five-way AND at `app/api/draft/[shareId]/report/[poolShareId]/route.ts:74-82`, and gates a
  single report on `targetPool.report_public` at `report/[poolShareId]/route.ts:37-41`
  (owner/host always allowed).
- **Toggle:** host "Draft Public/Private" button `app/draft/[shareId]/report/page.tsx:146-160`
  → `handleToggleDraftVisibility` (`report/page.tsx:70-95`) → `PATCH .../report/visibility`
  with `{ reportPublic, scope:'draft' }`. Per-report owner toggle in the detail page
  `app/draft/[shareId]/report/[poolShareId]/page.tsx:163-187` → same endpoint, default
  `scope:'player'`.
- **Toggle API:** `app/api/draft/[shareId]/report/visibility/route.ts`. `scope:'draft'`
  (host-only, lines 36-69) is the **only place all five flags are written together**: sets
  `pods.is_public=is_log_public` (lines 42-48), every `pod_players.is_log_public` (49-54),
  every `card_pools.is_public=report_public` (55-61). `scope:'player'` (lines 71-83) updates
  only the caller's `card_pools.report_public`.

### 4. Where log and report diverge (the bug)

- **Pools created during a draft never get `report_public` set.** `POST /api/draft/[shareId]/pool`
  inserts a pool with **no `is_public` and no `report_public`** column in the column list
  (`app/api/draft/[shareId]/pool/route.ts:108-131`). So each pool lands at `is_public=true`
  (column default) **but `report_public=false`** (column default). The report's five-way AND
  therefore evaluates **false** for any pod that hasn't run the host `scope:'draft'` toggle —
  even a fully public pod.
- **The log ignores `pods.is_public` entirely** and keys off `pods.is_log_public`
  (`log/route.ts:80`), which is **also `false` by default** and is only ever set by the log's
  own host toggle. So a "Public Pod" shows a **private log** out of the box too.
- **The two host toggles write different flag sets.** The **log** toggle writes only
  `pods.is_log_public` / `pod_players.is_log_public`
  (`log/visibility/route.ts:49-61`); it leaves `pods.is_public` and both `card_pools` flags
  untouched. So flipping the log public still leaves the report's AND false (pools'
  `report_public` is still false) → **report stays private**, exactly as reported. Only the
  **report** toggle (`scope:'draft'`) writes all five flags and happens to also flip the log
  public as a side effect.

Net: three independent "public" concepts (`is_public`, `is_log_public`, `report_public`),
two of which default such that the create-time choice is silently dropped, and a log toggle
whose effect is invisible to the report.

### 5. DB schema (migrations)

- `pods.is_public` — `migrations/001_initial_schema.sql:32` (as `draft_pods`, default `false`),
  re-asserted `migrations/036_add_is_public.sql:1`.
- `pods.is_log_public` + `pod_players.is_log_public` — `migrations/034_draft_log_visibility.sql:4-5`
  (default `false`).
- `card_pools.is_public` — `migrations/001_initial_schema.sql:32`; default flipped to `true` in
  `migrations/002_add_pool_type_set_name.sql:13-17`.
- `card_pools.report_public` — `migrations/050_add_report_public_to_pools.sql:2` (default `false`).
- `card_pools.pod_id` (link used by all report/log joins) — `migrations/006_add_draft_pool_link.sql:4`,
  renamed in `migrations/037_rename_pods_tables.sql:12`.
- Highest existing migration: `migrations/073_casual_matches_pool_scoped.sql` → **new migration is `074`**.
- Migrations run idempotently at server startup via `server.js` and are tracked in the
  `migrations` table (per `.claude/rules/database.md`).

## Proposed Model

**Single source of truth: `pods.is_public`.** Log and report visibility are *derived* from it
by default. The other flags become **optional per-surface overrides** rather than required
conjuncts, and (critically) **they are no longer required to be `true` for a public pod's log
or report to be public.**

### What "public" means after this change

- **Log is public** when `pods.is_public === true` **OR** the pod-level log override is on,
  **OR** (per-seat) that player opted their own seat public. Concretely, replace the
  `pod.is_log_public` gate at `log/route.ts:80` with `pod.is_public || pod.is_log_public`.
  Per-seat opt-in (`pod_players.is_log_public`) is retained for the case where a host keeps a
  pod private but an individual wants to share their own picks.
- **Report is public** when `pods.is_public === true` **OR** the per-pool owner opted in
  (`card_pools.report_public`). Replace the five-way AND at `report/route.ts:64-69` and
  `report/[poolShareId]/route.ts:77-82` with:
  ```
  draftReportsPublic = pod.is_public === true
  ```
  and gate an individual report (`report/[poolShareId]/route.ts:39`) on
  `pod.is_public || targetPool.report_public` (owner/host still always allowed). The
  per-report list flag (`report/route.ts:55`) becomes `pod.is_public || r.report_public`.

This makes `pods.is_public` the one switch that flips both surfaces, while preserving the two
genuinely-useful finer controls (a participant sharing their own log/report inside an otherwise
private pod). It removes the requirement that **every** pool/seat be individually marked public.

### What the host toggle should do

There is one conceptual host control: **"Draft Public / Private."** Both the log page lock
(`log/page.tsx:420-429`) and the report page button (`report/page.tsx:146-160`) should write
the **same** thing: `pods.is_public`. After this change:

- Host toggle (either page) → `PATCH .../visibility` writes **`pods.is_public`** (and mirrors
  it to `is_log_public` only for backward-compatible display; see Migration note). It no longer
  needs to fan out writes to every `pod_players` row and every `card_pools` row, because reads
  derive from `pods.is_public`.
- The report endpoint's `scope:'draft'` branch (`report/visibility/route.ts:36-69`) is
  simplified to update `pods.is_public` (keeping the `is_log_public` mirror write for any
  legacy reader) and **drops** the bulk `pod_players` / `card_pools` UPDATEs, since they are no
  longer load-bearing for visibility.
- Per-surface overrides remain: log's `playerPublic` (own seat) and report's `scope:'player'`
  (own pool) keep working unchanged for the "private pod, share just mine" case.

### What happens on the log/report pages

- A pod created "Public Pod" now shows a **public log and public report immediately**, with no
  extra host action. The host lock/badge reflects `pods.is_public` and reads "Public."
- A pod created "Private Pod" shows both as private; the host's single toggle flips both at
  once; individual participants can still opt their own seat/report public.
- The report index "No public reports yet" empty state (`report/page.tsx:166-169`) will now
  populate for public pods because `publicReports` (`report/page.tsx:120`) keys off
  `r.isPublic` which now derives from `pods.is_public`.

### How the create-flow "Public Pod" choice maps

`app/draft/new/page.tsx` and `createDraft(...)` already send `isPublic`. No client change is
required for mapping. The only server change needed at creation is **none for visibility logic**
(reads now derive from `pods.is_public`), though we will set `pods.is_log_public = is_public`
in the insert for display-consistency / legacy-reader safety (`app/api/draft/route.ts:125,150`).
Pool creation (`pool/route.ts:108-131`) needs no flag change since reads derive from the pod.

### Migration to collapse redundant flags

We **keep the columns** (low-risk, avoids destructive schema change and avoids touching the
many Discord/lobby readers of `pods.is_public`) but **stop treating `is_log_public`,
`pod_players.is_log_public`, and `card_pools.report_public` as required conjuncts.** A data
backfill aligns existing pods so historical logs/reports match their pod's `is_public`. This is
the right-sized choice: a single derived read + a backfill, rather than a schema teardown that
would ripple through ~20 call sites.

## Implementation Units

- [ ] **U1 — Report reads derive from `pods.is_public`**
  - **Goal:** report is public iff the pod is public (or per-pool owner opt-in); kill the
    five-way AND.
  - **Files:** `app/api/draft/[shareId]/report/route.ts:61-69,55`;
    `app/api/draft/[shareId]/report/[poolShareId]/route.ts:74-82,39`.
  - **Approach:** set `draftReportsPublic = pod.is_public === true` in both endpoints; change
    the single-report gate to `if (!isOwner && !isHost && !pod.is_public && !targetPool.report_public)`;
    change the list flag to `isPublic: pod.is_public || r.report_public`. Remove the now-unused
    `allPoolsPublic`/`allReportsPublic`/`allPlayerLogsPublic` computations.
  - **Verification:** `node --test` on report route tests if present; manual: create a Public
    Pod, complete a draft, hit `GET /api/draft/<id>/report` → `draftReportsPublic: true` and
    reports listed without running any toggle. Create a Private Pod → `false`.

- [ ] **U2 — Log reads derive from `pods.is_public`**
  - **Goal:** a public pod shows a public log without the host flipping the log lock.
  - **Files:** `app/api/draft/[shareId]/log/route.ts:32-39` (add `dp.is_public` to the SELECT),
    `:80` (gate becomes `if (pod.is_public || pod.is_log_public)`), and the `isDraftPublic`
    values returned at `:126,196` become `pod.is_public || pod.is_log_public`.
  - **Approach:** keep per-seat `pod_players.is_log_public` opt-in for private pods (lines 88-95).
  - **Verification:** `node src/utils/draftLogReconstruction.test.js` unaffected; manual: Public
    Pod log shows all seats to a non-participant; Private Pod still hides non-public seats.

- [ ] **U3 — Host visibility toggles write `pods.is_public` (single switch)**
  - **Goal:** the log lock and the report "Draft Public/Private" button both flip the one flag,
    and agree.
  - **Files:** `app/api/draft/[shareId]/log/visibility/route.ts:44-53` (host `draftPublic` →
    `UPDATE pods SET is_public=$1, is_log_public=$1`); `app/api/draft/[shareId]/report/visibility/route.ts:36-69`
    (`scope:'draft'` → `UPDATE pods SET is_public=$1, is_log_public=$1`; **delete** the
    `pod_players` and `card_pools` bulk UPDATEs).
  - **Approach:** keep per-user overrides (`playerPublic`; `scope:'player'`) untouched. Keep the
    `is_log_public` mirror write so any legacy/Discord reader stays consistent.
  - **Verification:** flip log lock → report endpoint now returns `draftReportsPublic:true`
    (and vice-versa). Confirm non-host PATCH still 403 (log `:46-48`, report `:37-39`).

- [ ] **U4 — Front-end copy/labels reflect one setting**
  - **Goal:** both pages present a single "Draft Public/Private" control consistent with the
    derived state; no behavior change beyond what U1–U3 provide.
  - **Files:** `app/draft/[shareId]/log/page.tsx:420-429` (label/title already
    "Public/Private"); `app/draft/[shareId]/report/page.tsx:146-160` and the detail page
    `app/draft/[shareId]/report/[poolShareId]/page.tsx:189-214`.
  - **Approach:** verify the optimistic-update handlers (`log/page.tsx:142-177`,
    `report/page.tsx:70-95`) still match the simplified responses. **Read `docs/STYLE_GUIDE.md`
    and `.claude/rules/ui-components.md` before editing** (CLAUDE.md mandate); the report button
    already uses `Button variant=...`, but the log lock is a hand-rolled `<button>` — leave its
    structure as-is unless the style guide requires the `Button` component (out of scope to
    redesign; this unit is copy/consistency only).
  - **Verification:** load both pages for a public and a private pod; lock state matches the API.

- [ ] **U5 — DB migration + backfill (see next section)**
  - **Goal:** historical pods' log/report match their `pods.is_public`.
  - **Files:** new `migrations/074_unify_pod_privacy_backfill.sql`.
  - **Verification:** `npm run migrate:prod status` locally/dev; spot-check a known old public
    pod renders a public report.

- [ ] **U6 — Tests**
  - **Goal:** lock the unified behavior in.
  - **Files:** extend/added tests near `app/api/draft/[shareId]/settings/route.test.ts` and any
    report/log route test; per `.claude/rules/testing.md` (spec-first).
  - **Approach:** assert: (a) public pod → log+report public with zero toggles; (b) log toggle
    and report toggle produce identical `is_public`; (c) per-seat/per-pool opt-in still works on
    a private pod; (d) non-host cannot flip pod-level.
  - **Verification:** `npm run test` (and `npm run test:api`) green.

## Migration & Backfill

**New migration:** `migrations/074_unify_pod_privacy_backfill.sql` (idempotent; runs at startup).

No columns are added or dropped (keeps the ~20 existing `pods.is_public` readers and the
Discord/lobby logic untouched). The migration only **aligns existing rows** so that history
matches the new derivation:

```sql
-- 074: Unify pod privacy — make existing public pods' log/report match the pod.
-- Reads now derive log+report visibility from pods.is_public; this backfills the
-- legacy per-surface flags so historical drafts are consistent on first load.

-- Mirror pod-level public onto the log flag (kept only for legacy/Discord display).
UPDATE pods SET is_log_public = true
WHERE is_public = true AND is_log_public = false;

-- Public pods: open their participants' logs and their pools' reports so the
-- report list isn't empty for already-public historical drafts.
UPDATE pod_players pp SET is_log_public = true
FROM pods p
WHERE pp.pod_id = p.id AND p.is_public = true AND pp.is_log_public = false;

UPDATE card_pools cp SET report_public = true
FROM pods p
WHERE cp.pod_id = p.id AND p.is_public = true AND cp.report_public = false;
```

Notes:
- The first UPDATE keeps the `is_log_public` mirror consistent for any reader we did not
  migrate to derive-from-`is_public`.
- The second/third UPDATEs are **belt-and-suspenders**: with U1/U2 the report/log already
  derive from `pods.is_public`, but backfilling the per-row flags means the result is correct
  even if any reader is missed and makes the per-pool/per-seat lock UI show the right initial
  state for historical public pods.
- We do **not** force `report_public=false` for private pods (preserve any deliberate per-pool
  opt-ins). Default behavior for private pods is unchanged.
- **Test on dev/local before prod** (project rule: big migrations are validated off-prod first):
  `npm run migrate:prod status` then run; verify a sample public pod's
  `GET /api/draft/<id>/report` returns `draftReportsPublic:true`.

## Risks & Open Questions

- **Privacy regression (most important):** Today, reports are de-facto private for almost all
  public pods because pools default `report_public=false`. After this change, **every existing
  and future public pod exposes its reports and full draft log** (including all seats) to anyone
  with the link. The backfill makes this retroactive. Confirm with the product owner that
  "Public Pod ⇒ public log + public report for all seats" is the intended semantics (it matches
  the stated goal, but it is a visibility broadening for historical data). If they want
  retroactivity excluded, drop the 2nd/3rd UPDATEs in `074` and rely solely on U1/U2 going
  forward.
- **Competitive Practice pods are public by default** (`app/api/draft/route.ts:46` default
  `true`; competitive forces 8 players). After this change their logs/reports become public by
  default — verify that is desired for CPM (see MEMORY `project_competitive_practice_mode.md`).
- **Keep vs drop columns:** this plan keeps `is_log_public`/`report_public` to minimize blast
  radius. If the owner wants a truly single column, a follow-up could drop them — but that
  touches the report list per-pool opt-in and the per-seat opt-in UX, which are arguably still
  wanted. Open question: do we keep per-seat / per-pool opt-in at all, or is pod-level the only
  control? (Plan assumes opt-in stays for private pods.)
- **Sealed parity:** sealed has a parallel stack (`app/api/sealed/...`, `app/api/sealed/[shareId]/settings/route.ts:47`)
  with the same `pods.is_public`. Sealed has no draft log; confirm whether sealed reports (if
  any) need the same treatment or are out of scope. This plan scopes to **draft** only.
- **`card_pools.is_public` overload:** that column also governs **deck/pool sharing** outside
  drafts (`app/api/pools/...`, e.g. `app/api/pools/[shareId]/route.ts:289`,
  `app/api/pools/route.ts` cascade to child pools at `:321`). We intentionally do **not** repoint
  pool-deck visibility at `pods.is_public`; only the **report** derivation changes. The log
  page's "View Deck & Pool" link still respects `card_pools.is_public`
  (`log/page.tsx:513-522`) — confirm that staying pool-scoped (not pod-derived) is acceptable, or
  whether deck visibility should also follow the pod. (Plan leaves deck-link gating as-is.)
- **Discord side effects:** the host toggle currently creates/deletes a Discord thread via the
  **settings** route, not the visibility routes. The visibility routes don't manage Discord, so
  flipping `pods.is_public` from the log/report page will change web visibility **without**
  creating/removing a Discord thread. Decide whether the post-draft visibility toggle should
  also touch Discord (likely not — the thread is a lobby concern) or whether this asymmetry is
  acceptable.
