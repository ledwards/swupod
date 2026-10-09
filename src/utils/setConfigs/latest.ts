// @ts-nocheck
// src/utils/setConfigs/latest.ts
import { SET_CONFIGS, isReleased, isCurrentPoolSet, getSetConfig } from './index'

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
 * Premier sets in Play's Current pool. A core set enters at prerelease.
 * Rotation keeps the newest three-set batch and the preceding batch; previews
 * do not rotate older sets out before that cutoff. Only numbered core sets
 * participate, so supplemental products cannot advance rotation.
 */
const SETS_PER_ROTATION_BATCH = 3
/** The current year's batch plus the previous one. */
const LEGAL_BATCH_COUNT = 2

/** 0-indexed rotation batch (game year) a set belongs to. */
function rotationBatch(setNumber: number): number {
  return Math.floor((setNumber - 1) / SETS_PER_ROTATION_BATCH)
}

export function getPremierLegalSets(now: Date = new Date()): Set<string> {
  const released = Object.values(SET_CONFIGS).filter(c => isCurrentPoolSet(c, now))
  if (released.length === 0) return new Set()
  // Rotation fires on the PRERELEASE of a new batch's first set, so the newest
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
 * Next Set before prerelease; Current from prerelease while Premier-legal;
 * Unlimited after rotation. A comma list uses its last/primary set.
 */
export function getKarabastCardPool(setCode?: string | null, now: Date = new Date()): KarabastCardPool {
  if (!setCode) return 'Unlimited'
  const primary = setCode.includes(',') ? setCode.split(',').pop().trim() : setCode
  const config = getSetConfig(primary)
  if (config && !isCurrentPoolSet(config, now)) return 'Next Set'
  return getPremierLegalSets(now).has(primary) ? 'Current' : 'Unlimited'
}
