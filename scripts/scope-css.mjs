#!/usr/bin/env node
/**
 * Scope every rule in a stylesheet to one audience so alpha-era CSS and the
 * legacy CSS it replaced can both ship without touching each other.
 *
 *   node scripts/scope-css.mjs <in.css> <out.css> alpha   → :where(html.ptp-alpha) …
 *   node scripts/scope-css.mjs <in.css> <out.css> legacy  → :where(html:not(.ptp-alpha)) …
 *
 * `:root`/`html` become the scope itself; `body` is nested under it.
 * Rules inside @keyframes are left alone.
 */
import fs from 'node:fs'
import postcss from 'postcss'

const [input, output, audience] = process.argv.slice(2)
if (!input || !output || !['alpha', 'legacy'].includes(audience)) {
  console.error('usage: scope-css.mjs <in.css> <out.css> alpha|legacy')
  process.exit(1)
}
// :where() adds zero specificity, so the cascade is exactly what it was unscoped.
const scope = audience === 'alpha' ? ':where(html.ptp-alpha)' : ':where(html:not(.ptp-alpha))'

function scopeSelector(sel) {
  const s = sel.trim()
  if (/^(:root|html)\b/.test(s)) return s.replace(/^(:root|html)/, scope)
  return `${scope} ${s}`
}

const root = postcss.parse(fs.readFileSync(input, 'utf8'), { from: input })
root.walkRules(rule => {
  if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
  rule.selectors = rule.selectors.map(scopeSelector)
})
const header = `/* ${audience === 'alpha' ? 'Alpha-only' : 'Legacy (non-alpha)'} styles: every selector is scoped under ${scope}.\n * Scoped by scripts/scope-css.mjs; keep any new rule under the same prefix. */\n`
fs.writeFileSync(output, header + root.toString())
console.log(`scoped ${input} → ${output} (${audience})`)
