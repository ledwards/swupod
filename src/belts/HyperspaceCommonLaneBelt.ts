// @ts-nocheck
/**
 * HyperspaceCommonLaneBelt
 *
 * A lane-preserving hyperspace common belt. It uses the same constrained
 * construction as the normal CommonBelt, but pulls Hyperspace variants
 * instead of Normal variants.
 *
 * Use this when a specific common lane upgrades to Hyperspace and we need
 * to preserve the underlying printer/belt structure for that lane.
 */

import type { SetCode } from '../types'
import { CommonBelt, type BeltId } from './CommonBelt'

export class HyperspaceCommonLaneBelt extends CommonBelt {
  constructor(setCode: SetCode | string, beltId: BeltId) {
    super(setCode, beltId, 'Hyperspace')
  }
}
