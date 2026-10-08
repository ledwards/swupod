# Analytics (PostHog)

Protect the Pod uses [PostHog](https://posthog.com) for product analytics to understand how users interact with the app.

## Setup

1. Create a PostHog account at https://app.posthog.com
2. Get your Project API Key from Project Settings
3. Add environment variables:

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_your_key_here
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Optional server-side capture. Defaults to the public values above.
POSTHOG_KEY=phc_your_key_here
POSTHOG_HOST=https://us.i.posthog.com
```

Leave `NEXT_PUBLIC_POSTHOG_KEY` blank to disable client analytics. Leave both
`POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_KEY` blank to disable server capture.

## What's Tracked

### Automatic (PostHog built-in)
- **Page views** - Every route change
- **Device info** - Mobile/Desktop/Tablet, screen size
- **Browser** - Chrome, Safari, Firefox, etc.
- **OS** - iOS, Android, Windows, macOS, etc.
- **Referrer** - Where users came from

### User Identification
- Logged-in users are identified by their user ID
- Properties: `discord_username`, `is_admin`, `is_beta_tester`
- Anonymous users are tracked per-session without a persistent profile

### Custom Events

| Event | Properties | When |
|-------|------------|------|
| `user_signed_in` | `is_beta_tester`, `is_admin` | User logs in via Discord |
| `user_signed_out` | - | User logs out |
| `beta_enrolled` | - | User enrolls in beta program |
| `sealed_pool_created` | `set_code`, `pack_count`, `card_count` | New sealed pool generated |
| `draft_created` | `set_code` | New draft pod created |
| `chaos_sealed_created` | `set_codes`, `unique_sets`, `pack_count` | Chaos sealed pool created |
| `chaos_draft_created` | `set_codes`, `unique_sets` | Chaos draft created |
| `pack_wars_created` | `set_code` | Pack wars game created |
| `pack_blitz_created` | `set_code` | Pack blitz game created |
| `rotisserie_created` | - | Rotisserie draft created |
| `deck_builder_opened` | `set_code`, `pool_type`, `view_mode` | User opens deck builder |
| `deck_builder_view_changed` | `from_view`, `to_view`, `set_code`, `pool_type` | User switches view mode |
| `deck_exported_json` | `set_code`, `pool_type`, `deck_size`, `sideboard_size` | Deck exported as JSON file |
| `deck_copied_json` | `set_code`, `pool_type`, `deck_size`, `sideboard_size` | Deck JSON copied to clipboard |
| `deck_image_generated` | `set_code`, `pool_type`, `deck_size`, `sideboard_size` | Deck image created |
| `pool_image_generated` | `set_code`, `pool_type`, `deck_size`, `pool_size`, `other_leaders`, `other_bases` | Full pool image created |

### Limited Matchmaking-Density Events

These events answer whether enough limited players reach play-ready state to
justify first-party pairings or matchmaking. They are normalized across solo
draft, solo sealed, group draft, and group sealed.

| Event | Key properties | When |
|-------|----------------|------|
| `limited_flow_started` | `format`, `mode`, `surface`, `flow_id` | User starts a limited path |
| `limited_pod_created` | `format`, `mode`, `set_code`, `is_public`, `competitive`, `pod_id_hash` | Draft/sealed pod is created |
| `limited_pod_joined` | `format`, `mode`, `join_source`, `current_players`, `pod_id_hash` | Player joins a pod |
| `limited_pod_invite_copied` | `format`, `mode`, `is_public`, `pod_id_hash` | Pod invite URL is copied |
| `limited_pod_started` | `format`, `mode`, `human_players`, `bot_players`, `pod_id_hash` | Pod starts |
| `limited_pod_completed` | `format`, `mode`, `duration_seconds`, `pod_id_hash` | Pod finishes and pools are available |
| `limited_pool_created` | `format`, `mode`, `set_code`, `pack_count`, `pool_id_hash` | Solo or pod pool is created |
| `limited_deck_builder_opened` | `format`, `mode`, `set_code`, `view_mode`, `pool_id_hash` | Limited deck builder opens |
| `limited_deck_built` | `format`, `mode`, `deck_size`, `sideboard_size`, `pool_id_hash` | Built deck is recorded server-side |
| `limited_play_page_viewed` | `format`, `mode`, `user_role`, `deck_ready`, `has_opponent`, `pool_id_hash` | Play page or completed pod play surface loads |
| `limited_play_action_used` | `format`, `mode`, `action`, `success`, `target`, `pool_id_hash` | User takes a play-readiness action |
| `limited_match_result_reported` | `format`, `mode`, `round_number`, `match_id_hash`, `pod_id_hash` | Competitive match result is recorded server-side |

`limited_play_action_used.action` includes:

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

See `docs/analytics/matchmaking-density.md` for the PostHog actions, funnels,
dashboard tiles, and decision thresholds. The live PostHog dashboard is
[Limited Matchmaking Density](https://us.posthog.com/project/342068/dashboard/1702843).

## Usage in Code

### In React Components

```typescript
import { useAnalytics, AnalyticsEvents } from '@/src/hooks/useAnalytics'

function MyComponent() {
  const { track } = useAnalytics()

  const handleAction = () => {
    track(AnalyticsEvents.SEALED_POOL_CREATED, {
      set_code: 'LAW',
      pack_count: 6,
    })
  }
}
```

### Outside React (callbacks, utilities)

```typescript
import { trackEvent, AnalyticsEvents } from '@/src/hooks/useAnalytics'

trackEvent(AnalyticsEvents.USER_SIGNED_IN, { is_beta_tester: true })
```

## Architecture

- `src/contexts/PostHogProvider.tsx` - Provider component, initializes PostHog
- `src/hooks/useAnalytics.ts` - Hook and standalone function for tracking
- `src/analytics/limitedEvents.ts` - Limited event vocabulary, format/mode normalization, route templating, and hashed ID helpers
- `lib/posthog.ts` - Server-side PostHog capture helper for authoritative lifecycle events
- `app/layout.tsx` - Provider wrapped around the app

## Privacy

- Uses `person_profiles: 'identified_only'` - only creates user profiles for logged-in users
- Anonymous visitors get pageviews tracked but no persistent profile
- Limited custom events use `route_template` and hashed pool/pod/match IDs instead
  of raw share IDs.
- Limited custom events must not send deck JSON, card lists, raw private lobby
  URLs, raw invite URLs, or Discord usernames.
- No cookie consent banner (acceptable risk for hobby project)
