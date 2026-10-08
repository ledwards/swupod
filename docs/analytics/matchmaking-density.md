# Matchmaking Density Analytics

This runbook turns the `limited_*` event stream into a decision about whether
Protect the Pod has enough limited players for first-party pairings or
matchmaking.

## Goal

Answer these questions for solo draft, solo sealed, group draft, and group
sealed:

- How many users reach a playable deck state?
- How many users take a play-readiness action?
- How often do compatible users overlap in the same short time window?
- Is the right next product live matchmaking, pod-integrated pairings,
  async/scheduled matching, or no matchmaking yet?

## Event Sources

Server-owned lifecycle events:

- `limited_pod_created`
- `limited_pod_joined`
- `limited_pod_started`
- `limited_pod_completed`
- `limited_pool_created`
- `limited_deck_built`
- `limited_match_result_reported`

Client-owned intent events:

- `limited_flow_started`
- `limited_pod_invite_copied`
- `limited_deck_builder_opened`
- `limited_play_page_viewed`
- `limited_play_action_used`

The decision dashboards should use `format`, `mode`, `set_code`,
`route_template`, `flow_id`, `pod_id_hash`, `pool_id_hash`, and `action`.
Do not analyze raw `$current_url` for this work because pageviews can contain
share IDs.

## PostHog Setup

Dashboard:

