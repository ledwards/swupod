// Unit tests for the banned design tells checker (D2, design refresh plan).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  scanCss,
  evaluate,
  planUpdate,
  readBaseline,
  scanTree,
  type Baseline,
} from './check-design-tells'

function countsOf(css: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const violation of scanCss(css)) {
    counts[violation.rule] = (counts[violation.rule] ?? 0) + 1
  }
  return counts
}

describe('design-tells rules', () => {
  it('flags side-stripe accents (baseline-0 rule)', () => {
    assert.deepEqual(countsOf('.a { border-left: 3px solid #ff0000; }'), {
      'side-stripe': 1,
      'raw-hex': 1,
    })
    assert.deepEqual(countsOf('.a { border-left: 1px solid transparent; }'), {})
  })

  it('flags ALL-CAPS text-transform (Title-Case Rule)', () => {
    assert.deepEqual(countsOf('.a { text-transform: uppercase; }'), { uppercase: 1 })
    assert.deepEqual(countsOf('.a { text-transform: none; }'), {})
  })

  it('flags every raw 6- and 8-digit hex, once per occurrence', () => {
    const css = '.a { color: #60a5fa; border: 1px solid #FFFFFF4D; background: #123abc; }'
    assert.deepEqual(countsOf(css), { 'raw-hex': 3 })
  })

  it('flags overshoot cubic-bezier but not in-range easing', () => {
    assert.deepEqual(countsOf('.a { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }'), {
      'bounce-easing': 1,
    })
    assert.deepEqual(countsOf('.a { transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1); }'), {})
  })

  it('flags linear-gradient resting fills', () => {
    assert.deepEqual(countsOf('.a { background: linear-gradient(180deg, #111111, #222222); }'), {
      'gradient-fill': 1,
      'raw-hex': 2,
    })
  })

  it('honors the same-line design-ok escape for all rules', () => {
    const css = '.a { color: #60a5fa; text-transform: uppercase; } /* design-ok: set-code acronym */'
    assert.deepEqual(countsOf(css), {})
  })

  it('ignores violations inside CSS comments (but keeps line numbers)', () => {
    const css = '/* old idea:\n   color: #60a5fa;\n*/\n.a { color: #ef4444; }'
    const violations = scanCss(css)
    assert.equal(violations.length, 1)
    assert.equal(violations[0]!.rule, 'raw-hex')
    assert.equal(violations[0]!.line, 4)
  })
})

describe('evaluate (monotonic per-file baselines)', () => {
  const baseline: Baseline = { 'raw-hex': { 'src/components/A.css': 2 } }

  it('passes when counts match the baseline', () => {
    const result = evaluate({ 'raw-hex': { 'src/components/A.css': 2 } }, baseline)
    assert.equal(result.ok, true)
  })

  it('fails when a file exceeds its baseline, naming file and rule', () => {
    const result = evaluate({ 'raw-hex': { 'src/components/A.css': 3 } }, baseline)
    assert.equal(result.ok, false)
    assert.match(result.messages.join('\n'), /raw-hex/)
    assert.match(result.messages.join('\n'), /A\.css/)
  })

  it('fails on a NEW file with violations (no baseline entry)', () => {
    const result = evaluate(
      { 'raw-hex': { 'src/components/A.css': 2, 'src/components/New.css': 1 } },
      baseline
    )
    assert.equal(result.ok, false)
    assert.match(result.messages.join('\n'), /New\.css/)
  })

  it('fails demanding --update when a file drops below baseline (commit the win)', () => {
    const result = evaluate({ 'raw-hex': { 'src/components/A.css': 1 } }, baseline)
    assert.equal(result.ok, false)
    assert.match(result.messages.join('\n'), /--update/)
  })
})

describe('planUpdate (monotonic --update)', () => {
  const baseline: Baseline = { 'raw-hex': { 'src/components/A.css': 2 } }

  it('permits decreases', () => {
    const plan = planUpdate({ 'raw-hex': { 'src/components/A.css': 1 } }, baseline)
    assert.equal(plan.ok, true)
    const written = JSON.parse(plan.content!)
    assert.equal(written.rules['raw-hex']['src/components/A.css'], 1)
  })

  it('REFUSES increases — the escape is the design-ok comment, not --update', () => {
    const plan = planUpdate({ 'raw-hex': { 'src/components/A.css': 3 } }, baseline)
    assert.equal(plan.ok, false)
    assert.equal(plan.content, undefined)
    assert.match(plan.message, /design-ok/)
  })

  it('refuses increases even when other files improved (no net-zero laundering)', () => {
    const wide: Baseline = { 'raw-hex': { 'a.css': 2, 'b.css': 2 } }
    const plan = planUpdate({ 'raw-hex': { 'a.css': 0, 'b.css': 3 } }, wide)
    assert.equal(plan.ok, false)
    assert.match(plan.message, /b\.css/)
  })
})

describe('repo state (the actual ratchet)', () => {
  it('current tree matches the committed baseline', () => {
    const { counts } = scanTree()
    const baseline = readBaseline()
    const result = evaluate(counts, baseline)
    assert.equal(result.ok, true, result.messages.join('\n'))
  })

  it('the side-stripe and bounce-easing baselines are ZERO (fully-paid debt stays paid)', () => {
    const baseline = readBaseline()
    assert.deepEqual(baseline['side-stripe'] ?? {}, {}, 'side-stripes must stay at zero')
    assert.deepEqual(baseline['bounce-easing'] ?? {}, {}, 'bounce easing must stay at zero')
  })
})
