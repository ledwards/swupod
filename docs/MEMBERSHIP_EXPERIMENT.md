# Membership Pricing Experiment — 2026

Source plan: `docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md`

This doc tracks the baseline metrics, hypotheses, and rollback criteria for
the simultaneous launch of (a) the Patreon tier raise to $9/month and
(b) three new sub-conversion surfaces — set-picker teaser, homepage
banner, and pod-marketing banner. Capture the **Pre-raise baseline**
section below BEFORE U1 effective date so we have a reference point.

---

## Hypothesis

Raising the monthly tier price to $9 simultaneously with new conversion
surfaces will:

1. **Increase net new monthly subs** vs. the pre-raise baseline. The new
   surfaces should compensate for any price-elasticity drag from the
   raise.
2. **Not materially churn existing patrons.** Patreon's native
   grandfathering preserves their current rate; the snapshot in U0
   provides defensive evidence if any patron disputes their charge.
3. **Not erode pod-creation behavior.** The soft-gate (banner, not
   modal) on pod join should not deter sub-hosts from inviting non-sub
   friends to ASH pods.

We are explicitly accepting attribution loss between the raise and the
surfaces — the user opted to ship simultaneously rather than stagger.

---

## Pre-raise baseline (capture before U1 effective date)

Fill these in by running `scripts/diagnose-patreon.ts` against production
and checking the Patreon creator dashboard.

```
Date captured:           [YYYY-MM-DD]
Total active patrons:    [N]
Trailing 30d new subs:   [N]
Trailing 30d churn:      [N]
6-month sub-count trend: [N → N → N → N → N → N]
Existing pledge prices:  [counts by tier amount, from patreon_pledge_snapshot]
```

Also note any external context: pending ASH announcement, recent product
launches, holiday/event timing.

---

## Tracked events (PostHog)

All events emit through `src/hooks/useAnalytics.ts`. See
`AnalyticsEvents.SUBSCRIBE_CTA_SHOWN` and
`AnalyticsEvents.SUBSCRIBE_CTA_CLICKED`.

| Event | Surface tag | When |
|-------|-------------|------|
| `subscribe_cta_shown` | `setPreview` | "Coming Soon" teaser card rendered for a non-sub (or patron-no-beta) on any set picker |
| `subscribe_cta_shown` | `homepageBanner` | Non-sub or patron-no-beta promo banner rendered above ReleaseNotes |
| `subscribe_cta_shown` | `lockInBanner` | Lock-in-window banner rendered during the 5–7 day announcement window |
| `subscribe_cta_shown` | `podBanner` | Non-sub joins a draft/sealed pod whose set is upcoming |
| `subscribe_cta_shown` (modal) | any surface tag | SubscribeModal opens (user clicked a surface CTA) |
| `subscribe_cta_clicked` | `podBanner` | User clicked the banner's Subscribe button (step: banner_to_modal) |
| `subscribe_cta_clicked` | any surface tag | User clicked the Patreon link inside the SubscribeModal |

Payload includes `setCode` when available so we can break down conversion
per set (e.g., ASH-specific funnel during its window).

---

## Conversion funnel — measure weekly for first 8 weeks

```
Surface shown  →  Modal opened  →  Patreon link clicked  →  New sub created
              ▲                  ▲                        ▲
              │                  │                        │
       cta_shown(surface)   cta_shown(surface)    cta_clicked(surface,
       (banner/teaser)      (from modal)           via Patreon link)
```

We can compute per-surface conversion as:

```
modal_open_rate    = cta_shown@modal / cta_shown@surface
patreon_click_rate = cta_clicked@patreon / cta_shown@modal
surface_conversion = cta_clicked@patreon / cta_shown@surface
```

Sub creation itself is tracked on Patreon's side; reconcile by counting
new active patrons within N days of a `cta_clicked` event from the same
user (when available).

---

## Rollback criteria

