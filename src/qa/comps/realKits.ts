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
import { join } from 'node:path'
import { kitStat, summarize, treatmentOf, type KitCard, type KitStat, type Treatment } from './kitStats'
import { METRICS, type Reference } from '../../services/compsScore'

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

function toCard(r: Record<string, string>): KitCard {
  const treatment = r.variant === 'Unverified'
    ? treatmentFromNumber(parseInt(r.number || '0', 10))
    : treatmentOf(r.variant)
  const group = r.type === 'Leader' ? 'leader' : r.type === 'Base' ? 'base' : 'deck'
  return { name: r.name!, subtitle: r.subtitle, rarity: r.rarity!, group, treatment }
}

export interface RealKit { stat: KitStat, verified: boolean }

/** Every complete real kit. Throws if the transcriptions are missing. */
export function realKits(dir = REAL_BOX_DIR): RealKit[] {
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
    for (let g = 0; g < 4; g++) {
      const packs = [1, 2, 3, 4, 5, 6].map(k => byPack[g * 6 + k])
      if (packs.some(p => !p)) continue
      kits.push({ stat: kitStat(packs.flat().map(r => toCard(r!))), verified })
    }
  }
  return kits
}

/** Kit stats of every complete real kit (treatment-blind uses). */
export function realKitStats(dir = REAL_BOX_DIR): KitStat[] {
  return realKits(dir).map(k => k.stat)
}

/** The reference every site is graded against. */
export function buildReference(kits = realKits()): Reference {
  const all = summarize(kits.map(k => k.stat))
  const verified = summarize(kits.filter(k => k.verified).map(k => k.stat))
  const metrics = Object.fromEntries(METRICS.map(m =>
    [m.id, (m.verified ? verified : all).metrics[m.id]!])) as Reference['metrics']
  return { kits: all.kits, repeatsHistogram: all.repeatsHistogram, metrics }
}
