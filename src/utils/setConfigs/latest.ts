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
 * Sets currently legal in SWU Premier → Karabast "Current" pool. Premier rotation
 * is an announced event (NOT date-derivable), so this explicit list is the source
 * of truth. UPDATE IT when a set rotates into / out of Premier.
 * (Today: LOF, SEC, LAW are Premier; SOR–JTL have rotated to Unlimited; ASH is
 * pre-release → "Next Set" until its release date.)
 */
export const PREMIER_LEGAL_SETS = new Set(['LOF', 'SEC', 'LAW'])

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
export function getKarabastCardPool(setCode?: string | null): KarabastCardPool {
  if (!setCode) return 'Unlimited'
  const primary = setCode.includes(',') ? setCode.split(',').pop().trim() : setCode
  const config = getSetConfig(primary)
  if (config && !isReleased(config)) return 'Next Set'
  return PREMIER_LEGAL_SETS.has(primary) ? 'Current' : 'Unlimited'
}
