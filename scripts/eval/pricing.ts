/**
 * API pricing for eval-harness cost reporting. $/MTok.
 *
 * A model missing from the table is reported as unpriced, never guessed.
 * Cache writes are priced at
 * the 5-minute rate (1.25x input) except the 1h-TTL part, at 2x input.
 */
export interface UsageLike {
  apiCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  /** Part of cacheCreationTokens written with the 1h TTL (2x input). */
  cacheCreation1hTokens?: number
}

interface Rate {
  in: number
  out: number
  cacheRead: number
  cacheWrite5m: number
}

// Anthropic first-party list prices, checked 2026-11-12. Cache reads are
// 0.1x input (Opus 5.5 publishes $0.20 and Sonnet 5.5 $0.10 explicitly);
// 5-minute cache writes are 1.25x input. The old table quoted Opus 4.7 at
// $15/$75 (the Opus 4.1 price), which tripled every eval cost line.
const r = (inp: number, out: number, cacheRead = inp / 10): Rate => ({
  in: inp,
  out,
  cacheRead,
  cacheWrite5m: inp * 1.25,
})
const RATES: Record<string, Rate> = {
  'claude-fable-5-2': r(8, 40, 0.2),
  'claude-fable-5-1': r(10, 50),
  'claude-fable-5': r(10, 50),
  'claude-opus-5-5': r(4, 20, 0.2),
  'claude-opus-5': r(5, 25),
  'claude-opus-4-8': r(5, 25),
  'claude-opus-4-7': r(5, 25),
  'claude-sonnet-5-5': r(2, 10, 0.1),
  'claude-sonnet-5': r(2, 10),
  'claude-haiku-5-5': r(0.1, 0.5),
  'claude-haiku-4-5': r(1, 5),
  'claude-haiku-4-5-20251001': r(1, 5),
}

function costAt(u: UsageLike, r: Rate): number {
  return (
    (u.inputTokens / 1e6) * r.in +
    (u.outputTokens / 1e6) * r.out +
    (u.cacheReadTokens / 1e6) * r.cacheRead +
    ((u.cacheCreationTokens - (u.cacheCreation1hTokens || 0)) / 1e6) * r.cacheWrite5m +
    ((u.cacheCreation1hTokens || 0) / 1e6) * r.in * 2
  )
}

/** One-line token summary, e.g. "calls=14 in=5.2K out=18.1K cacheR=210K cacheW=41K". */
export function fmtTokens(u: UsageLike): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n))
  return `calls=${u.apiCalls} in=${k(u.inputTokens)} out=${k(u.outputTokens)} cacheR=${k(u.cacheReadTokens)} cacheW=${k(u.cacheCreationTokens)}`
}

/** Dollar cost of a usage total on one model; null when the rate is unknown. */
export function costUsd(model: string, u: UsageLike): number | null {
  const rate = RATES[model]
  return rate ? costAt(u, rate) : null
}

/**
 * One-line cost summary. When the usage carries a per-model split (each
 * import operation can run on its own model), every part is priced at the
 * model that served it; otherwise the whole total is priced at `model`.
 */
export function fmtCost(model: string, u: UsageLike & { byModel?: Record<string, UsageLike> }): string {
  const parts: Array<[string, UsageLike]> =
    u.byModel && Object.keys(u.byModel).length > 0 ? Object.entries(u.byModel) : [[model, u]]
  let total = 0
  const unknown: string[] = []
  for (const [m, part] of parts) {
    const c = costUsd(m, part)
    if (c == null) unknown.push(m)
    else total += c
  }
  return unknown.length === 0 ? `$${total.toFixed(3)}` : `$${total.toFixed(3)} + unpriced (${unknown.join(', ')})`
}

type WithSplit = UsageLike & { byModel?: Record<string, UsageLike> }

function addInto(total: UsageLike, u: UsageLike): void {
  total.apiCalls += u.apiCalls
  total.inputTokens += u.inputTokens
  total.outputTokens += u.outputTokens
  total.cacheReadTokens += u.cacheReadTokens
  total.cacheCreationTokens += u.cacheCreationTokens
  total.cacheCreation1hTokens = (total.cacheCreation1hTokens || 0) + (u.cacheCreation1hTokens || 0)
}

const zero = (): UsageLike => ({ apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 })

/** Sum usage totals, keeping the per-model split when every part has one. */
export function sumUsage(list: Array<WithSplit | undefined>): WithSplit {
  const total: WithSplit = { ...zero(), byModel: {} }
  let split = true
  for (const u of list) {
    if (!u) continue
    addInto(total, u)
    if (!u.byModel || Object.keys(u.byModel).length === 0) split = false
    else for (const [m, part] of Object.entries(u.byModel)) addInto((total.byModel![m] ??= zero()), part)
  }
  if (!split) delete total.byModel
  return total
}
