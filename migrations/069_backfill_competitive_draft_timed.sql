-- Migration 069: turn the round timer ON for in-progress competitive drafts.
--
-- Regression: competitive drafts were created with `timed = false` (the draft
-- creation INSERT hard-coded it), and the in-draft host timer controls are
-- hidden for competitive drafts — so the round timer could never be enabled and
-- never appeared. New drafts are fixed in code (defaultRoundTimerEnabled), and
-- this backfills the timer ON for competitive drafts that are still in progress
-- so their players see the timer immediately.
--
-- Idempotent: only flips rows that are competitive, not already timed, and still
-- waiting/active. Completed drafts are left alone (no timer is shown there).
-- Table was draft_pods before migration 037 renamed it to `pods`.
UPDATE pods
SET timed = true
WHERE competitive = true
  AND timed IS DISTINCT FROM true
  AND status IN ('waiting', 'active');