- [Limited Matchmaking Density](https://us.posthog.com/project/342068/dashboard/1702843)

Create event definitions for all `limited_*` events in PostHog Data Management.
Mark these properties as expected on the relevant events:

- `format`: `draft` or `sealed`
- `mode`: `solo` or `group`
- `set_code`
- `flow_id`
- `route_template`
- `source_route`
- `pod_id_hash`
- `pool_id_hash`
- `match_id_hash`
- `is_public`
- `competitive`
- `current_players`
- `human_players`
- `bot_players`
- `user_role`
- `is_owner`
- `has_opponent`
- `has_bye`
- `deck_ready`
- `wayfinder_detected`
- `action`
- `success`
- `target`

Create PostHog actions:

| Action | Definition |
|--------|------------|
| `Limited - reached play page` | Event is `limited_play_page_viewed` |
| `Limited - strong play intent` | Event is `limited_play_action_used` and `action` is `wayfinder_create_public_lobby`, `wayfinder_create_private_lobby`, `wayfinder_join_private_lobby`, `wayfinder_join_public_game`, `open_karabast`, or `match_result_submit` |
| `Limited - medium play intent` | Event is `limited_play_action_used` and `action` is `copy_deck_link`, `copy_deck_json`, `download_deck_json`, `post_to_discord`, or `chat_send` |
| `Limited - play ready` | Strong or medium play intent |

Create four funnels with breakdowns by `set_code` and device type:

| Funnel | Steps |
|--------|-------|
| Solo sealed | `limited_flow_started` -> `limited_pool_created` -> `limited_deck_builder_opened` -> `limited_deck_built` -> `limited_play_page_viewed` -> `Limited - play ready` |
| Solo draft | `limited_flow_started` -> `limited_pod_created` -> `limited_pod_completed` -> `limited_pool_created` -> `limited_deck_builder_opened` -> `limited_deck_built` -> `limited_play_page_viewed` -> `Limited - play ready` |
| Group draft | `limited_pod_created` or `limited_pod_joined` -> `limited_pod_started` -> `limited_pod_completed` -> `limited_deck_built` -> `limited_play_page_viewed` -> `Limited - play ready` |
| Group sealed | `limited_pod_created` or `limited_pod_joined` -> `limited_pod_started` -> `limited_pool_created` -> `limited_deck_built` -> `limited_play_page_viewed` -> `Limited - play ready` |

Create dashboard tiles:

- Daily `limited_play_page_viewed` users by `format` and `mode`
- Daily limited flow counts for start, submitted deck, play page, and ready users
- Daily play-ready users by `format`, `mode`, and `set_code`
- 30-minute play-ready density by `format`, `mode`, and `set_code`
- Play-ready action mix by action
- Play-page-to-ready conversion by `format`, `mode`, and `set_code`
- p50/p75 time from `limited_flow_started` to `limited_play_page_viewed`
- p50/p75 time from `limited_play_page_viewed` to `Limited - play ready`
- Group pod rate where 2+ humans reach play page within 15 minutes of
  `limited_pod_completed`
- Drop-off by funnel step

The dashboard currently contains the first five SQL-backed tiles above plus a
Markdown setup card. The no-code PostHog actions and funnels should be created
after the first production `limited_*` events arrive. During initial setup,
PostHog only offered already-observed events in the action builder, so avoid
sending synthetic events unless they are explicitly marked `setup_only = true`
and filtered out of every decision tile.

## Density Query

Use HogQL or event export to count unique play-ready users in rolling windows.
The exact PostHog table/column names can vary by deployment, but the query shape
should be:

```sql
WITH ready AS (
  SELECT
    person_id,
    timestamp,
    properties.format AS format,
    properties.mode AS mode,
    properties.set_code AS set_code
  FROM events
  WHERE event = 'limited_play_action_used'
    AND properties.action IN (
      'wayfinder_create_public_lobby',
      'wayfinder_create_private_lobby',
      'wayfinder_join_private_lobby',
      'wayfinder_join_public_game',
      'open_karabast',
      'match_result_submit',
      'copy_deck_link',
      'copy_deck_json',
      'download_deck_json',
      'post_to_discord',
      'chat_send'
    )
)
SELECT
  anchor.timestamp AS window_start,
  anchor.format,
  anchor.mode,
  anchor.set_code,
  uniq(ready.person_id) AS ready_users_30m
FROM ready AS anchor
JOIN ready
  ON ready.timestamp >= anchor.timestamp
 AND ready.timestamp < anchor.timestamp + INTERVAL 30 MINUTE
 AND ready.format = anchor.format
 AND ready.mode = anchor.mode
 AND ready.set_code = anchor.set_code
GROUP BY window_start, format, mode, set_code
ORDER BY ready_users_30m DESC;
```

Run the same shape for 5, 15, 30, and 60 minute windows.

## Decision Thresholds

Green for first-party live matchmaking:

- In the current or recent-set segment, at least 10 of the last 14 days have 3+
  unique play-ready users in the same `format` within a rolling 20-minute
  window.
- p75 from play-page view to readiness action is under 10 minutes.

Green for pod-integrated pairings first:

- At least 30% of completed group pods have 2+ human players reach play page
  within 15 minutes of completion.
- At least 50% of those players fire a medium or strong readiness action.

Yellow for async/scheduled matching:

- Daily play-page volume is healthy, but rolling-window overlap is sparse.
- Build a lighter "looking for game" or Discord handoff before a real-time
  queue.

Red/no-go:

- Fewer than 2 compatible play-ready users overlap in rolling 30-minute windows
  on most days.
- Play-page-to-ready conversion is below 20%.

## Smoke Test Checklist

- Create one solo sealed pool and reach `/pool/[shareId]/deck/play`.
- Create one solo draft, complete it, build a deck, and reach a play surface.
- Create one group draft, join with a second user, start/complete, and reach the
  pod play surface.
- Create one group sealed pod, start it, build a deck, and reach the pod play
  surface.
- On a play surface, copy link, copy JSON, download JSON, open Karabast, use a
  Wayfinder action if available, draw a practice hand, and send a chat message.
- Confirm Live Events show only `route_template`, hashed IDs, and no raw share
  IDs, deck JSON, private lobby URLs, or invite URLs.

## Reporting Cadence

Collect at least 2 weeks of data, with 4 weeks preferred if the first read is
borderline. The decision report should include:

- Funnel conversion for each of the four paths.
- Daily and rolling-window play-ready users.
- Best-performing `format` and `mode` segment.
- Group pod readiness within 15 minutes of completion.
- Recommendation: live matchmaking, pod-integrated pairings, async/scheduled
  matching, or no-go.