These thresholds are tripwires, not autopilot — every rollback requires
explicit user judgment, but the measurement makes the decision evidence-
based instead of vibe-based.

### Hard rollback (revert Patreon tier price to old rate)

- **Trigger:** Net-new monthly sub count at **day 30 post-raise** is
  more than **30% below** the 6-month trailing average baseline.
- **Action:** Lower the Patreon tier amount back to the old price.
  Document the reversal date. New subs after reversal pay the old rate.
  Grandfathered patrons unaffected (they were already at the old rate).
- **Why 30%:** lower than this is normal noise; higher than this likely
  reflects real elasticity damage.

### Soft revisit (consider surface adjustments)

- **Trigger:** Conversion rate from `cta_shown@surface` →
  `cta_clicked@patreon` is below **0.5%** across all surfaces at
  **day 14 post-launch**.
- **Action:** Review each surface independently. If one surface is
  pulling the average down, consider removing it. Check copy, placement,
  and frequency-capping logic.

### Per-surface kill-switch

- **Trigger:** Any single surface shows **zero** Patreon click-through
  events at **day 30 post-launch**.
- **Action:** Remove the surface. Document the reason.

### Patron churn signal

- **Trigger:** **Weekly churn count > 2× baseline** at any point in the
  first 8 weeks.
- **Action:** Investigate. Reach out to recently-cancelled patrons via
  Discord. Likely indicates either bad announcement copy or real
  price-anchoring concern.

---

## Weekly review cadence

For the **first 8 weeks** after U1 effective date:

- **Monday morning:** pull the previous 7 days of PostHog events,
  cross-reference against Patreon's creator dashboard. Update the
  rolling counts in the appendix below.
- **Slack/Discord update:** one-line status to the team channel.
- **Decision point at week 4** and **week 8:** review against rollback
  criteria. Document the decision (continue / adjust / rollback) here.

After week 8, transition to monthly review.

---

## Appendix — running log

Fill this in starting at U1 effective date.

```
| Week | Date       | New subs | Churn | shown@homepage | shown@setPreview | shown@podBanner | shown@lockIn | clicked@patreon | Notes |
|------|------------|----------|-------|----------------|------------------|-----------------|--------------|-----------------|-------|
| 0    | [pre-raise]| —        | —     | —              | —                | —               | —            | —               | baseline |
| 1    |            |          |       |                |                  |                 |              |                 |       |
| 2    |            |          |       |                |                  |                 |              |                 |       |
| 3    |            |          |       |                |                  |                 |              |                 |       |
| 4    |            |          |       |                |                  |                 |              |                 | DECISION POINT |
| 5    |            |          |       |                |                  |                 |              |                 |       |
| 6    |            |          |       |                |                  |                 |              |                 |       |
| 7    |            |          |       |                |                  |                 |              |                 |       |
| 8    |            |          |       |                |                  |                 |              |                 | DECISION POINT |
```

---

## Operational checklist (before U1 ships)

- [ ] **Baseline captured** in the section above
- [ ] **`patreon_pledge_snapshot` populated** via
      `railway run -e production npx tsx scripts/snapshot-patrons.ts`
- [ ] **Official Patreon-Discord integration enabled** in the Patreon
      dashboard as a daily-sync fallback for our real-time webhook
- [ ] **PostHog key present** (`NEXT_PUBLIC_POSTHOG_KEY`) and verified
      that `subscribe_cta_shown` events land in PostHog from a staging
      session
- [ ] **`LOCK_IN_WINDOW_END_DATE` set** in `src/utils/membership.ts`
- [ ] **`scripts/sync-patrons-cron.ts` scheduled** in Railway Cron Jobs
      (weekly, e.g., Sunday 03:00 UTC)
- [ ] **Patreon post + Discord announcement** drafted and ready to
      publish on the announcement date
- [ ] **Test pledge** on a secondary account confirmed bills at the OLD
      price after a full billing cycle post-raise (or risk acceptance
      documented if skipped)
