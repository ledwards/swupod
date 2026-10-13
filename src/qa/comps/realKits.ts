/**
 * Six-pack kits from the transcribed real ASH boxes — the reference every
 * simulator is graded against.
 *
 * Kits are box positions 1-6, 7-12, 13-18, 19-24 (consumer order). A kit with
 * a missing pack is skipped, never padded.
 *
 * Boxes 008-011 were title-read (~97% 'Unverified' rows) and lose card
 * treatment, so a kit is `verified` only when its box has ≤10% Unverified
 * rows. Treatment metrics use verified kits only; treatment-blind ones use all.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { getCachedCards } from '../../utils/cardCache'
import { join } from 'node:path'
import { kitStat, moment, summarize, treatmentOf, type KitCard, type KitStat, type Treatment } from './kitStats'
import { METRICS, type MetricId, type Reference } from '../../services/compsScore'

export const REAL_BOX_DIR = join(import.meta.dirname, '..', '..', '..', 'data', 'real-boxes')

/** Minimal CSV reader — transcriptions quote fields that contain commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim())
  const header = lines[0]!.split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const cells: string[] = []
    let cur = '', quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = (cells[i] || '').trim() })
    return row
  })
}

export function realBoxFiles(dir = REAL_BOX_DIR): string[] {
  return readdirSync(dir).filter(f => /^ash-box-\d+\.csv$/.test(f)).sort()
}

/** ASH collector-number ranges decode treatment for title-read rows. */
function treatmentFromNumber(n: number): Treatment {
  if (n <= 264) return 'Normal'
  if (n <= 528) return 'Hyperspace'
  if (n <= 766) return 'Hyperspace Foil'
  if (n <= 784) return 'Showcase'
  return 'Prestige'
}

let aspectByIdentity: Map<string, string> | null = null
function aspectOf(r: Record<string, string>): string {
  if (!aspectByIdentity) {
    aspectByIdentity = new Map(getCachedCards('ASH')
      .filter(c => (c.variantType || 'Normal') === 'Normal')
      .map(c => [`${c.name}|${c.subtitle || ''}`, c.aspects?.[0] || 'Neutral']))
  }
  return aspectByIdentity.get(`${r.name}|${r.subtitle || ''}`) ?? (r.aspects?.split('/')[0] || 'Neutral')
}

function toCard(r: Record<string, string>, pack?: number): KitCard {
  const treatment = r.variant === 'Unverified'
    ? treatmentFromNumber(parseInt(r.number || '0', 10))
    : treatmentOf(r.variant)
  const group = r.type === 'Leader' ? 'leader' : r.type === 'Base' ? 'base' : 'deck'
  return { name: r.name!, subtitle: r.subtitle, rarity: r.rarity!, group, treatment, pack, aspect: aspectOf(r) }
}

/** `window` is the kit's index in its box: 0 for positions 1-6 (or 1-8), and so on. */
export interface RealKit { stat: KitStat, verified: boolean, window: number }

/**
 * Every complete real kit of `kitPacks` consecutive box positions (six:
 * 1-6, 7-12, ...; eight: 1-8, 9-16, 17-24). Throws if the transcriptions
 * are missing.
 */
export function realKits(dir = REAL_BOX_DIR, kitPacks = 6): RealKit[] {
  const files = realBoxFiles(dir)
  if (!files.length) throw new Error(`No real ASH boxes in ${dir}`)
  const kits: RealKit[] = []
  for (const file of files) {
    const rows = parseCsv(readFileSync(join(dir, file), 'utf8'))
    const verified = rows.filter(r => r.variant === 'Unverified').length <= rows.length * 0.1
    const byPack: Record<number, Record<string, string>[]> = {}
    for (const r of rows) {
      const p = parseInt(r.pack!, 10)
      if (p) (byPack[p] = byPack[p] || []).push(r)
    }
    for (let g = 0; g < Math.floor(24 / kitPacks); g++) {
      const packs = Array.from({ length: kitPacks }, (_, k) => byPack[g * kitPacks + k + 1])
      if (packs.some(p => !p)) continue
      kits.push({ stat: kitStat(packs.flatMap((p, i) => p!.map(r => toCard(r, i)))), verified, window: g })
    }
  }
  return kits
}

/** Kit stats of every complete real kit (treatment-blind uses). */
export function realKitStats(dir = REAL_BOX_DIR): KitStat[] {
  return realKits(dir).map(k => k.stat)
}

/**
 * The reference every site is graded against. `computed` replaces a metric's
 * mean with a rate calculated from the strips (sharper than the opened-box
 * sample); its spread stays the real boxes', so the tolerance is unchanged.
 */
export function buildReference(kits = realKits(), computed: Partial<Record<MetricId, number>> = {}): Reference {
  const all = summarize(kits.map(k => k.stat))
  const verified = summarize(kits.filter(k => k.verified).map(k => k.stat))
  const metrics = Object.fromEntries(METRICS.map(m => {
    const real = (m.verified ? verified : all).metrics[m.id]!
    const mean = computed[m.id]
    return [m.id, mean === undefined ? real : { ...real, mean: Number(mean.toFixed(4)) }]
  })) as Reference['metrics']
  const repeats8 = moment(realKits(REAL_BOX_DIR, 8).map(k => k.stat.repeats))
  return { kits: all.kits, repeatsHistogram: all.repeatsHistogram, metrics, repeats8 }
}
