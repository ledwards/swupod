// Compare ACTUAL production pack pulls against the precomputed THEORY artifact
// and write a human-readable fidelity report.
//
// Usage (you run this — it talks to a database):
//   npx tsx scripts/comparePackActuals.ts                # uses .env (prod)
//   FIDELITY_ENV=dev npx tsx scripts/comparePackActuals.ts   # uses .env.local (dev)
//   FIDELITY_DATABASE_URL=postgres://... npx tsx scripts/comparePackActuals.ts
//
// Reads:  src/data/packTheory.json   (from `npm run compute-theory`)
// Writes: docs/PACK_FIDELITY_REPORT.md
//
// It tallies, per set, every booster card by rarity, aspect category, and
// variant treatment, then runs the CLT z-test in src/services/packFidelity.ts.
// The variant mapping from the DB `treatment` column is best-effort; the report
// prints the raw distinct treatment values it saw so the mapping can be verified.

import pg from 'pg'
import { parse } from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { classifyAspect } from '../src/services/expectedDistribution'
import { compareDimension, dimensionHasDivergence, type FidelityVerdict, type TheoryBucket } from '../src/services/packFidelity'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const THEORY_PATH = join(ROOT, 'src', 'data', 'packTheory.json')
const REPORT_PATH = join(ROOT, 'docs', 'PACK_FIDELITY_REPORT.md')

function readEnvFile(name: string): Record<string, string> {
  const p = join(ROOT, name)
  return existsSync(p) ? parse(readFileSync(p)) : {}
}

function resolveDbUrl(): { url: string; label: string } {
  if (process.env.FIDELITY_DATABASE_URL) return { url: process.env.FIDELITY_DATABASE_URL, label: 'FIDELITY_DATABASE_URL' }
  if (process.env.FIDELITY_ENV === 'dev') {
    const e = readEnvFile('.env.local')
    if (e.DATABASE_URL) return { url: e.DATABASE_URL, label: '.env.local (dev)' }
  }
  const e = readEnvFile('.env')
  const url = e.PROD_DATABASE_URL || e.DATABASE_URL
  if (url) return { url, label: '.env (prod)' }
  throw new Error('No database URL found. Set FIDELITY_DATABASE_URL, or put DATABASE_URL in .env / .env.local.')
}

// Map the DB treatment/showcase columns onto the theory variant buckets. Best
// effort — verify against the printed distinct values.
function variantBucket(treatment: string | null, isShowcase: boolean): string | null {
  if (isShowcase) return 'showcase'
  const t = (treatment || '').toLowerCase()
  if (t.includes('prestige')) return 'prestige'
  if (t.includes('showcase')) return 'showcase'
  if (t.includes('hyperspace') && t.includes('foil')) return 'hyperspaceFoil'
  if (t.includes('hyperspace')) return 'hyperspace'
  if (t.includes('foil')) return 'foil'
  return null // normal
}

