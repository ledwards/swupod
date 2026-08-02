// @ts-nocheck
// src/utils/setConfigs/latest.ts
import { SET_CONFIGS, isReleased, getSetConfig } from './index'

/**
 * Returns the set code with the highest setNumber among all released sets.
 * Used to determine whether to use Karabast Card Pool "Current" or "Unlimited".
 */
export function getLatestReleasedSetCode(now: Date = new Date()): string {
  const released = Object.values(SET_CONFIGS).filter(c => isReleased(c, now))
  if (released.length === 0) {
    return Object.values(SET_CONFIGS)
      .sort((a, b) => b.setNumber - a.setNumber)[0].setCode as string
  }
  return released.sort((a, b) => b.setNumber - a.setNumber)[0].setCode as string
}

/**
 * Sets currently legal in SWU Premier → Karabast "Current" pool.
 *
 * DERIVED, never hand-maintained. This used to be a literal list, which meant
 * every release silently made the app wrong until someone remembered to edit
 * it — and it was wrong twice over by Aug 2026 (JTL still legal but missing,
 * ASH released but not added).
 *
 * The real rule is a fixed schedule, so we can just compute it. SWU groups
 * sets into year-batches of three — that's the rotation symbol printed on
 * every card since Jump to Lightspeed (Ⓐ = the 2025 sets, Ⓑ = the 2026 sets;
 * the first three carry no symbol, which IS their symbol). At most six sets
 * are Premier-legal, and the moment the first set of a NEW batch releases, the
 * batch from two years earlier rotates out whole — which is exactly why set 7
 * (LAW) rotated SOR, SHD and TWI out together.
 *
 * So: legal = every released set in the newest released batch, or the one
 * before it. Sets 1-3 are batch 0, 4-6 batch 1, 7-9 batch 2, and so on.
 *
 * This tracks the published schedule. An unscheduled, individually-announced
 * rotation (a ban, an errata'd set pulled early) is not modelled — that would
 * need an explicit override list, and it has never happened.
 *
 * @see https://starwarsunlimited.com/articles/updates-and-rotations
 */
const SETS_PER_ROTATION_BATCH = 3
/** The current year's batch plus the previous one. */
const LEGAL_BATCH_COUNT = 2

/** 0-indexed rotation batch (game year) a set belongs to. */
function rotationBatch(setNumber: number): number {
  return Math.floor((setNumber - 1) / SETS_PER_ROTATION_BATCH)
}

export function getPremierLegalSets(now: Date = new Date()): Set<string> {
  const released = Object.values(SET_CONFIGS).filter(c => isReleased(c, now))
  if (released.length === 0) return new Set()
  // Rotation fires on the RELEASE of a new batch's first set, so the newest
  // released set decides the window — an announced-but-unreleased set doesn't
  // rotate anything out yet.
  const newestBatch = Math.max(...released.map(c => rotationBatch(c.setNumber)))
  const oldestLegalBatch = newestBatch - (LEGAL_BATCH_COUNT - 1)
  return new Set(
    released
      .filter(c => rotationBatch(c.setNumber) >= oldestLegalBatch)
      .map(c => c.setCode as string)
  )
}

export type KarabastCardPool = 'Next Set' | 'Current' | 'Unlimited'

/**
 * The Karabast "Card Pool" to use for a drafted set:
 *  - 'Next Set'  → not yet released (beta / pre-release). Karabast files unreleased
 *                  cards under "Next Set" until release day. (When Karabast removes
 *                  that option on release, the extension should fall back to
 *                  "Current" — see the extension's card-pool selection.)
 *  - 'Current'   → released AND Premier-legal.
 *  - 'Unlimited' → released but rotated out of Premier.
 * Accepts a single code or a comma list (uses the last/primary set).
 */
export function getKarabastCardPool(setCode?: string | null, now: Date = new Date()): KarabastCardPool {
  if (!setCode) return 'Unlimited'
  const primary = setCode.includes(',') ? setCode.split(',').pop().trim() : setCode
  const config = getSetConfig(primary)
  if (config && !isReleased(config, now)) return 'Next Set'
  return getPremierLegalSets(now).has(primary) ? 'Current' : 'Unlimited'
}
