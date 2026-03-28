// @ts-nocheck
// src/utils/setConfigs/latest.ts
import { SET_CONFIGS, isReleased } from './index'

/**
 * Returns the set code with the highest setNumber among all released sets.
 * Used to determine whether to use Karabast Card Pool "Current" or "Unlimited".
 */
export function getLatestReleasedSetCode(): string {
  const released = Object.values(SET_CONFIGS).filter(isReleased)
  if (released.length === 0) {
    return Object.values(SET_CONFIGS)
      .sort((a, b) => b.setNumber - a.setNumber)[0].setCode as string
  }
  return released.sort((a, b) => b.setNumber - a.setNumber)[0].setCode as string
}
