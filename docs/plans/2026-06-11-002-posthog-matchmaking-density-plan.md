---
title: PostHog instrumentation for limited matchmaking density
type: feat
status: completed
date: 2026-06-11
---

# PostHog Matchmaking Density Plan

## Overview

We want to know whether Protect the Pod has enough active limited players reaching a playable deck state to justify first-party pairings and matchmaking. The current PostHog setup is good for broad product analytics, but it does not yet produce decision-grade density data for solo draft, solo sealed, group draft, group sealed, or play-page readiness.

The plan is to keep existing analytics events for continuity, add a unified limited-flow event contract across all four paths, instrument the play page actions that indicate real readiness to play, then build PostHog funnels and rolling-window density reports. After 2-4 weeks, the decision should be based on how many unique players reach the play page, how quickly they do it, and whether multiple compatible players are present in the same short time windows.

Implementation note: the code instrumentation, runbook, and PostHog dashboard
were created on 2026-06-12. The live dashboard is
[Limited Matchmaking Density](https://us.posthog.com/project/342068/dashboard/1702843).
No-code PostHog actions and funnels remain a post-deploy setup step because
PostHog requires the custom events to be observed before they are selectable in
the action builder.

## Problem Frame

Pageviews tell us that someone visited a route. Matchmaking needs a stronger signal:

1. Did the user create or join a solo/group limited flow?
2. Did the flow produce a playable pool/deck?
3. Did the user reach the play page?
4. Did they take an action that means "I am trying to play now"?
5. Were other compatible users active in the same time window, by format, set, and mode?

The answer must separate:

- `format`: `draft` vs `sealed`
- `mode`: `solo` vs `group`
- `source`: public pod, private invite, solo route, direct/shared deck link
- `readiness`: page view only vs copy/export/open-lobby/join-lobby/match-report behavior
- `time density`: rolling 5/15/30/60 minute windows, not just daily totals

## Current Collection

Current PostHog plumbing:

- `src/contexts/PostHogProvider.tsx` initializes `posthog-js`, manually captures `$pageview`, captures pageleave, and identifies logged-in users with `discord_username`, `is_admin`, and `is_beta_tester`.
- `src/hooks/useAnalytics.ts` exposes `trackEvent` and event constants.
- `docs/ANALYTICS.md` documents automatic pageviews and custom events.

Current useful custom events:

- `draft_created` from `app/draft/new/page.tsx` and `app/draft/solo/page.tsx`; solo draft adds `solo: true`.
- `sealed_pool_created` from `src/components/SealedPod.tsx` for generated/saved sealed pools.
- `deck_builder_opened`, `deck_builder_view_changed`, `deck_exported_json`, `deck_copied_json`, `deck_image_generated`, `pool_image_generated` from deck-builder surfaces.
- Other format creation events such as chaos draft/sealed, pack wars, pack blitz, and rotisserie.
- Membership events unrelated to matchmaking density.

Current non-PostHog play signal:

- `app/api/me/play-visit/route.ts` writes `deck_play_visits` for authenticated pool owners when they reach play pages. It is useful for personal stats, but it is not sufficient for matchmaking analysis because it excludes anonymous users, non-owner visitors, and action-level readiness, and it is not visible in PostHog funnels.

## Gap Analysis

| Need | Current state | Gap |
|---|---|---|
| Four comparable funnels | Route pageviews plus partial custom events | No unified `format/mode/source` taxonomy across solo draft, solo sealed, group draft, group sealed |
| Group sealed creation | `app/sealed/new/page.tsx` creates pods but does not emit a custom PH event | Group sealed creation cannot be compared to group draft creation |
| Join/start/complete lifecycle | Constants exist for draft joined/started/completed, but grep shows they are not emitted | We cannot measure lobby drop-off or time to playable deck |
| Public/private flow source | Public pod listing exists in `app/api/pods/public/route.ts`; invite copy exists in `DraftLobby` and `SealedPodLobby` | PH does not capture public list views, public pod joins, private invite copies, or visibility toggles |
| Deck readiness | `/api/pools/[shareId]/build` writes `built_decks` | PH does not get a canonical `limited_deck_built` event with flow context |
| Play page reach | `$pageview` and `deck_play_visits` | `$pageview` lacks route template, format/mode context, deck readiness, role, opponent/bye status, and pod/pool grouping; `deck_play_visits` is not in PH |
| Play-page actions | Some deck-builder export actions are tracked | Main play-page copy link, copy JSON, download JSON, Wayfinder actions, Karabast opens, practice hands, Discord post, chat, and match-report actions are not consistently tracked |
| Density windows | None | Need rolling unique-user counts by compatible segment |
| Decision dashboard | None | Need PH dashboards, funnels, cohorts/actions, and a documented threshold |
| Privacy | Current pageviews include full URLs with share IDs | New custom events should use route templates and hashed identifiers; do not send deck JSON, card lists, raw Discord handles, or raw private lobby URLs |

## Requirements Trace

| # | Requirement from request | Plan unit |
|---|---|---|
| R1 | Instrument solo draft path down to play page | U3, U4 |
| R2 | Instrument solo sealed path down to play page | U3, U4 |
| R3 | Instrument group draft path down to play page | U3, U4 |
| R4 | Instrument group sealed path down to play page | U3, U4 |
| R5 | Instrument play-page actions such as copying URL and JSON | U4 |
| R6 | Identify gap between existing PH and needed PH | Current Collection, Gap Analysis |
| R7 | Decide whether there is enough player density for matchmaking | U5, U6 |

## Event Contract

Keep existing events. Add the unified events below so all limited flows can be queried with one taxonomy.

| Event | When | Required properties |
|---|---|---|
| `limited_flow_started` | User selects/enters a limited path before object creation | `format`, `mode`, `surface`, `source_route`, `flow_id` |
| `limited_pod_created` | Group draft/sealed pod is created | `format`, `mode: group`, `set_code`, `is_public`, `competitive`, `max_players`, `pod_id_hash`, `flow_id` |
| `limited_pod_joined` | User joins a group draft/sealed pod | `format`, `mode: group`, `set_code`, `join_source`, `current_players`, `human_players`, `bot_players`, `pod_id_hash`, `flow_id` |
| `limited_pod_invite_copied` | Host/player copies the pod invite URL | `format`, `mode: group`, `is_public`, `current_players`, `pod_id_hash` |
| `limited_pod_started` | Host starts group draft/sealed | `format`, `mode: group`, `set_code`, `human_players`, `bot_players`, `pod_id_hash` |
| `limited_pod_completed` | Draft/sealed pod finishes and pools become available | `format`, `mode: group`, `set_code`, `duration_seconds`, `human_players`, `bot_players`, `pod_id_hash` |
| `limited_pool_created` | Solo sealed pool, solo draft pool, or group player pool is created | `format`, `mode`, `set_code`, `pack_count`, `pool_id_hash`, `pod_id_hash`, `flow_id` |
| `limited_deck_builder_opened` | User opens deck builder for a limited pool | `format`, `mode`, `set_code`, `source_route`, `pool_id_hash`, `pod_id_hash`, `flow_id` |
| `limited_deck_built` | `/api/pools/[shareId]/build` succeeds | `format`, `mode`, `set_code`, `deck_size`, `sideboard_size`, `has_leader`, `has_base`, `pool_id_hash`, `pod_id_hash` |
| `limited_play_page_viewed` | Main play page loads enough pool context to know what it is | `format`, `mode`, `set_code`, `user_role`, `is_owner`, `deck_ready`, `has_opponent`, `has_bye`, `wayfinder_detected`, `pool_id_hash`, `pod_id_hash`, `flow_id` |
| `limited_play_action_used` | User performs a play-page action | `format`, `mode`, `set_code`, `action`, `success`, `target`, `deck_size`, `pool_id_hash`, `pod_id_hash`, `flow_id` |
| `limited_match_result_reported` | Competitive practice result is submitted/confirmed | `format`, `mode: group`, `set_code`, `round_number`, `match_id_hash`, `pod_id_hash`, `result_source` |

`limited_play_action_used.action` values:

- `copy_deck_link`
- `copy_deck_json`
- `download_deck_json`
- `generate_deck_image`
- `generate_pool_image`
- `open_karabast`
- `wayfinder_create_private_lobby`
- `wayfinder_create_public_lobby`
- `wayfinder_join_private_lobby`
- `wayfinder_join_public_game`
- `post_to_discord`
- `chat_open`
- `chat_send`
- `practice_hand_draw`
- `match_report_open`
- `match_result_submit`

Shared property rules:

- Use `format: draft | sealed`.
- Use `mode: solo | group`.
- Use stable `flow_id` generated client-side per limited attempt and stored in session storage until play-page arrival.
- Use hashed identifiers for `pod_id_hash`, `pool_id_hash`, `match_id_hash`; do not send raw share IDs.
- Use `route_template` or `source_route` such as `/pool/[shareId]/deck/play`, not raw URLs with share IDs.
- Do not send deck JSON, card lists, Discord usernames, private lobby URLs, or private invite URLs.

## Decision Metrics

Primary metric:

- `play_ready_users`: unique users who fire `limited_play_page_viewed` followed by at least one readiness action within 30 minutes.

Readiness actions:

- Strong: `wayfinder_create_public_lobby`, `wayfinder_create_private_lobby`, `wayfinder_join_private_lobby`, `wayfinder_join_public_game`, `open_karabast`, `match_result_submit`.
- Medium: `copy_deck_link`, `copy_deck_json`, `download_deck_json`, `post_to_discord`, `chat_send`.
- Weak: `practice_hand_draw`, `generate_deck_image`, `generate_pool_image`.

Density metrics:

- Unique play-page users per day by `format`, `mode`, `set_code`.
- Unique readiness-action users per day by `format`, `mode`, `set_code`.
- Rolling 5/15/30/60 minute unique readiness-action users by compatible segment.
- For group pods: percent of human players in a pod who reach play page within 15 minutes of `limited_pod_completed`.
- Time-to-play: `limited_flow_started` -> `limited_play_page_viewed` p50/p75/p90 by path.
- Play-page action conversion: `limited_play_page_viewed` -> strong/medium readiness action.
- Repeat intent: users with 2+ play-ready sessions in 7 days.

Initial decision thresholds:

- **Green for first-party live matchmaking:** In the current/recent set segment, at least 10 of the last 14 days have 3+ unique play-ready users in the same `format` within a rolling 20-minute window, and p75 time from play-page view to readiness action is under 10 minutes.
- **Green for pod-integrated pairings first:** At least 30% of completed group pods have 2+ human players reach play page within 15 minutes of completion, and at least 50% of those players fire a medium/strong readiness action.
- **Yellow for async/scheduled matching:** Daily play-page volume is healthy, but rolling-window overlap is sparse. Build lightweight "looking for game" or Discord handoff before a real-time queue.
- **Red/no-go for matchmaking:** Fewer than 2 compatible play-ready users overlap in rolling 30-minute windows on most days, or play-page action conversion is below 20%.

## Implementation Units

### U1. Event taxonomy and property helpers

**Goal:** Define one source of truth for event names and limited-flow properties.

**Files:**

- Modify: `src/hooks/useAnalytics.ts`
- Create: `src/analytics/limitedEvents.ts`
- Create: `src/analytics/limitedEvents.test.ts`
- Modify: `docs/ANALYTICS.md`

**Approach:**

- Add event constants for the `limited_*` contract.
- Add a `buildLimitedContext()` helper that normalizes `format`, `mode`, route template, set code, role, public/private state, and hashed IDs.
- Add `hashAnalyticsId()` using a stable one-way hash for share IDs before sending to PH.
- Keep existing events for backward compatibility.

**Test scenarios:**

- Hash helper returns stable hashes and never returns the raw share ID.
- Context builder rejects or normalizes invalid `format`/`mode` values.
- Context builder emits route templates rather than raw URLs.
- Existing event constants remain available.

### U2. Server-side PostHog capture

**Goal:** Capture authoritative lifecycle events from API routes, not only client-click events.

**Files:**

- Create: `lib/posthog.ts`
- Create: `lib/posthog.test.ts`
- Modify: `docs/ANALYTICS.md`
- Modify: `.env.example` if present

**Approach:**

- Add a small server capture helper that no-ops when `NEXT_PUBLIC_POSTHOG_KEY` is missing.
- Use PostHog's capture endpoint or the Node SDK. Prefer the smallest dependency-free fetch wrapper unless batching becomes necessary.
- Use logged-in `user.id` as `distinct_id` for authenticated server events.
- For unauthenticated flows, rely on client events unless a safe anonymous distinct ID is already available.
- Add `captureLimitedServerEvent(event, distinctId, properties)` and keep failures non-blocking.

**Test scenarios:**

- No env key means no network call.
- With env key, helper posts event, distinct ID, and properties to the configured host.
- Capture failures are swallowed/logged and never fail the user action.
- Helper does not include raw share IDs when passed limited context.

### U3. Instrument creation, lobby, join, start, complete, and build lifecycle

**Goal:** Make the four paths comparable from start to deck-built state.

**Files:**

- Modify: `app/draft/solo/page.tsx`
- Modify: `app/draft/new/page.tsx`
- Modify: `app/sealed/page.tsx`
- Modify: `app/sealed/new/page.tsx`
- Modify: `src/components/SealedPod.tsx`
- Modify: `src/components/DraftLobby.tsx`
- Modify: `src/components/SealedPodLobby.tsx`
- Modify: `app/api/draft/route.ts`
- Modify: `app/api/draft/[shareId]/join/route.ts`
- Modify: `app/api/draft/[shareId]/start/route.ts`
- Modify: `src/utils/draftAdvance.ts`
- Modify: `app/api/sealed/route.ts`
- Modify: `app/api/sealed/[shareId]/join/route.ts`
- Modify: `app/api/sealed/[shareId]/start/route.ts`
- Modify: `app/api/pools/[shareId]/build/route.ts`

**Approach:**

- Client emits `limited_flow_started` when a user chooses solo draft, solo sealed, group draft, or group sealed.
- Server emits `limited_pod_created`, `limited_pod_joined`, `limited_pod_started`, and `limited_pod_completed` from authoritative endpoints.
- Solo pool creation emits `limited_pool_created` alongside existing `sealed_pool_created` / `draft_created` behavior.
- Lobby invite buttons emit `limited_pod_invite_copied`.
- `/api/pools/[shareId]/build` emits `limited_deck_built` after successful built-deck upsert.

**Test scenarios:**

- Draft create route captures `limited_pod_created` with `format=draft`, `mode=group`, public/private, competitive, max players.
- Sealed create route captures `limited_pod_created` with `format=sealed`, `mode=group`.
- Join routes capture current player counts and join source where known.
- Start routes capture human/bot counts.
- Draft completion captures duration and player counts once, not on repeated polling.
- Build route captures `limited_deck_built` only after successful upsert.

### U4. Instrument play page and play-page actions

**Goal:** Convert "made it to play" into "arrived and attempted to play" signals.

**Files:**

- Modify: `app/pool/[shareId]/deck/play/page.tsx`
- Modify: `src/components/PlayInstructions.tsx`
- Modify: `app/draft/[shareId]/pod/page.tsx`
- Modify: `app/sealed/[shareId]/pod/page.tsx`
- Modify: `src/hooks/useDeckExport.ts`
- Modify: `src/components/ChatPanel.tsx`
- Modify: `src/components/MatchmakingPanel.tsx`
- Modify: `docs/ANALYTICS.md`

**Approach:**

- Emit `limited_play_page_viewed` only after `loadPool()` succeeds and the page knows `poolType`, `setCode`, owner role, draft/pod relationship, and Wayfinder detection.
- Deduplicate per `pool_id_hash` + session so refreshes do not inflate arrivals; keep raw `$pageview` untouched for ordinary web analytics.
- Wrap `PlayInstructions` actions so copy link, copy JSON, download, deck image, Wayfinder create/join, and Karabast opens emit `limited_play_action_used`.
- Track success/failure for clipboard, download, Discord post, and match-result submit.
- Track pod summary page actions too, because group players may play from `app/draft/[shareId]/pod/page.tsx` or `app/sealed/[shareId]/pod/page.tsx` without visiting the main play page first.
- Do not send private lobby URLs or deck JSON.

**Test scenarios:**

- Play page emits one `limited_play_page_viewed` after pool load, with `format`, `mode`, `set_code`, `deck_ready`, and hashed IDs.
- Copy deck link emits `limited_play_action_used` with `action=copy_deck_link` and `success=true`.
- Copy JSON emits `action=copy_deck_json` after clipboard success and does not include JSON content.
- Wayfinder create private/public emits distinct action values.
- Invalid private lobby URL emits no join action or emits `success=false` without the URL.
- Match result submit emits a server-backed result event only after a successful response.

### U5. PostHog schema, actions, funnels, and dashboards

**Goal:** Make the data easy to read in PH without relying on ad hoc event searches.

**Files:**

- Modify: `docs/ANALYTICS.md`
- Create: `docs/analytics/matchmaking-density.md`

**PostHog setup:**

- In Data Management, define event schemas for all `limited_*` events.
- Create a reusable property group named `limited_flow_context` with `format`, `mode`, `set_code`, `flow_id`, `pod_id_hash`, `pool_id_hash`, `route_template`, `source_route`, `is_public`, `competitive`, `human_players`, `bot_players`, `user_role`.
- Create PH actions:
  - `Limited - reached play page`: `limited_play_page_viewed`
  - `Limited - strong play intent`: `limited_play_action_used` where `action` is one of the strong readiness actions
  - `Limited - medium play intent`: `limited_play_action_used` where `action` is one of the medium readiness actions
  - `Limited - play ready`: strong or medium play intent
- Create four funnels:
  - Solo sealed: flow started -> pool created -> deck builder opened -> deck built -> play page viewed -> play ready
  - Solo draft: flow started -> draft created -> pod completed -> pool created -> deck builder opened -> deck built -> play page viewed -> play ready
  - Group draft: pod created/joined -> pod started -> pod completed -> deck built -> play page viewed -> play ready
  - Group sealed: pod created/joined -> pod started -> pool created -> deck built -> play page viewed -> play ready
- Add breakdowns by `set_code`, `is_current_set`, `source`, device type, and logged-in/anonymous where available.
- Add dashboard tiles:
  - Daily play-page users by format/mode
  - Daily play-ready users by format/mode
  - Play-page-to-ready conversion
  - Median and p75 time from flow started to play page
  - Group pod "2+ players ready within 15 minutes" rate
  - Top drop-off step per funnel

**Test scenarios:**

- PH Live Events shows each event with the expected schema during staging smoke test.
- Dynamic URLs are analyzed through `route_template`, not raw `$current_url` share IDs.
- Dashboard can answer "how many draft players were play-ready in the last 7 days?" without manual filtering.

### U6. Rolling-window density analysis and decision report

**Goal:** Convert collected events into a go/no-go recommendation for matchmaking.

**Files:**

- Create: `docs/analytics/matchmaking-density.md`
- Optional create: `scripts/analytics/matchmaking-density.sql` if using exported PH/HogQL results outside PH

**Approach:**

- After instrumentation is live, collect 2 weeks minimum, 4 weeks preferred.
- Use PostHog HogQL or exported events to compute rolling 5/15/30/60 minute unique play-ready users by `format`, `mode`, `set_code`, and `is_current_set`.
- Separately compute group-pod readiness: for each `pod_id_hash`, count human players reaching play page and firing readiness actions within 15 minutes of `limited_pod_completed`.
- Write a short decision report using the thresholds in this plan.

**Test scenarios:**

- Query counts unique users, not raw event count.
- Repeat actions from one user in the same pool count once per window.
- Group-pod query excludes bots and byes where possible.
- Report identifies whether the best first product is live matchmaking, pod-integrated pairings, async/scheduled matching, or no-go.

## Rollout Plan

1. **Day 0:** Add event contract, server capture helper, and PH schema definitions.
2. **Day 1-2:** Instrument lifecycle endpoints and lobby invite/public-pod surfaces.
3. **Day 2-3:** Instrument play page and action-level readiness.
4. **Day 3:** Smoke-test staging/live events in PostHog; verify no raw share IDs, deck JSON, or private lobby URLs are sent.
5. **Day 4:** Publish PH dashboard and internal `docs/analytics/matchmaking-density.md`.
6. **Weeks 1-2:** Collect data; watch daily for missing properties and event volume anomalies.
7. **Week 2:** Make an initial decision. If borderline, continue to Week 4 before committing to first-party matchmaking.

## Risks

| Risk | Mitigation |
|---|---|
| Client-side events are blocked by ad blockers | Put lifecycle and deck-built events on server routes; use client only for UI actions that the server cannot see |
| Autocapture creates noisy false positives | Use explicit `limited_*` events for decision metrics; autocapture remains secondary/debug data |
| Existing pageviews expose raw share IDs | New decision dashboards use `route_template` and hashed identifiers; consider PostHog path cleaning separately |
| Event volume/cost grows | Use one `limited_play_action_used` event with an `action` property rather than one event per button; avoid high-frequency events |
| Analytics changes alter behavior | First pass instruments existing actions only; avoid adding a matchmaking CTA until baseline density is measured |
| Server and client events duplicate lifecycle steps | Server owns authoritative lifecycle events; client owns UI-intent events |

## Definition of Done

- All four limited paths emit comparable `limited_*` events from flow start to play-page readiness.
- Main play page and pod summary play surfaces emit copy/export/Wayfinder/Karabast/chat/match-report action events.
- PH has event schemas, actions, funnels, and a matchmaking-density dashboard.
- Staging smoke test confirms event properties are present and privacy rules are honored.
- A decision report can answer:
  - How many users reach play page by path?
  - How many become play-ready?
  - How often do 2+ compatible play-ready users overlap in 15/30 minute windows?
  - Whether to build live matchmaking, pod-integrated pairings, async matching, or nothing yet.
