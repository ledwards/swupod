// @ts-nocheck
import { getCardMetadata } from './cardData'
import { getSetConfig, isBeta, isReleased } from './setConfigs/index'

interface SessionLike {
  is_beta_tester?: boolean
  is_admin?: boolean
}

export function baseSetCode(setCode: string): string {
  return String(setCode || '').replace('-CB', '').trim()
}

export function getSetCatalogMetadata(setCode: string): Record<string, any> | null {
  const metadata = getCardMetadata()
  const sets = Array.isArray(metadata?.sets) ? metadata.sets : []
  return sets.find((set: Record<string, any>) => set.code === baseSetCode(setCode)) || null
}

export function getRealCardCountForSet(setCode: string): number {
  const setMetadata = getSetCatalogMetadata(setCode)
  if (!setMetadata) return 0
  return Number(setMetadata.realCardCount ?? setMetadata.cardCount ?? 0)
}

export function hasSpoiledCardsForSet(setCode: string): boolean {
  return getRealCardCountForSet(setCode) > 0
}

export function hasBetaSetAccess(session: SessionLike | null | undefined): boolean {
  return Boolean(session?.is_beta_tester || session?.is_admin)
}

export function getUnavailableSetReason(setCode: string, session?: SessionLike | null): string | null {
  const codes = String(setCode || '')
    .split(',')
    .map(code => baseSetCode(code))
    .filter(Boolean)

  for (const code of codes) {
    const config = getSetConfig(code)

    // An unreleased set is scaffolded (config, belts, art) long before swuapi
    // has a single card for it, so it can be selectable-in-principle while
    // being unopenable in practice. Gate on real spoiled cards, not on a
    // hardcoded set code — this used to name ASH literally, which meant every
    // new set silently shipped a pack-generation crash until someone
    // remembered to add its branch.
    if (config && !isReleased(config) && !hasSpoiledCardsForSet(code)) {
      return `${code} is not available until the first spoiler sync completes.`
    }

    if (config && isBeta(config) && !hasBetaSetAccess(session)) {
      return `${code} requires beta access before prerelease.`
    }
  }

  return null
}

export function isSetAvailableForSession(setCode: string, session?: SessionLike | null): boolean {
  return getUnavailableSetReason(setCode, session) === null
}