function fmtPct(x: number): string {
  if (!Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(1)}%`
}
function fmtNum(x: number, dp = 3): string {
  return Number.isFinite(x) ? x.toFixed(dp) : '—'
}
const LABEL_ICON: Record<string, string> = {
  aligned: '✅ aligned',
  minor: '🟡 minor',
  notable: '🔴 notable',
  'deterministic-mismatch': '⛔ mismatch',
}

function dimensionTable(title: string, verdicts: FidelityVerdict[]): string {
  const rows = verdicts
    .filter((v) => v.expectedTotal > 0 || v.actualTotal > 0)
    .sort((a, b) => b.expectedPerPack - a.expectedPerPack)
    .map((v) => {
      const z = v.z == null ? '—' : fmtNum(v.z, 2)
      const p = v.pValue == null ? '—' : (v.pValue < 0.001 ? '<0.001' : v.pValue.toFixed(3))
      return `| ${v.bucket} | ${fmtNum(v.expectedPerPack)} | ${fmtNum(v.actualPerPack)} | ${fmtPct(v.relDev)} | ${z} | ${p} | ${LABEL_ICON[v.label]} |`
    })
    .join('\n')
  return `**${title}** (per pack)\n\n| Bucket | Theory | Actual | Δ% | z | p | Verdict |\n|---|--:|--:|--:|--:|--:|---|\n${rows}\n`
}

async function main() {
  if (!existsSync(THEORY_PATH)) throw new Error(`Missing ${THEORY_PATH}. Run: npm run compute-theory`)
  const theory = JSON.parse(readFileSync(THEORY_PATH, 'utf8'))
  const { url, label } = resolveDbUrl()
  console.log(`Theory: collation v${theory.collationVersion}, ${theory.podsPerSet} pods/set`)
  console.log(`Database: ${label}`)

  // Local Postgres doesn't speak SSL; remote (Railway) requires it.
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(url) || /^postgres(ql)?:\/\/(localhost|127\.0\.0\.1)/.test(url)
  const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } })
  await client.connect()

  const sections: string[] = []
  const treatmentsSeen = new Set<string>()
  let analysedSets = 0

  for (const setCode of Object.keys(theory.sets)) {
    const t = theory.sets[setCode]

    // Pack count: distinct (source_id, pack_index); fall back to rows/16 when
    // pack_index is null on legacy rows (same logic as the luck route).
    const cnt = await client.query(
      `SELECT
         COUNT(*)::int AS rows,
         COUNT(DISTINCT (source_id::text || '#' || COALESCE(pack_index::text,'x')))::int AS distinct_packs
       FROM card_generations WHERE set_code = $1 AND pack_type = 'booster'`,
      [setCode],
    )
    const rows = cnt.rows[0]?.rows ?? 0
    if (rows === 0) continue
    const packs = Math.max(cnt.rows[0].distinct_packs || 0, Math.round(rows / 16))
    analysedSets++

    const rarityRows = await client.query(
      `SELECT rarity, COUNT(*)::int n FROM card_generations WHERE set_code=$1 AND pack_type='booster' GROUP BY rarity`,
      [setCode],
    )
    const rarityActual: Record<string, number> = {}
    for (const r of rarityRows.rows) if (r.rarity) rarityActual[r.rarity] = r.n

    const aspectRows = await client.query(
      `SELECT aspects, COUNT(*)::int n FROM card_generations WHERE set_code=$1 AND pack_type='booster' GROUP BY aspects`,
      [setCode],
    )
    const aspectActual: Record<string, number> = {}
    for (const r of aspectRows.rows) {
      const cat = classifyAspect({ aspects: r.aspects || [] } as never)
      aspectActual[cat] = (aspectActual[cat] || 0) + r.n
    }

    const variantRows = await client.query(
      `SELECT treatment, COALESCE(is_showcase,false) AS is_showcase, COUNT(*)::int n
       FROM card_generations WHERE set_code=$1 AND pack_type='booster' GROUP BY treatment, is_showcase`,
      [setCode],
    )
    const variantActual: Record<string, number> = {}
    for (const r of variantRows.rows) {
      treatmentsSeen.add(`${r.treatment ?? 'null'}${r.is_showcase ? ' +showcase' : ''}`)
      const b = variantBucket(r.treatment, r.is_showcase)
      if (b) variantActual[b] = (variantActual[b] || 0) + r.n
    }

    const rarityV = compareDimension(t.rarity as Record<string, TheoryBucket>, rarityActual, packs)
    const aspectV = compareDimension(t.aspect as Record<string, TheoryBucket>, aspectActual, packs)
    const variantV = compareDimension(t.variant as Record<string, TheoryBucket>, variantActual, packs)

    const flags = [rarityV, aspectV, variantV].filter(dimensionHasDivergence).length
    const header = `### ${setCode} — ${packs.toLocaleString()} packs (${rows.toLocaleString()} cards)${flags ? ` — ⚠️ ${flags} dimension(s) diverge` : ' — ✅ matches theory'}`
    sections.push(
      [header, '', dimensionTable('Rarity', rarityV), dimensionTable('Aspect', aspectV), dimensionTable('Variant', variantV)].join('\n'),
    )
    console.log(`  ${setCode}: ${packs} packs, ${flags} diverging dimension(s)`)
  }

  await client.end()

  const md = [
    '# Pack Fidelity Report — Theory vs. Production',
    '',
    `_Generated ${new Date().toISOString()} from \`${label}\`._`,
    '',
    `Theory: Monte-Carlo of the live generator, **collation v${theory.collationVersion}**, ${theory.podsPerSet.toLocaleString()} pods/set (${(theory.podsPerSet * theory.packsPerPod).toLocaleString()} packs/set), generated ${theory.generatedAt}.`,
    '',
    '## Method',
    '',
    'Each booster card pulled in production is tallied by **rarity**, **aspect** (color category), and **variant treatment**, then compared per-pack against theory. Because the collation system produces *constrained, sub-Poisson* counts (exactly 16 cards/pack, one leader, without-replacement hoppers), a chi-square test would misstate significance. Instead we use the Monte-Carlo per-pack standard deviation and the Central Limit Theorem: over *M* packs the observed total is ≈ Normal(mean·M, (sd·√M)²), and **z = (observed − mean·M) / (sd·√M)**.',
    '',
    'Verdicts: **✅ aligned** (p ≥ 0.01), **🟡 minor** (significant but <5% effect — expected at large N), **🔴 notable** (significant *and* ≥5% per-pack deviation), **⛔ mismatch** (a deterministic slot off by ≥1%).',
    '',
    '## How to read it — important caveats',
    '',
    '- **Version skew is the biggest confound.** Production rows span the app\'s entire history and were generated under *earlier* collation versions, while theory is the *current* algorithm (v' + theory.collationVersion + '). A divergence can mean the live collation differs from what older packs were cut under — not that today\'s generator is wrong. The clearest example: a brand-new slot (e.g. LAW prestige, ~1/18 in theory) reads as **−100%** because the production history predates it (note whether `prestige` even appears in the treatment list above). To judge the *current* algorithm, re-run filtered to packs generated since the last collation change.',
    '- **Aspect gaps reflect card-data drift.** Theory classifies each generated card by its `cards.json` aspects; actuals classify each row by the aspects stored *at generation time*. A systematic Neutral/Multicolor gap means that stored aspect data differs from today\'s catalog, not that the wheel is mis-weighted.',
    '- **Large N makes trivial gaps significant.** Sets like LAW (tens of thousands of packs) flag sub-1% deltas as statistically significant; that is why the effect-size gate exists — trust the 🔴 **notable** rows, treat 🟡 **minor** as essentially aligned.',
    '- **Small N is underpowered.** Pre-release sets (few packs) will mostly read aligned for lack of data, not for fidelity.',
    '',
    `Sets analysed: **${analysedSets}**.`,
    '',
    '## Distinct DB treatment values seen',
    '',
    'Verify the variant mapping (`scripts/comparePackActuals.ts` → `variantBucket`) against these:',
    '',
    '```',
    Array.from(treatmentsSeen).sort().join('\n') || '(none)',
    '```',
    '',
    '## Per-set comparison',
    '',
    ...sections,
  ].join('\n')

  writeFileSync(REPORT_PATH, md + '\n')
  console.log(`\nWrote ${REPORT_PATH} (${analysedSets} sets analysed)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
